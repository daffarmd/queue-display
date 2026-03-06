import { derived } from 'svelte/store';
import type {
	QueueCalledPayload,
	QueueCompletedPayload,
	QueueSkippedPayload,
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

const queueState = persistentWritable<QueueState>('queue-system-state-v1', initialState);

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
			}
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

		return {
			...current,
			activeByCounter: nextActive,
			history: [completed, ...current.history]
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

		return {
			...current,
			activeByCounter: nextActive,
			history: [skipped, ...current.history]
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
			calledAt: now()
		} satisfies QueueTicket;

		return {
			...current,
			waiting: current.waiting.filter((ticket) => ticket.queue !== payload.queue),
			activeByCounter: {
				...current.activeByCounter,
				[counterKey(payload.counter)]: called
			},
			latestCall: called
		};
	});
}

export function syncQueueServing(counterId: number): void {
	queueState.update((current) => {
		const active = current.activeByCounter[counterKey(counterId)];
		if (!active) return current;

		return {
			...current,
			activeByCounter: {
				...current.activeByCounter,
				[counterKey(counterId)]: toServingTicket(active)
			}
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

		return {
			...current,
			activeByCounter: nextActive,
			history: [completed, ...current.history]
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

		return {
			...current,
			activeByCounter: nextActive,
			history: [skipped, ...current.history]
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

		return {
			...current,
			waiting: [...current.waiting, created]
		};
	});
}

export function resetQueueState(): void {
	queueState.set(initialState);
}

