import { derived } from 'svelte/store';
import type { Counter, CounterState, CounterStatus, CounterUpdatePayload } from '$lib/types';
import { persistentWritable } from '$lib/utils/persistent';

const now = () => Date.now();

const initialState: CounterState = {
	counters: [
		{
			id: 1,
			name: 'Loket 1',
			serviceId: 'customer-service',
			status: 'idle',
			currentQueue: null,
			serviceName: null,
			updatedAt: now()
		},
		{
			id: 2,
			name: 'Loket 2',
			serviceId: 'customer-service',
			status: 'idle',
			currentQueue: null,
			serviceName: null,
			updatedAt: now()
		},
		{
			id: 3,
			name: 'Loket 3',
			serviceId: 'teller',
			status: 'idle',
			currentQueue: null,
			serviceName: null,
			updatedAt: now()
		},
		{
			id: 4,
			name: 'Loket 4',
			serviceId: 'teller',
			status: 'idle',
			currentQueue: null,
			serviceName: null,
			updatedAt: now()
		},
		{
			id: 5,
			name: 'Loket 5',
			serviceId: 'priority',
			status: 'idle',
			currentQueue: null,
			serviceName: null,
			updatedAt: now()
		},
		{
			id: 6,
			name: 'Loket 6',
			serviceId: 'priority',
			status: 'idle',
			currentQueue: null,
			serviceName: null,
			updatedAt: now()
		}
	],
	nextCounterId: 7
};

const counterState = persistentWritable<CounterState>('queue-counter-state-v1', initialState);

export const counters = derived(counterState, ($state) => $state.counters);

function updateCounterById(counters: Counter[], counterId: number, updater: (counter: Counter) => Counter): Counter[] {
	return counters.map((counter) => (counter.id === counterId ? updater(counter) : counter));
}

export function setCounterStatus(counterId: number, status: CounterStatus): void {
	counterState.update((current) => ({
		...current,
		counters: updateCounterById(current.counters, counterId, (counter) => ({
			...counter,
			status,
			updatedAt: now()
		}))
	}));
}

export function assignQueueToCounter(
	counterId: number,
	queue: string,
	serviceId: string,
	serviceName: string,
	status: CounterStatus = 'calling'
): void {
	counterState.update((current) => ({
		...current,
		counters: updateCounterById(current.counters, counterId, (counter) => ({
			...counter,
			currentQueue: queue,
			serviceId,
			serviceName,
			status,
			updatedAt: now()
		}))
	}));
}

export function releaseCounter(counterId: number, status: CounterStatus = 'idle'): void {
	counterState.update((current) => ({
		...current,
		counters: updateCounterById(current.counters, counterId, (counter) => ({
			...counter,
			status,
			currentQueue: null,
			serviceName: null,
			updatedAt: now()
		}))
	}));
}

export function updateCounterService(counterId: number, serviceId: string): void {
	counterState.update((current) => ({
		...current,
		counters: updateCounterById(current.counters, counterId, (counter) => ({
			...counter,
			serviceId,
			updatedAt: now()
		}))
	}));
}

export function renameCounter(counterId: number, name: string): void {
	const trimmedName = name.trim();
	if (!trimmedName) return;

	counterState.update((current) => ({
		...current,
		counters: updateCounterById(current.counters, counterId, (counter) => ({
			...counter,
			name: trimmedName,
			updatedAt: now()
		}))
	}));
}

export function toggleCounterOffline(counterId: number): void {
	counterState.update((current) => ({
		...current,
		counters: updateCounterById(current.counters, counterId, (counter) => {
			const nextStatus: CounterStatus = counter.status === 'offline' ? 'idle' : 'offline';
			return {
				...counter,
				status: nextStatus,
				currentQueue: nextStatus === 'offline' ? null : counter.currentQueue,
				serviceName: nextStatus === 'offline' ? null : counter.serviceName,
				updatedAt: now()
			};
		})
	}));
}

export function addCounter(name: string, serviceId: string): number | null {
	const trimmedName = name.trim();
	if (!trimmedName) return null;

	let createdCounterId: number | null = null;

	counterState.update((current) => {
		const nextCounterId = current.nextCounterId;
		createdCounterId = nextCounterId;

		return {
			nextCounterId: nextCounterId + 1,
			counters: [
				...current.counters,
				{
					id: nextCounterId,
					name: trimmedName,
					serviceId,
					status: 'idle',
					currentQueue: null,
					serviceName: null,
					updatedAt: now()
				}
			]
		};
	});

	return createdCounterId;
}

export function syncCounterUpdate(payload: CounterUpdatePayload): void {
	counterState.update((current) => ({
		...current,
		counters: updateCounterById(current.counters, payload.counter, (counter) => ({
			...counter,
			status: payload.status,
			currentQueue: payload.queue,
			serviceId: payload.serviceId ?? counter.serviceId,
			serviceName: payload.service,
			updatedAt: now()
		}))
	}));
}

export function resetCounterState(): void {
	counterState.set(initialState);
}

