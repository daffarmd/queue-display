import { derived } from 'svelte/store';
import type {
	QueueCalledPayload,
	QueueCompletedPayload,
	QueueSkippedPayload,
	QueueSocketActiveCall,
	QueueSocketCounterState,
	QueueSocketSnapshot,
	QueueSocketWaitingEntry,
	QueueState,
	QueueTakenPayload,
	QueueTicket,
	ServiceConfig
} from '$lib/types';
import { persistentWritable } from '$lib/utils/persistent';

const now = () => Date.now();
const counterKey = (counterId: number) => String(counterId);

function makeTicket(queue: string, serviceId: string, serviceName: string): QueueTicket {
	return {
		queue,
		serviceId,
		serviceName,
		status: 'waiting',
		createdAt: now(),
		counterId: null,
		calledAt: null,
		completedAt: null,
		recallCount: 0
	};
}

const initialState: QueueState = {
	waiting: [
		makeTicket('CS0014', 'customer-service', 'Customer Service'),
		makeTicket('CS0015', 'customer-service', 'Customer Service'),
		makeTicket('TL0008', 'teller', 'Teller'),
		makeTicket('CS0016', 'customer-service', 'Customer Service'),
		makeTicket('PR0004', 'priority', 'Priority')
	],
	activeByCounter: {},
	latestCall: null,
	history: [],
	sequenceByPrefix: {
		CS: 16,
		TL: 8,
		PR: 4
	}
};

const queueState = persistentWritable<QueueState>('queue-system-state-v2', initialState, {
	syncTabs: false
});

export const waitingTickets = derived(queueState, ($state) => $state.waiting);
export const latestQueueCall = derived(queueState, ($state) => $state.latestCall);
export const activeByCounter = derived(queueState, ($state) => $state.activeByCounter);
export const queueHistory = derived(queueState, ($state) => $state.history);

export const queueMetrics = derived(queueState, ($state) => {
	const completed = $state.history.filter((ticket) => ticket.status === 'completed');
	const skipped = $state.history.filter((ticket) => ticket.status === 'skipped');

	const averageServiceDurationMs =
		completed.length === 0
			? 0
			: Math.round(
					completed.reduce((total, ticket) => {
						if (!ticket.calledAt || !ticket.completedAt) return total;
						return total + (ticket.completedAt - ticket.calledAt);
					}, 0) / completed.length
				);

	return {
		waiting: $state.waiting.length,
		active: Object.keys($state.activeByCounter).length,
		completed: completed.length,
		skipped: skipped.length,
		averageServiceDurationMs
	};
});

function parseTimestamp(value: unknown, fallback: number): number {
	if (typeof value === 'number' && Number.isFinite(value)) return value;
	if (typeof value === 'string') {
		const numeric = Number(value);
		if (Number.isFinite(numeric)) return numeric;
		const parsed = Date.parse(value);
		if (!Number.isNaN(parsed)) return parsed;
	}
	return fallback;
}

function parseNumericCounterId(value: unknown): number | null {
	if (typeof value === 'number' && Number.isFinite(value)) {
		return Math.trunc(value);
	}
	if (typeof value === 'string' && /^[0-9]+$/.test(value.trim())) {
		return Number(value);
	}
	return null;
}

function splitQueueNumber(queue: string): { prefix: string; sequence: number } | null {
	const match = queue.trim().toUpperCase().match(/^([A-Z]+)(\d+)$/);
	if (!match) return null;
	return {
		prefix: match[1],
		sequence: Number(match[2])
	};
}

function bumpSequenceByQueue(
	sequenceByPrefix: Record<string, number>,
	queue: string
): Record<string, number> {
	const parts = splitQueueNumber(queue);
	if (!parts) return sequenceByPrefix;

	const current = sequenceByPrefix[parts.prefix] ?? 0;
	if (parts.sequence <= current) return sequenceByPrefix;

	return {
		...sequenceByPrefix,
		[parts.prefix]: parts.sequence
	};
}

