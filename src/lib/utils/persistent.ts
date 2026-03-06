import { browser } from '$app/environment';
import { writable, type Writable } from 'svelte/store';

function safeParse<T>(value: string | null, fallback: T): T {
	if (!value) return fallback;
	try {
		return JSON.parse(value) as T;
	} catch {
		return fallback;
	}
}

export function persistentWritable<T>(key: string, initialValue: T): Writable<T> {
	const startingValue = browser ? safeParse(localStorage.getItem(key), initialValue) : initialValue;
	const store = writable<T>(startingValue);

	if (browser) {
		store.subscribe((value) => {
			localStorage.setItem(key, JSON.stringify(value));
		});

		window.addEventListener('storage', (event) => {
			if (event.key !== key) return;
			store.set(safeParse<T>(event.newValue, initialValue));
		});
	}

	return store;
}

