export type CounterStatus = 'idle' | 'calling' | 'serving' | 'offline';

export type QueueStatus = 'waiting' | 'called' | 'serving' | 'completed' | 'skipped';

export interface ServiceConfig {
	id: string;
	name: string;
	prefix: string;
}

export interface Announcement {
	id: string;
	title: string;
	message: string;
}

export interface QueueTicket {
	queue: string;
	serviceId: string;
	serviceName: string;
	status: QueueStatus;
	createdAt: number;
	counterId: number | null;
	calledAt: number | null;
	completedAt: number | null;
	recallCount: number;
}

export interface Counter {
	id: number;
	name: string;
	serviceId: string;
	status: CounterStatus;
	currentQueue: string | null;
	serviceName: string | null;
	updatedAt: number;
}

export interface QueueState {
	waiting: QueueTicket[];
	activeByCounter: Record<string, QueueTicket>;
	latestCall: QueueTicket | null;
	history: QueueTicket[];
	sequenceByPrefix: Record<string, number>;
}

export interface CounterState {
	counters: Counter[];
	nextCounterId: number;
}

export interface DisplayConfigState {
	services: ServiceConfig[];
	announcements: Announcement[];
	layout: 'default' | 'compact';
}

export interface DisplayAudioSettings {
	enabled: boolean;
	volume: number;
	voiceLang?: string;
}

export interface AuthSession {
	token: string;
	username: string;
	role: 'operator' | 'admin';
	assignedCounterId: number | null;
	expiresAt: number;
}

export interface QueueCalledPayload {
	queue: string;
	counter: number;
	serviceId: string;
	service: string;
	calledAt?: number;
	recallCount?: number;
}

export interface QueueCompletedPayload {
	queue: string;
	counter: number;
}

export interface QueueSkippedPayload {
	queue: string;
	counter: number;
}

export interface CounterUpdatePayload {
	counter: number;
	status: CounterStatus;
	queue: string | null;
	serviceId: string | null;
	service: string | null;
	waitingQueues?: Record<string, QueueSocketWaitingEntry[]>;
	seq?: number;
	serverTime?: string;
}

export interface QueueTakenPayload {
	queue: string;
	serviceId: string;
	service: string;
	createdAt?: number;
}

export interface AnnouncementUpdatePayload {
	announcements?: Announcement[];
	enabled?: boolean;
}

export interface QueueSocketWaitingEntry {
	queueNumber?: string;
	queue?: string;
	serviceId?: string;
	service?: string;
	serviceName?: string;
	createdAt?: number | string;
	calledAt?: number | string;
	recallCount?: number | string;
	[key: string]: unknown;
}

export interface QueueSocketActiveCall {
	queueNumber: string;
	counterId: string;
	eventId?: string;
	seq: number;
	updatedAt: string;
	meta?: Record<string, unknown>;
}

export interface QueueSocketCounterState {
	counterId: string;
	status: string;
	queueNumber?: string;
	seq: number;
	updatedAt: string;
	meta?: Record<string, unknown>;
}

export interface QueueSocketSnapshot {
	branchId: string;
	seq: number;
	serverTime: string;
	activeCalls: Record<string, QueueSocketActiveCall>;
	counterStates: Record<string, QueueSocketCounterState>;
	waitingQueues: Record<string, QueueSocketWaitingEntry[]>;
	announcementEnabled: boolean;
	announcements?: Announcement[];
}

export interface QueueSocketCommandError {
	code: string;
	message: string;
	event: string;
	eventId?: string;
	branchId?: string;
	counterId?: string;
	seq: number;
	serverTime: string;
	details?: Record<string, unknown>;
}

export type QueueSocketEvent =
	| {
			type: 'queue_called';
			payload: QueueCalledPayload;
			clientId?: string;
			eventId?: string;
			emittedAt?: number;
	  }
	| {
			type: 'queue_completed';
			payload: QueueCompletedPayload;
			clientId?: string;
			eventId?: string;
			emittedAt?: number;
	  }
	| {
			type: 'queue_skipped';
			payload: QueueSkippedPayload;
			clientId?: string;
			eventId?: string;
			emittedAt?: number;
	  }
	| {
			type: 'counter_update';
			payload: CounterUpdatePayload;
			clientId?: string;
			eventId?: string;
			emittedAt?: number;
	  }
	| {
			type: 'queue_taken';
			payload: QueueTakenPayload;
			clientId?: string;
			eventId?: string;
			emittedAt?: number;
	  }
	| {
			type: 'announcement_update';
			payload: AnnouncementUpdatePayload;
			clientId?: string;
			eventId?: string;
			emittedAt?: number;
	  };

export type SocketConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';