function fallbackServiceId(queue: string, waitingKey?: string): string {
	if (waitingKey?.trim()) return waitingKey.trim();
	const parts = splitQueueNumber(queue);
	return parts ? parts.prefix.toLowerCase() : 'general';
}

function fallbackServiceName(serviceId: string): string {
	return serviceId
		.split('-')
		.filter(Boolean)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(' ');
}

function ticketFromWaitingEntry(
	entry: QueueSocketWaitingEntry | string,
	waitingKey: string,
	fallbackTime: number
): QueueTicket | null {
	const data =
		typeof entry === 'string'
			? ({ queueNumber: entry } satisfies QueueSocketWaitingEntry)
			: entry;
	const queue =
		typeof data.queueNumber === 'string'
			? data.queueNumber
			: typeof data.queue === 'string'
				? data.queue
				: '';
	if (!queue.trim()) return null;

	const serviceId =
		typeof data.serviceId === 'string' && data.serviceId.trim()
			? data.serviceId.trim()
			: fallbackServiceId(queue, waitingKey);
	const serviceNameCandidate =
		typeof data.service === 'string' && data.service.trim()
			? data.service.trim()
			: typeof data.serviceName === 'string' && data.serviceName.trim()
				? data.serviceName.trim()
				: fallbackServiceName(serviceId);

	return {
		queue,
		serviceId,
		serviceName: serviceNameCandidate,
		status: 'waiting',
		createdAt: parseTimestamp(data.createdAt, fallbackTime),
		counterId: null,
		calledAt: null,
		completedAt: null,
		recallCount:
			typeof data.recallCount === 'number'
				? data.recallCount
				: Number(data.recallCount ?? 0) || 0
	};
}

function ticketFromActiveCall(
	activeCall: QueueSocketActiveCall,
	counterState: QueueSocketCounterState | undefined,
	fallbackTime: number
): QueueTicket | null {
	const queue = activeCall.queueNumber?.trim();
	if (!queue) return null;

	const meta = {
		...(activeCall.meta ?? {}),
		...(counterState?.meta ?? {})
	};
	const serviceId =
		typeof meta.serviceId === 'string' && meta.serviceId.trim()
			? meta.serviceId.trim()
			: fallbackServiceId(queue);
	const serviceName =
		typeof meta.service === 'string' && meta.service.trim()
			? meta.service.trim()
			: typeof meta.serviceName === 'string' && meta.serviceName.trim()
				? meta.serviceName.trim()
				: fallbackServiceName(serviceId);
	const counterId = parseNumericCounterId(counterState?.counterId ?? activeCall.counterId);
	if (counterId === null) return null;

	return {
		queue,
		serviceId,
		serviceName,
		status: counterState?.status === 'serving' ? 'serving' : 'called',
		createdAt: parseTimestamp(meta.createdAt, fallbackTime),
		counterId,
		calledAt: parseTimestamp(meta.calledAt, fallbackTime),
		completedAt: null,
		recallCount:
			typeof meta.recallCount === 'number'
				? meta.recallCount
				: Number(meta.recallCount ?? 0) || 0
	};
}

function rebuildWaitingTickets(
	waitingQueues: Record<string, QueueSocketWaitingEntry[]>,
	activeTickets: Record<string, QueueTicket>,
	current: QueueState,
	fallbackTime: number
): Pick<QueueState, 'waiting' | 'sequenceByPrefix'> {
	const activeQueues = new Set(Object.values(activeTickets).map((ticket) => ticket.queue));
	const nextWaiting: QueueTicket[] = [];
	let nextSequenceByPrefix = { ...current.sequenceByPrefix };

	for (const [waitingKey, entries] of Object.entries(waitingQueues ?? {})) {
		for (const rawEntry of entries ?? []) {
			const ticket = ticketFromWaitingEntry(rawEntry as QueueSocketWaitingEntry | string, waitingKey, fallbackTime);
			if (!ticket || activeQueues.has(ticket.queue)) continue;
			nextWaiting.push(ticket);
			nextSequenceByPrefix = bumpSequenceByQueue(nextSequenceByPrefix, ticket.queue);
		}
	}

	return {
		waiting: nextWaiting,
		sequenceByPrefix: nextSequenceByPrefix
	};
}

