import { derived } from 'svelte/store';
import type { AuthSession } from '$lib/types';
import { persistentWritable } from '$lib/utils/persistent';

const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

const authState = persistentWritable<AuthSession | null>('queue-auth-session-v1', null);

interface OperatorAccountCredential {
	username: string;
	password: string;
	pin: string;
	counterId: number;
}

const OPERATOR_ACCOUNTS: OperatorAccountCredential[] = [
	{ username: 'op-loket-1', password: 'queue123', pin: '1001', counterId: 1 },
	{ username: 'op-loket-2', password: 'queue123', pin: '1002', counterId: 2 },
	{ username: 'op-loket-3', password: 'queue123', pin: '1003', counterId: 3 },
	{ username: 'op-loket-4', password: 'queue123', pin: '1004', counterId: 4 },
	{ username: 'op-loket-5', password: 'queue123', pin: '1005', counterId: 5 },
	{ username: 'op-loket-6', password: 'queue123', pin: '1006', counterId: 6 }
];

export const operatorLoginHints = OPERATOR_ACCOUNTS.map((account) => ({
	username: account.username,
	counterId: account.counterId,
	pin: account.pin
}));

function createMockJwt(
	username: string,
	role: 'operator' | 'admin',
	expiresAt: number,
	assignedCounterId: number | null
): string {
	const header = { alg: 'HS256', typ: 'JWT' };
	const payload = { sub: username, role, counter: assignedCounterId, exp: Math.floor(expiresAt / 1000) };

	const encode = (value: unknown) => {
		const raw = JSON.stringify(value);
		return btoa(raw).replaceAll('=', '');
	};

	return `${encode(header)}.${encode(payload)}.mock-signature`;
}

function isExpired(session: AuthSession | null): boolean {
	if (!session) return true;
	return session.expiresAt <= Date.now();
}

export const authSession = derived(authState, ($session) => {
	if (isExpired($session)) {
		authState.set(null);
		return null;
	}

	if (!$session) return null;

	// Backward-compatible normalization for older persisted sessions.
	if (typeof $session.assignedCounterId !== 'number' && $session.assignedCounterId !== null) {
		const normalized = {
			...$session,
			assignedCounterId: null
		} satisfies AuthSession;
		authState.set(normalized);
		return normalized;
	}

	return $session;
});

export const isOperatorAuthenticated = derived(
	authSession,
	($session) => $session?.role === 'operator' || $session?.role === 'admin'
);

export const isAdminAuthenticated = derived(authSession, ($session) => $session?.role === 'admin');

export function loginOperator(
	username: string,
	password: string,
	pin: string,
	requestedCounterId?: number
): { ok: boolean; message: string } {
	const trimmedUsername = username.trim();
	const account = OPERATOR_ACCOUNTS.find((item) => item.username === trimmedUsername);
	if (!account || account.password !== password || account.pin !== pin.trim()) {
		return { ok: false, message: 'Username, password, atau PIN operator tidak valid.' };
	}

	if (requestedCounterId !== undefined && account.counterId !== requestedCounterId) {
		return {
			ok: false,
			message: `Akun ini tidak memiliki akses ke loket ${requestedCounterId}.`
		};
	}

	const expiresAt = Date.now() + SESSION_TTL_MS;
	authState.set({
		token: createMockJwt(trimmedUsername, 'operator', expiresAt, account.counterId),
		username: trimmedUsername,
		role: 'operator',
		assignedCounterId: account.counterId,
		expiresAt
	});

	return { ok: true, message: `Login operator berhasil. Akses terkunci ke loket ${account.counterId}.` };
}

export function loginAdmin(username: string, password: string): { ok: boolean; message: string } {
	if (username.trim() !== 'admin' || password !== 'admin123') {
		return { ok: false, message: 'Username atau password admin tidak valid.' };
	}

	const expiresAt = Date.now() + SESSION_TTL_MS;
	authState.set({
		token: createMockJwt(username.trim(), 'admin', expiresAt, null),
		username: username.trim(),
		role: 'admin',
		assignedCounterId: null,
		expiresAt
	});

	return { ok: true, message: 'Login admin berhasil.' };
}

export function logout(): void {
	authState.set(null);
}
