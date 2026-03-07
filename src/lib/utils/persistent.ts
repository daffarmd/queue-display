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

interface PersistentWritableOptions {
	syncTabs?: boolean;
}

export function persistentWritable<T>(
	key: string,
	initialValue: T,
	options?: PersistentWritableOptions
): Writable<T> {
	const syncTabs = options?.syncTabs ?? true;
	const startingValue = browser ? safeParse(localStorage.getItem(key), initialValue) : initialValue;
	const store = writable<T>(startingValue);

	if (browser) {
		store.subscribe((value) => {
			localStorage.setItem(key, JSON.stringify(value));
		});

		if (syncTabs) {
			window.addEventListener('storage', (event) => {
				if (event.key !== key) return;
				store.set(safeParse<T>(event.newValue, initialValue));
			});
		}
	}

	return store;
}