function toCalledTicket(ticket: QueueTicket, counterId: number): QueueTicket {
	return {
		...ticket,
		status: 'called',
		counterId,
		calledAt: now()
	};
}

function toServingTicket(ticket: QueueTicket): QueueTicket {
	return {
		...ticket,
		status: 'serving'
	};
}

function toEndedTicket(ticket: QueueTicket, status: 'completed' | 'skipped'): QueueTicket {
	return {
		...ticket,
		status,
		completedAt: now()
	};
}

function isSameQueueTicket(left: QueueTicket | null, right: QueueTicket): boolean {
	if (!left) return false;
	return left.queue === right.queue && left.counterId === right.counterId;
}

export function takeNumber(service: ServiceConfig): QueueTicket {
	const prefix = service.prefix.trim().toUpperCase();
	let createdTicket = makeTicket(`${prefix}0001`, service.id, service.name);

	queueState.update((current) => {
		const nextSequence = (current.sequenceByPrefix[prefix] ?? 0) + 1;
		const queue = `${prefix}${String(nextSequence).padStart(4, '0')}`;
		createdTicket = makeTicket(queue, service.id, service.name);

		return {
			...current,
			waiting: [...current.waiting, createdTicket],
			sequenceByPrefix: {
				...current.sequenceByPrefix,
				[prefix]: nextSequence
			}
		};
	});

	return createdTicket;
}

export function callNext(counterId: number, serviceId?: string): QueueTicket | null {
	let calledTicket: QueueTicket | null = null;

	queueState.update((current) => {
		const index = current.waiting.findIndex((ticket) =>
			serviceId ? ticket.serviceId === serviceId : true
		);
		if (index === -1) return current;

		const selected = current.waiting[index];
		const called = toCalledTicket(selected, counterId);
		calledTicket = called;

		const nextWaiting = [...current.waiting];
		nextWaiting.splice(index, 1);

		return {
			...current,
			waiting: nextWaiting,
			activeByCounter: {
				...current.activeByCounter,
				[counterKey(counterId)]: called
			},
			latestCall: called
		};
	});

	return calledTicket;
}

export function recallCurrent(counterId: number): QueueTicket | null {
	let recalled: QueueTicket | null = null;

	queueState.update((current) => {
		const active = current.activeByCounter[counterKey(counterId)];
		if (!active) return current;

		const nextActive = {
			...active,
			status: 'called',
			calledAt: now(),
			recallCount: active.recallCount + 1
		} satisfies QueueTicket;

		recalled = nextActive;

		return {
			...current,
			activeByCounter: {
				...current.activeByCounter,
				[counterKey(counterId)]: nextActive
			},
			latestCall: nextActive
		};
	});

	return recalled;
}

export function markServing(counterId: number): QueueTicket | null {
	let servingTicket: QueueTicket | null = null;

	queueState.update((current) => {
		const active = current.activeByCounter[counterKey(counterId)];
		if (!active) return current;

		const serving = toServingTicket(active);
		servingTicket = serving;

		return {
			...current,
			activeByCounter: {
				...current.activeByCounter,
				[counterKey(counterId)]: serving
			},
			latestCall: isSameQueueTicket(current.latestCall, active) ? serving : current.latestCall
		};
	});

	return servingTicket;
}

export function completeCurrent(counterId: number): QueueTicket | null {
	let completed: QueueTicket | null = null;

	queueState.update((current) => {
		const active = current.activeByCounter[counterKey(counterId)];
		if (!active) return current;

		completed = toEndedTicket(active, 'completed');

		const nextActive = { ...current.activeByCounter };
		delete nextActive[counterKey(counterId)];
		const nextLatest = isSameQueueTicket(current.latestCall, active) ? completed : current.latestCall;

		return {
			...current,
			activeByCounter: nextActive,
			history: [completed, ...current.history],
			latestCall: nextLatest
		};
	});

	return completed;
}

