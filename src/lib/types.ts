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
}

export interface QueueTakenPayload {
	queue: string;
	serviceId: string;
	service: string;
}

export interface AnnouncementUpdatePayload {
	announcements: Announcement[];
}

export type QueueSocketEvent =
	| { type: 'queue_called'; payload: QueueCalledPayload; clientId?: string }
	| { type: 'queue_completed'; payload: QueueCompletedPayload; clientId?: string }
	| { type: 'queue_skipped'; payload: QueueSkippedPayload; clientId?: string }
	| { type: 'counter_update'; payload: CounterUpdatePayload; clientId?: string }
	| { type: 'queue_taken'; payload: QueueTakenPayload; clientId?: string }
	| { type: 'announcement_update'; payload: AnnouncementUpdatePayload; clientId?: string };

export type SocketConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';
