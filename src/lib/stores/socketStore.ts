import { browser } from '$app/environment';
import { env } from '$env/dynamic/public';
import { get, writable } from 'svelte/store';
import { io, type Socket } from 'socket.io-client';
import type {
	Announcement,
	CounterStatus,
	QueueSocketActiveCall,
	QueueSocketCommandError,
	QueueSocketCounterState,
	QueueSocketEvent,
	QueueSocketSnapshot,
	QueueSocketWaitingEntry,
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
	syncQueueCounterCleared,
	syncQueueServing,
	syncQueueSkipped,
	syncQueueSnapshot,
	syncQueueTaken,
	syncWaitingQueues,
	takeNumber,
	transferCurrent
} from '$lib/stores/queueStore';
import {
	assignQueueToCounter,
	counters,
	releaseCounter,
	setCounterStatus,
	syncCounterSnapshot,
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
const CHANNEL_NAME = 'queue-system-broadcast-v1';
const RECONNECT_INTERVAL_MS = 3000;
const RECENT_EVENT_TTL_MS = 15000;
const FALLBACK_DUPLICATE_WINDOW_MS = 900;
const SOCKET_URL = (env.PUBLIC_SOCKET_URL ?? '').trim();
const SOCKET_NAMESPACE = normalizeNamespace(env.PUBLIC_SOCKET_NAMESPACE ?? '/queue');
const SOCKET_BRANCH = (env.PUBLIC_SOCKET_BRANCH ?? 'main').trim() || 'main';
const SOCKET_PATH = (env.PUBLIC_SOCKET_PATH ?? '/socket.io').trim() || '/socket.io';
const SOCKET_TARGET_URL = buildSocketUrl(SOCKET_URL, SOCKET_NAMESPACE);

const CLIENT_ID =
	typeof crypto !== 'undefined' && 'randomUUID' in crypto
		? crypto.randomUUID()
		: `client-${Math.random().toString(36).slice(2)}`;

export const connectionState = writable<SocketConnectionState>(
	SOCKET_TARGET_URL ? 'connecting' : 'connected'
);
export const lastSocketEvent = writable<QueueSocketEvent | null>(null);
export const lastCommandError = writable<QueueSocketCommandError | null>(null);

let socket: Socket | null = null;
let channel: BroadcastChannel | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let started = false;
let lastServerSeq = 0;
const recentIncomingEventIds = new Map<string, number>();
const recentIncomingSignatures = new Map<string, number>();

function normalizeNamespace(value: string): string {
	const trimmed = value.trim();
	if (!trimmed) return '/queue';
	return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

function buildSocketUrl(rawUrl: string, namespace: string): string {
	if (!rawUrl) return '';

	try {
		const parsed = new URL(rawUrl);
		if (!parsed.pathname.endsWith(namespace)) {
			const basePath = parsed.pathname === '/' ? '' : parsed.pathname.replace(/\/+$/, '');
			parsed.pathname = `${basePath}${namespace}`;
		}
		return parsed.toString();
	} catch {
		const trimmed = rawUrl.replace(/\/+$/, '');
		return trimmed.endsWith(namespace) ? trimmed : `${trimmed}${namespace}`;
	}
}

function createEventId(): string {
	if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
		return crypto.randomUUID();
	}
	return `evt-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

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

function toRecord(value: unknown): Record<string, unknown> | undefined {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
	return value as Record<string, unknown>;
}

function toStringValue(...values: unknown[]): string | undefined {
	for (const value of values) {
		if (typeof value === 'string' && value.trim()) return value.trim();
		if (typeof value === 'number' && Number.isFinite(value)) return String(value);
	}
	return undefined;
}

function toIntegerValue(...values: unknown[]): number | undefined {
	for (const value of values) {
		if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
		if (typeof value === 'string' && value.trim()) {
			const parsed = Number(value);
			if (Number.isFinite(parsed)) return Math.trunc(parsed);
		}
	}
	return undefined;
}

function toTimestampValue(...values: unknown[]): number | undefined {
	for (const value of values) {
		if (typeof value === 'number' && Number.isFinite(value)) return value;
		if (typeof value === 'string' && value.trim()) {
			const numeric = Number(value);
			if (Number.isFinite(numeric)) return numeric;
			const parsed = Date.parse(value);
			if (!Number.isNaN(parsed)) return parsed;
		}
	}
	return undefined;
}

function toBooleanValue(...values: unknown[]): boolean | undefined {
	for (const value of values) {
		if (typeof value === 'boolean') return value;
		if (typeof value === 'number') return value !== 0;
		if (typeof value === 'string') {
			const normalized = value.trim().toLowerCase();
			if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
			if (['false', '0', 'no', 'off'].includes(normalized)) return false;
		}
	}
	return undefined;
}

function toCounterId(...values: unknown[]): number | null {
	const parsed = toIntegerValue(...values);
	return parsed === undefined ? null : parsed;
}

function inferServiceId(queue: string, fallback?: string): string {
	if (fallback?.trim()) return fallback.trim();
	const match = queue.trim().toUpperCase().match(/^([A-Z]+)/);
	return match ? match[1].toLowerCase() : 'general';
}

function inferServiceName(serviceId: string, fallback?: string): string {
	if (fallback?.trim()) return fallback.trim();
	return serviceId
		.split('-')
		.filter(Boolean)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(' ');
}

function normalizeWaitingEntry(entry: unknown): QueueSocketWaitingEntry | null {
	if (typeof entry === 'string') {
		return { queueNumber: entry };
	}

	const record = toRecord(entry);
	return record ? (record as QueueSocketWaitingEntry) : null;
}

function parseWaitingQueues(
	rawWaitingQueues: unknown
): Record<string, QueueSocketWaitingEntry[]> | undefined {
	const record = toRecord(rawWaitingQueues);
	if (!record) return undefined;

	const waitingQueues: Record<string, QueueSocketWaitingEntry[]> = {};
	for (const [key, value] of Object.entries(record)) {
		const entries = Array.isArray(value) ? value : [value];
		waitingQueues[key] = entries
			.map((entry) => normalizeWaitingEntry(entry))
			.filter((entry): entry is QueueSocketWaitingEntry => entry !== null);
	}

	return waitingQueues;
}

function parseAnnouncements(rawAnnouncements: unknown): Announcement[] | undefined {
	if (!Array.isArray(rawAnnouncements)) return undefined;

	const announcements = rawAnnouncements
		.map((entry, index) => {
			const record = toRecord(entry);
			if (!record) return null;
			const title = toStringValue(record.title);
			const message = toStringValue(record.message);
			if (!title || !message) return null;
			return {
				id: toStringValue(record.id) ?? `announcement-${index + 1}`,
				title,
				message
			} satisfies Announcement;
		})
		.filter((entry): entry is Announcement => entry !== null);

	return announcements;
}

function normalizeActiveCalls(rawActiveCalls: unknown): Record<string, QueueSocketActiveCall> {
	const record = toRecord(rawActiveCalls);
	if (!record) return {};

	const activeCalls: Record<string, QueueSocketActiveCall> = {};
	for (const [key, value] of Object.entries(record)) {
		const item = toRecord(value);
		if (!item) continue;

		const queueNumber = toStringValue(item.queueNumber, item.queue_number);
		const counterId = toStringValue(item.counterId, item.counter_id, key);
		if (!queueNumber || !counterId) continue;

		activeCalls[key] = {
			queueNumber,
			counterId,
			eventId: toStringValue(item.eventId, item.event_id),
			seq: toIntegerValue(item.seq) ?? 0,
			updatedAt: toStringValue(item.updatedAt, item.updated_at) ?? '',
			meta: toRecord(item.meta)
		};
	}

	return activeCalls;
}

function normalizeCounterStates(rawCounterStates: unknown): Record<string, QueueSocketCounterState> {
	const record = toRecord(rawCounterStates);
	if (!record) return {};

	const counterStates: Record<string, QueueSocketCounterState> = {};
	for (const [key, value] of Object.entries(record)) {
		const item = toRecord(value);
		if (!item) continue;

		const counterId = toStringValue(item.counterId, item.counter_id, key);
		if (!counterId) continue;

		counterStates[key] = {
			counterId,
			status: toStringValue(item.status) ?? 'idle',
			queueNumber: toStringValue(item.queueNumber, item.queue_number),
			seq: toIntegerValue(item.seq) ?? 0,
			updatedAt: toStringValue(item.updatedAt, item.updated_at) ?? '',
			meta: toRecord(item.meta)
		};
	}

	return counterStates;
}

function trackServerSeq(rawSeq: unknown): void {
	const seq = toIntegerValue(rawSeq);
	if (seq !== undefined && seq > lastServerSeq) {
		lastServerSeq = seq;
	}
}

function parseSnapshot(payload: Record<string, unknown>): QueueSocketSnapshot {
	const snapshot = {
		branchId: toStringValue(payload.branchId, payload.branch_id) ?? SOCKET_BRANCH,
		seq: toIntegerValue(payload.seq) ?? 0,
		serverTime: toStringValue(payload.serverTime) ?? new Date().toISOString(),
		activeCalls: normalizeActiveCalls(payload.activeCalls),
		counterStates: normalizeCounterStates(payload.counterStates),
		waitingQueues: parseWaitingQueues(payload.waitingQueues) ?? {},
		announcementEnabled:
			toBooleanValue(payload.announcementEnabled, payload.announcement_enabled) ?? false,
		announcements: parseAnnouncements(payload.announcements)
	} satisfies QueueSocketSnapshot;

	trackServerSeq(snapshot.seq);
	return snapshot;
}

function parseCommandError(payload: Record<string, unknown>): QueueSocketCommandError {
	return {
		code: toStringValue(payload.code) ?? 'unknown_error',
		message: toStringValue(payload.message) ?? 'Unknown socket command error',
		event: toStringValue(payload.event) ?? 'unknown',
		eventId: toStringValue(payload.eventId, payload.event_id),
		branchId: toStringValue(payload.branchId, payload.branch_id),
		counterId: toStringValue(payload.counterId, payload.counter_id),
		seq: toIntegerValue(payload.seq) ?? 0,
		serverTime: toStringValue(payload.serverTime) ?? new Date().toISOString(),
		details: toRecord(payload.details)
	};
}

function parseIncomingSocketEvent(
	type: QueueSocketEvent['type'],
	payload: Record<string, unknown>
): QueueSocketEvent | null {
	trackServerSeq(payload.seq);

	const clientId = toStringValue(payload.clientId, payload._clientId);
	const eventId = toStringValue(payload.eventId, payload._eventId);
	const emittedAt = toTimestampValue(payload.emittedAt, payload._emittedAt, payload.serverTime);
	const queue = toStringValue(
		payload.queue,
		payload.queueNumber,
		payload.queue_number,
		payload.ticket,
		payload.ticketNumber
	);
	const counter = toCounterId(payload.counter, payload.counterId, payload.counter_id);
	const waitingKey = toStringValue(
		payload.waitingKey,
		payload.waitingQueueKey,
		payload.queueType,
		payload.queue_type,
		payload.serviceId,
		payload.service_id
	);
	const serviceId = queue ? inferServiceId(queue, waitingKey) : waitingKey ?? 'general';
	const serviceName = inferServiceName(
		serviceId,
		toStringValue(payload.service, payload.serviceName, payload.service_name)
	);

	switch (type) {
		case 'queue_called':
			if (!queue || counter === null) return null;
			return {
				type,
				payload: {
					queue,
					counter,
					serviceId,
					service: serviceName,
					calledAt: toTimestampValue(payload.calledAt, payload.serverTime),
					recallCount: toIntegerValue(payload.recallCount)
				},
				clientId,
				eventId,
				emittedAt
			};
		case 'queue_completed':
		case 'queue_skipped':
			if (!queue || counter === null) return null;
			return {
				type,
				payload: {
					queue,
					counter
				},
				clientId,
				eventId,
				emittedAt
			};
		case 'counter_update':
			if (counter === null) return null;
			return {
				type,
				payload: {
					counter,
					status:
						(toStringValue(payload.status, payload.counterStatus, payload.counter_status) as CounterStatus) ??
						'idle',
					queue: queue ?? toStringValue(payload.currentQueue) ?? null,
					serviceId:
						toStringValue(payload.serviceId, payload.service_id) ?? (queue ? serviceId : null),
					service:
						toStringValue(payload.service, payload.serviceName, payload.service_name) ??
						(queue ? serviceName : null),
					waitingQueues: parseWaitingQueues(payload.waitingQueues),
					seq: toIntegerValue(payload.seq),
					serverTime: toStringValue(payload.serverTime)
				},
				clientId,
				eventId,
				emittedAt
			};
		case 'queue_taken':
			if (!queue) return null;
			return {
				type,
				payload: {
					queue,
					serviceId,
					service: serviceName,
					createdAt: toTimestampValue(payload.createdAt, payload.serverTime)
				},
				clientId,
				eventId,
				emittedAt
			};
		case 'announcement_update':
			return {
				type,
				payload: {
					announcements: parseAnnouncements(payload.announcements),
					enabled: toBooleanValue(
						payload.enabled,
						payload.announcementEnabled,
						payload.announcement_enabled
					)
				},
				clientId,
				eventId,
				emittedAt
			};
	}

	return null;
}

function eventSignature(event: QueueSocketEvent): string {
	switch (event.type) {
		case 'queue_called':
			return `${event.type}:${event.payload.queue}:${event.payload.counter}:${event.payload.serviceId}:${event.payload.calledAt ?? '-'}:${event.payload.recallCount ?? '-'}`;
		case 'queue_completed':
		case 'queue_skipped':
			return `${event.type}:${event.payload.queue}:${event.payload.counter}`;
		case 'counter_update':
			return `${event.type}:${event.payload.counter}:${event.payload.status}:${event.payload.queue ?? '-'}`;
		case 'queue_taken':
			return `${event.type}:${event.payload.queue}:${event.payload.serviceId}`;
		case 'announcement_update':
			return `${event.type}:${event.payload.announcements?.length ?? 0}:${event.payload.enabled ?? '-'}`;
	}

	return 'unknown';
}

function pruneExpired(map: Map<string, number>, now: number, ttlMs: number): void {
	for (const [key, timestamp] of map) {
		if (now - timestamp > ttlMs) map.delete(key);
	}
}

function shouldIgnoreIncomingDuplicate(event: QueueSocketEvent): boolean {
	const now = Date.now();
	pruneExpired(recentIncomingEventIds, now, RECENT_EVENT_TTL_MS);
	pruneExpired(recentIncomingSignatures, now, RECENT_EVENT_TTL_MS);

	if (event.eventId) {
		const dedupeKey = `${event.type}:${event.eventId}`;
		const seenAt = recentIncomingEventIds.get(dedupeKey);
		if (seenAt && now - seenAt <= RECENT_EVENT_TTL_MS) {
			return true;
		}
		recentIncomingEventIds.set(dedupeKey, now);
		return false;
	}

	const signature = eventSignature(event);
	const previous = recentIncomingSignatures.get(signature);
	recentIncomingSignatures.set(signature, now);
	if (!previous) return false;
	return now - previous <= FALLBACK_DUPLICATE_WINDOW_MS;
}

function applySnapshot(snapshot: QueueSocketSnapshot): void {
	syncQueueSnapshot(snapshot);
	syncCounterSnapshot(snapshot);

	if (snapshot.announcements) {
		setAnnouncements(snapshot.announcements);
	}
}

function applyIncomingEvent(event: QueueSocketEvent): void {
	if (event.clientId && event.clientId === CLIENT_ID) return;
	if (shouldIgnoreIncomingDuplicate(event)) return;

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
			if (event.payload.waitingQueues) {
				syncWaitingQueues(event.payload.waitingQueues, event.payload.serverTime);
			}
			syncCounterUpdate(event.payload);
			if (event.payload.status === 'serving') {
				syncQueueServing(event.payload.counter);
			}
			if (
				(event.payload.status === 'idle' || event.payload.status === 'offline') &&
				!event.payload.queue
			) {
				syncQueueCounterCleared(event.payload.counter);
			}
			break;
		case 'queue_taken':
			syncQueueTaken(event.payload);
			break;
		case 'announcement_update':
			if (event.payload.announcements) {
				setAnnouncements(event.payload.announcements);
			}
			break;
	}
}

function emitLocalEvent(event: QueueSocketEvent): QueueSocketEvent {
	const outgoingEvent: QueueSocketEvent = {
		...event,
		clientId: event.clientId ?? CLIENT_ID,
		eventId: event.eventId ?? createEventId(),
		emittedAt: event.emittedAt ?? Date.now()
	} as QueueSocketEvent;

	lastSocketEvent.set(outgoingEvent);

	if (channel) {
		channel.postMessage(outgoingEvent);
	}

	return outgoingEvent;
}

function commandPayload(
	eventId: string,
	payload: Record<string, unknown>
): Record<string, unknown> {
	const nextPayload: Record<string, unknown> = {
		...payload,
		branchId: SOCKET_BRANCH,
		eventId,
		clientId: CLIENT_ID
	};

	if (lastServerSeq > 0) {
		nextPayload.seq = lastServerSeq;
	}

	return nextPayload;
}

function emitRemoteCommand(eventName: string, payload: Record<string, unknown>): void {
	if (!socket?.connected) return;
	socket.emit(eventName, payload);
}

function requestSnapshot(): void {
	if (!socket?.connected) return;
	socket.emit('state:request', { branchId: SOCKET_BRANCH });
}

function connectRemoteSocket(): void {
	if (!SOCKET_TARGET_URL) {
		connectionState.set('connected');
		return;
	}

	if (socket) return;

	connectionState.set('connecting');
	socket = io(SOCKET_TARGET_URL, {
		autoConnect: false,
		path: SOCKET_PATH,
		reconnection: false,
		transports: ['websocket'],
		auth: { branchId: SOCKET_BRANCH },
		query: { branchId: SOCKET_BRANCH }
	});

	socket.on('connect', () => {
		clearReconnectTimer();
		connectionState.set('connected');
		lastCommandError.set(null);
		requestSnapshot();
	});

	socket.on('disconnect', () => {
		connectionState.set('reconnecting');
		scheduleReconnect();
	});

	socket.on('connect_error', () => {
		connectionState.set('reconnecting');
		scheduleReconnect();
	});

	socket.on('state_snapshot', (payload: Record<string, unknown>) => {
		applySnapshot(parseSnapshot(payload));
	});

	socket.on('command_error', (payload: Record<string, unknown>) => {
		lastCommandError.set(parseCommandError(payload));
	});

	for (const eventType of SOCKET_EVENTS) {
		socket.on(eventType, (payload: Record<string, unknown>) => {
			const event = parseIncomingSocketEvent(eventType, payload);
			if (!event) return;
			applyIncomingEvent(event);
		});
	}

	socket.connect();
}

function initLocalBroadcast(): void {
	if (channel) return;
	if (typeof BroadcastChannel === 'undefined') return;

	try {
		channel = new BroadcastChannel(CHANNEL_NAME);
		channel.onmessage = (message) => {
			applyIncomingEvent(message.data as QueueSocketEvent);
		};
	} catch {
		channel = null;
	}
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
	lastServerSeq = 0;
	lastCommandError.set(null);

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

function queueTicketToCalledEvent(
	ticket: QueueTicket,
	counterId: number,
	eventId?: string
): QueueSocketEvent {
	return {
		type: 'queue_called',
		eventId,
		payload: {
			queue: ticket.queue,
			counter: counterId,
			serviceId: ticket.serviceId,
			service: ticket.serviceName,
			calledAt: ticket.calledAt ?? Date.now(),
			recallCount: ticket.recallCount
		}
	};
}

function queueTicketToCounterEvent(
	ticket: QueueTicket | null,
	counterId: number,
	status: CounterStatus,
	eventId?: string
): QueueSocketEvent {
	return {
		type: 'counter_update',
		eventId,
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

	const eventId = createEventId();
	emitLocalEvent(queueTicketToCalledEvent(ticket, counterId, eventId));
	emitRemoteCommand(
		'operator:call',
		commandPayload(eventId, {
			counterId: String(counterId),
			counter: counterId,
			queueNumber: ticket.queue,
			queue: ticket.queue,
			waitingKey: ticket.serviceId,
			serviceId: ticket.serviceId,
			service: ticket.serviceName,
			status: 'calling',
			calledAt: ticket.calledAt ?? Date.now(),
			recallCount: ticket.recallCount
		})
	);

	return ticket;
}

export function operatorRecall(counterId: number): QueueTicket | null {
	const ticket = recallCurrent(counterId);
	if (!ticket) return null;

	setCounterStatus(counterId, 'calling');

	const eventId = createEventId();
	emitLocalEvent(queueTicketToCalledEvent(ticket, counterId, eventId));
	emitRemoteCommand(
		'operator:call',
		commandPayload(eventId, {
			counterId: String(counterId),
			counter: counterId,
			queueNumber: ticket.queue,
			queue: ticket.queue,
			waitingKey: ticket.serviceId,
			serviceId: ticket.serviceId,
			service: ticket.serviceName,
			status: 'calling',
			calledAt: ticket.calledAt ?? Date.now(),
			recallCount: ticket.recallCount
		})
	);

	return ticket;
}

export function operatorStartServing(counterId: number): QueueTicket | null {
	const ticket = markServing(counterId);
	if (!ticket) return null;

	setCounterStatus(counterId, 'serving');

	const eventId = createEventId();
	emitLocalEvent(queueTicketToCounterEvent(ticket, counterId, 'serving', eventId));
	emitRemoteCommand(
		'counter:update',
		commandPayload(eventId, {
			counterId: String(counterId),
			counter: counterId,
			queueNumber: ticket.queue,
			queue: ticket.queue,
			currentQueue: ticket.queue,
			serviceId: ticket.serviceId,
			service: ticket.serviceName,
			status: 'serving'
		})
	);

	return ticket;
}

export function operatorComplete(counterId: number): QueueTicket | null {
	const ticket = completeCurrent(counterId);
	if (!ticket) return null;

	releaseCounter(counterId, 'idle');

	const eventId = createEventId();
	emitLocalEvent({
		type: 'queue_completed',
		eventId,
		payload: {
			queue: ticket.queue,
			counter: counterId
		}
	});
	emitRemoteCommand(
		'operator:complete',
		commandPayload(eventId, {
			counterId: String(counterId),
			counter: counterId,
			queueNumber: ticket.queue,
			queue: ticket.queue,
			serviceId: ticket.serviceId,
			service: ticket.serviceName,
			status: 'idle'
		})
	);

	return ticket;
}

export function operatorSkip(counterId: number): QueueTicket | null {
	const ticket = skipCurrent(counterId);
	if (!ticket) return null;

	releaseCounter(counterId, 'idle');

	const eventId = createEventId();
	emitLocalEvent({
		type: 'queue_skipped',
		eventId,
		payload: {
			queue: ticket.queue,
			counter: counterId
		}
	});
	emitRemoteCommand(
		'operator:skip',
		commandPayload(eventId, {
			counterId: String(counterId),
			counter: counterId,
			queueNumber: ticket.queue,
			queue: ticket.queue,
			serviceId: ticket.serviceId,
			service: ticket.serviceName,
			status: 'idle'
		})
	);

	return ticket;
}

export function operatorTransfer(sourceCounterId: number, targetCounterId: number): QueueTicket | null {
	const ticket = transferCurrent(sourceCounterId, targetCounterId);
	if (!ticket) return null;

	releaseCounter(sourceCounterId, 'idle');
	assignQueueToCounter(targetCounterId, ticket.queue, ticket.serviceId, ticket.serviceName, 'calling');

	const baseEventId = createEventId();
	emitLocalEvent(queueTicketToCounterEvent(null, sourceCounterId, 'idle', `${baseEventId}:source`));
	emitLocalEvent(queueTicketToCalledEvent(ticket, targetCounterId, `${baseEventId}:target`));
	emitRemoteCommand(
		'operator:transfer',
		commandPayload(baseEventId, {
			counterId: String(sourceCounterId),
			sourceCounterId: String(sourceCounterId),
			targetCounterId: String(targetCounterId),
			sourceCounter: sourceCounterId,
			targetCounter: targetCounterId,
			queueNumber: ticket.queue,
			queue: ticket.queue,
			serviceId: ticket.serviceId,
			service: ticket.serviceName,
			status: 'calling'
		})
	);

	return ticket;
}

export function publicTakeQueue(service: ServiceConfig): QueueTicket {
	const ticket = takeNumber(service);

	const eventId = createEventId();
	emitLocalEvent({
		type: 'queue_taken',
		eventId,
		payload: {
			queue: ticket.queue,
			serviceId: ticket.serviceId,
			service: ticket.serviceName,
			createdAt: ticket.createdAt
		}
	});
	emitRemoteCommand(
		'queue:take',
		commandPayload(eventId, {
			queueNumber: ticket.queue,
			queue: ticket.queue,
			waitingKey: ticket.serviceId,
			serviceId: ticket.serviceId,
			service: ticket.serviceName,
			createdAt: ticket.createdAt
		})
	);

	return ticket;
}

export function broadcastAnnouncements(next: Announcement[]): void {
	const eventId = createEventId();
	emitLocalEvent({
		type: 'announcement_update',
		eventId,
		payload: {
			announcements: next,
			enabled: next.length > 0
		}
	});
	emitRemoteCommand(
		'announcement:update',
		commandPayload(eventId, {
			enabled: next.length > 0,
			announcements: next
		})
	);
}

export function broadcastCounterState(counterId: number): void {
	const counter = get(counters).find((item) => item.id === counterId);
	if (!counter) return;

	const eventId = createEventId();
	emitLocalEvent(
		queueTicketToCounterEvent(
			counter.currentQueue
				? {
						queue: counter.currentQueue,
						serviceId: counter.serviceId,
						serviceName: counter.serviceName ?? inferServiceName(counter.serviceId),
						status: counter.status === 'serving' ? 'serving' : 'called',
						createdAt: counter.updatedAt,
						counterId: counter.id,
						calledAt: counter.updatedAt,
						completedAt: null,
						recallCount: 0
				  }
				: null,
			counter.id,
			counter.status,
			eventId
		)
	);
	emitRemoteCommand(
		'counter:update',
		commandPayload(eventId, {
			counterId: String(counter.id),
			counter: counter.id,
			queueNumber: counter.currentQueue ?? undefined,
			queue: counter.currentQueue,
			currentQueue: counter.currentQueue,
			serviceId: counter.serviceId,
			service: counter.serviceName,
			status: counter.status
		})
	);
}