export function skipCurrent(counterId: number): QueueTicket | null {
	let skipped: QueueTicket | null = null;

	queueState.update((current) => {
		const active = current.activeByCounter[counterKey(counterId)];
		if (!active) return current;

		skipped = toEndedTicket(active, 'skipped');

		const nextActive = { ...current.activeByCounter };
		delete nextActive[counterKey(counterId)];
		const nextLatest = isSameQueueTicket(current.latestCall, active) ? skipped : current.latestCall;

		return {
			...current,
			activeByCounter: nextActive,
			history: [skipped, ...current.history],
			latestCall: nextLatest
		};
	});

	return skipped;
}

export function transferCurrent(sourceCounterId: number, targetCounterId: number): QueueTicket | null {
	let movedTicket: QueueTicket | null = null;

	queueState.update((current) => {
		const currentTicket = current.activeByCounter[counterKey(sourceCounterId)];
		if (!currentTicket) return current;

		movedTicket = {
			...currentTicket,
			counterId: targetCounterId,
			status: 'called'
		};

		const nextActive = { ...current.activeByCounter };
		delete nextActive[counterKey(sourceCounterId)];
		nextActive[counterKey(targetCounterId)] = movedTicket;

		return {
			...current,
			activeByCounter: nextActive,
			latestCall: movedTicket
		};
	});

	return movedTicket;
}

function findActiveTicketByQueue(state: QueueState, queue: string): [string, QueueTicket] | null {
	for (const [key, ticket] of Object.entries(state.activeByCounter)) {
		if (ticket.queue === queue) return [key, ticket];
	}
	return null;
}

export function syncQueueCalled(payload: QueueCalledPayload): void {
	queueState.update((current) => {
		const existingFromWaiting = current.waiting.find((ticket) => ticket.queue === payload.queue);
		const existingFromActive = findActiveTicketByQueue(current, payload.queue)?.[1];
		const source =
			existingFromWaiting ??
			existingFromActive ??
			makeTicket(payload.queue, payload.serviceId, payload.service);

		const called = {
			...source,
			status: 'called',
			counterId: payload.counter,
			calledAt: payload.calledAt ?? now(),
			recallCount: payload.recallCount ?? source.recallCount
		} satisfies QueueTicket;

		return {
			...current,
			waiting: current.waiting.filter((ticket) => ticket.queue !== payload.queue),
			activeByCounter: {
				...current.activeByCounter,
				[counterKey(payload.counter)]: called
			},
			latestCall: called,
			sequenceByPrefix: bumpSequenceByQueue(current.sequenceByPrefix, payload.queue)
		};
	});
}

export function syncQueueServing(counterId: number): void {
	queueState.update((current) => {
		const active = current.activeByCounter[counterKey(counterId)];
		if (!active) return current;

		const serving = toServingTicket(active);

		return {
			...current,
			activeByCounter: {
				...current.activeByCounter,
				[counterKey(counterId)]: serving
			},
			latestCall: isSameQueueTicket(current.latestCall, active) ? serving : current.latestCall
		};
	});
}

export function syncQueueCounterCleared(counterId: number): void {
	queueState.update((current) => {
		if (!current.activeByCounter[counterKey(counterId)]) return current;

		const nextActive = { ...current.activeByCounter };
		delete nextActive[counterKey(counterId)];

		return {
			...current,
			activeByCounter: nextActive
		};
	});
}

