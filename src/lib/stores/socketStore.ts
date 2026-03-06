import { browser } from '$app/environment';
import { env } from '$env/dynamic/public';
import { writable } from 'svelte/store';
import { io, type Socket } from 'socket.io-client';
import type {
	Announcement,
	QueueSocketEvent,
	QueueTicket,
	ServiceConfig,
	SocketConnectionState
} from '$lib/types';
import {
	callNext,
	completeCurrent,
	markServing,
	recallCurrent,
	skipCurrent,
	syncQueueCalled,
	syncQueueCompleted,
	syncQueueServing,
	syncQueueSkipped,
	syncQueueTaken,
	takeNumber,
	transferCurrent
} from '$lib/stores/queueStore';
import {
	assignQueueToCounter,
	releaseCounter,
	setCounterStatus,
	syncCounterUpdate
} from '$lib/stores/counterStore';
import { setAnnouncements } from '$lib/stores/configStore';

const SOCKET_EVENTS: QueueSocketEvent['type'][] = [
	'queue_called',
	'queue_completed',
	'queue_skipped',
	'counter_update',
	'queue_taken',
	'announcement_update'
];
const RECONNECT_INTERVAL_MS = 3000;
const CHANNEL_NAME = 'queue-system-broadcast-v1';
const SOCKET_URL = (env.PUBLIC_SOCKET_URL ?? '').trim();

const CLIENT_ID =
	typeof crypto !== 'undefined' && 'randomUUID' in crypto
		? crypto.randomUUID()
		: `client-${Math.random().toString(36).slice(2)}`;

export const connectionState = writable<SocketConnectionState>('connecting');
export const lastSocketEvent = writable<QueueSocketEvent | null>(null);

let socket: Socket | null = null;
let channel: BroadcastChannel | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let started = false;

function clearReconnectTimer(): void {
	if (!reconnectTimer) return;
	clearTimeout(reconnectTimer);
	reconnectTimer = null;
}

function scheduleReconnect(): void {
	if (reconnectTimer || !socket) return;

	reconnectTimer = setTimeout(() => {
		reconnectTimer = null;
		if (!socket) return;
		connectionState.set('connecting');
		socket.connect();
	}, RECONNECT_INTERVAL_MS);
}

function parseIncomingSocketEvent(
	type: QueueSocketEvent['type'],
	payload: Record<string, unknown>
): QueueSocketEvent {
	const { clientId, _clientId, ...cleanPayload } = payload;
	const incomingClientId = (clientId ?? _clientId) as string | undefined;

	return {
		type,
		payload: cleanPayload as unknown as QueueSocketEvent['payload'],
		clientId: incomingClientId
	} as QueueSocketEvent;
}

function applyIncomingEvent(event: QueueSocketEvent): void {
	if (event.clientId && event.clientId === CLIENT_ID) return;

	lastSocketEvent.set(event);

	switch (event.type) {
		case 'queue_called':
			syncQueueCalled(event.payload);
			syncCounterUpdate({
				counter: event.payload.counter,
				status: 'calling',
				queue: event.payload.queue,
				serviceId: event.payload.serviceId,
				service: event.payload.service
			});
			break;
		case 'queue_completed':
			syncQueueCompleted(event.payload);
			syncCounterUpdate({
				counter: event.payload.counter,
				status: 'idle',
				queue: null,
				serviceId: null,
				service: null
			});
			break;
		case 'queue_skipped':
			syncQueueSkipped(event.payload);
			syncCounterUpdate({
				counter: event.payload.counter,
				status: 'idle',
				queue: null,
				serviceId: null,
				service: null
			});
			break;
		case 'counter_update':
			syncCounterUpdate(event.payload);
			if (event.payload.status === 'serving') {
				syncQueueServing(event.payload.counter);
			}
			break;
		case 'queue_taken':
			syncQueueTaken(event.payload);
			break;
		case 'announcement_update':
			setAnnouncements(event.payload.announcements);
			break;
	}
}

function emitEvent(event: Omit<QueueSocketEvent, 'clientId'>): void {
	const outgoingEvent: QueueSocketEvent = {
		...event,
		clientId: CLIENT_ID
	} as QueueSocketEvent;

	lastSocketEvent.set(outgoingEvent);

	if (channel) {
		channel.postMessage(outgoingEvent);
	}

	if (socket?.connected) {
		socket.emit(event.type, {
			...event.payload,
			clientId: CLIENT_ID
		});
	}
}

function connectRemoteSocket(): void {
	if (!SOCKET_URL) {
		connectionState.set('connected');
		return;
	}

	if (socket) return;

	connectionState.set('connecting');
	socket = io(SOCKET_URL, {
		autoConnect: false,
		reconnection: false,
		transports: ['websocket']
	});

	socket.on('connect', () => {
		clearReconnectTimer();
		connectionState.set('connected');
	});

	socket.on('disconnect', () => {
		connectionState.set('reconnecting');
		scheduleReconnect();
	});

	socket.on('connect_error', () => {
		connectionState.set('reconnecting');
		scheduleReconnect();
	});

	for (const eventType of SOCKET_EVENTS) {
		socket.on(eventType, (payload: Record<string, unknown>) => {
			applyIncomingEvent(parseIncomingSocketEvent(eventType, payload));
		});
	}

	socket.connect();
}

