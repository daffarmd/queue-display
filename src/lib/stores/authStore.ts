import { derived } from 'svelte/store';
import type { AuthSession } from '$lib/types';
import { persistentWritable } from '$lib/utils/persistent';

const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

const authState = persistentWritable<AuthSession | null>('queue-auth-session-v1', null);

function createMockJwt(username: string, role: 'operator' | 'admin', expiresAt: number): string {
	const header = { alg: 'HS256', typ: 'JWT' };
	const payload = { sub: username, role, exp: Math.floor(expiresAt / 1000) };

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
	return $session;
});

export const isOperatorAuthenticated = derived(
	authSession,
	($session) => $session?.role === 'operator' || $session?.role === 'admin'
);

export const isAdminAuthenticated = derived(authSession, ($session) => $session?.role === 'admin');

export function loginOperator(username: string, password: string): { ok: boolean; message: string } {
	if (username.trim() !== 'operator' || password !== 'queue123') {
		return { ok: false, message: 'Username atau password operator tidak valid.' };
	}

	const expiresAt = Date.now() + SESSION_TTL_MS;
	authState.set({
		token: createMockJwt(username.trim(), 'operator', expiresAt),
		username: username.trim(),
		role: 'operator',
		expiresAt
	});

	return { ok: true, message: 'Login operator berhasil.' };
}

export function loginAdmin(username: string, password: string): { ok: boolean; message: string } {
	if (username.trim() !== 'admin' || password !== 'admin123') {
		return { ok: false, message: 'Username atau password admin tidak valid.' };
	}

	const expiresAt = Date.now() + SESSION_TTL_MS;
	authState.set({
		token: createMockJwt(username.trim(), 'admin', expiresAt),
		username: username.trim(),
		role: 'admin',
		expiresAt
	});

	return { ok: true, message: 'Login admin berhasil.' };
}

export function logout(): void {
	authState.set(null);
}