export function syncQueueCompleted(payload: QueueCompletedPayload): void {
	queueState.update((current) => {
		const entry = findActiveTicketByQueue(current, payload.queue);
		const key = entry?.[0] ?? counterKey(payload.counter);
		const ticket = entry?.[1] ?? current.activeByCounter[key];
		if (!ticket) return current;

		const completed = toEndedTicket(ticket, 'completed');
		const nextActive = { ...current.activeByCounter };
		delete nextActive[key];
		const nextLatest = isSameQueueTicket(current.latestCall, ticket) ? completed : current.latestCall;

		return {
			...current,
			activeByCounter: nextActive,
			history: [completed, ...current.history],
			latestCall: nextLatest
		};
	});
}

export function syncQueueSkipped(payload: QueueSkippedPayload): void {
	queueState.update((current) => {
		const entry = findActiveTicketByQueue(current, payload.queue);
		const key = entry?.[0] ?? counterKey(payload.counter);
		const ticket = entry?.[1] ?? current.activeByCounter[key];
		if (!ticket) return current;

		const skipped = toEndedTicket(ticket, 'skipped');
		const nextActive = { ...current.activeByCounter };
		delete nextActive[key];
		const nextLatest = isSameQueueTicket(current.latestCall, ticket) ? skipped : current.latestCall;

		return {
			...current,
			activeByCounter: nextActive,
			history: [skipped, ...current.history],
			latestCall: nextLatest
		};
	});
}

export function syncQueueTaken(payload: QueueTakenPayload): void {
	queueState.update((current) => {
		const exists =
			current.waiting.some((ticket) => ticket.queue === payload.queue) ||
			Object.values(current.activeByCounter).some((ticket) => ticket.queue === payload.queue) ||
			current.history.some((ticket) => ticket.queue === payload.queue);

		if (exists) return current;

		const created = makeTicket(payload.queue, payload.serviceId, payload.service);
		created.createdAt = payload.createdAt ?? created.createdAt;

		return {
			...current,
			waiting: [...current.waiting, created],
			sequenceByPrefix: bumpSequenceByQueue(current.sequenceByPrefix, payload.queue)
		};
	});
}

export function syncWaitingQueues(
	waitingQueues: Record<string, QueueSocketWaitingEntry[]>,
	serverTime?: string
): void {
	queueState.update((current) => ({
		...current,
		...rebuildWaitingTickets(
			waitingQueues,
			current.activeByCounter,
			current,
			parseTimestamp(serverTime, now())
		)
	}));
}

export function syncQueueSnapshot(snapshot: QueueSocketSnapshot): void {
	queueState.update((current) => {
		const fallbackTime = parseTimestamp(snapshot.serverTime, now());
		const nextActiveByCounter: Record<string, QueueTicket> = {};
		let nextLatestCall: QueueTicket | null = current.latestCall;
		let highestSeq = -1;
		let nextSequenceByPrefix = { ...current.sequenceByPrefix };

		for (const [counterKeyFromSnapshot, activeCall] of Object.entries(snapshot.activeCalls ?? {})) {
			const counterState =
				snapshot.counterStates?.[counterKeyFromSnapshot] ??
				snapshot.counterStates?.[activeCall.counterId];
			const ticket = ticketFromActiveCall(activeCall, counterState, fallbackTime);
			if (!ticket) continue;

			nextActiveByCounter[String(ticket.counterId)] = ticket;
			nextSequenceByPrefix = bumpSequenceByQueue(nextSequenceByPrefix, ticket.queue);

			const currentSeq = counterState?.seq ?? activeCall.seq ?? 0;
			if (currentSeq >= highestSeq) {
				highestSeq = currentSeq;
				nextLatestCall = ticket;
			}
		}

		const waitingState = rebuildWaitingTickets(
			snapshot.waitingQueues ?? {},
			nextActiveByCounter,
			{
				...current,
				activeByCounter: nextActiveByCounter,
				sequenceByPrefix: nextSequenceByPrefix
			},
			fallbackTime
		);

		return {
			...current,
			waiting: waitingState.waiting,
			activeByCounter: nextActiveByCounter,
			latestCall: nextLatestCall,
			sequenceByPrefix: waitingState.sequenceByPrefix
		};
	});
}

export function resetQueueState(): void {
	queueState.set(initialState);
}