function initLocalBroadcast(): void {
	if (channel) return;
	channel = new BroadcastChannel(CHANNEL_NAME);
	channel.onmessage = (message) => {
		applyIncomingEvent(message.data as QueueSocketEvent);
	};
}

export function startSocket(): () => void {
	if (!browser) return () => {};
	if (started) return () => {};
	started = true;

	initLocalBroadcast();
	connectRemoteSocket();

	return () => {
		// Keep active across client navigation.
	};
}

export function stopSocket(): void {
	clearReconnectTimer();
	started = false;

	if (channel) {
		channel.close();
		channel = null;
	}

	if (socket) {
		socket.removeAllListeners();
		socket.close();
		socket = null;
	}

	connectionState.set('disconnected');
}

function queueTicketToCalledEvent(ticket: QueueTicket, counterId: number): QueueSocketEvent {
	return {
		type: 'queue_called',
		payload: {
			queue: ticket.queue,
			counter: counterId,
			serviceId: ticket.serviceId,
			service: ticket.serviceName
		}
	};
}

function queueTicketToCounterEvent(
	ticket: QueueTicket | null,
	counterId: number,
	status: 'idle' | 'calling' | 'serving' | 'offline'
): QueueSocketEvent {
	return {
		type: 'counter_update',
		payload: {
			counter: counterId,
			status,
			queue: ticket?.queue ?? null,
			serviceId: ticket?.serviceId ?? null,
			service: ticket?.serviceName ?? null
		}
	};
}

export function operatorCallNext(counterId: number, preferredServiceId?: string): QueueTicket | null {
	const ticket = callNext(counterId, preferredServiceId);
	if (!ticket) return null;

	assignQueueToCounter(counterId, ticket.queue, ticket.serviceId, ticket.serviceName, 'calling');
	emitEvent(queueTicketToCalledEvent(ticket, counterId));
	emitEvent(queueTicketToCounterEvent(ticket, counterId, 'calling'));

	return ticket;
}

export function operatorRecall(counterId: number): QueueTicket | null {
	const ticket = recallCurrent(counterId);
	if (!ticket) return null;

	setCounterStatus(counterId, 'calling');
	emitEvent(queueTicketToCalledEvent(ticket, counterId));
	emitEvent(queueTicketToCounterEvent(ticket, counterId, 'calling'));

	return ticket;
}

export function operatorStartServing(counterId: number): QueueTicket | null {
	const ticket = markServing(counterId);
	if (!ticket) return null;

	setCounterStatus(counterId, 'serving');
	emitEvent(queueTicketToCounterEvent(ticket, counterId, 'serving'));

	return ticket;
}

export function operatorComplete(counterId: number): QueueTicket | null {
	const ticket = completeCurrent(counterId);
	if (!ticket) return null;

	releaseCounter(counterId, 'idle');
	emitEvent({
		type: 'queue_completed',
		payload: {
			queue: ticket.queue,
			counter: counterId
		}
	});
	emitEvent(queueTicketToCounterEvent(null, counterId, 'idle'));

	return ticket;
}

export function operatorSkip(counterId: number): QueueTicket | null {
	const ticket = skipCurrent(counterId);
	if (!ticket) return null;

	releaseCounter(counterId, 'idle');
	emitEvent({
		type: 'queue_skipped',
		payload: {
			queue: ticket.queue,
			counter: counterId
		}
	});
	emitEvent(queueTicketToCounterEvent(null, counterId, 'idle'));

	return ticket;
}

export function operatorTransfer(sourceCounterId: number, targetCounterId: number): QueueTicket | null {
	const ticket = transferCurrent(sourceCounterId, targetCounterId);
	if (!ticket) return null;

	releaseCounter(sourceCounterId, 'idle');
	assignQueueToCounter(targetCounterId, ticket.queue, ticket.serviceId, ticket.serviceName, 'calling');

	emitEvent(queueTicketToCounterEvent(null, sourceCounterId, 'idle'));
	emitEvent(queueTicketToCalledEvent(ticket, targetCounterId));
	emitEvent(queueTicketToCounterEvent(ticket, targetCounterId, 'calling'));

	return ticket;
}

export function publicTakeQueue(service: ServiceConfig): QueueTicket {
	const ticket = takeNumber(service);

	emitEvent({
		type: 'queue_taken',
		payload: {
			queue: ticket.queue,
			serviceId: ticket.serviceId,
			service: ticket.serviceName
		}
	});

	return ticket;
}

export function broadcastAnnouncements(next: Announcement[]): void {
	emitEvent({
		type: 'announcement_update',
		payload: {
			announcements: next
		}
	});
}
