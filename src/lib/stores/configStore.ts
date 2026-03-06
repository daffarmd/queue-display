import { derived } from 'svelte/store';
import type { Announcement, DisplayConfigState, ServiceConfig } from '$lib/types';
import { persistentWritable } from '$lib/utils/persistent';

const initialState: DisplayConfigState = {
	services: [
		{ id: 'customer-service', name: 'Customer Service', prefix: 'CS' },
		{ id: 'teller', name: 'Teller', prefix: 'TL' },
		{ id: 'priority', name: 'Priority', prefix: 'PR' }
	],
	announcements: [
		{
			id: 'promo-open-account',
			title: 'Promo Pembukaan Rekening',
			message: 'Gratis biaya admin 3 bulan untuk nasabah baru.'
		},
		{
			id: 'promo-online-banking',
			title: 'Aktivasi Mobile Banking',
			message: 'Aktifkan hari ini dan dapatkan kuota internet 5GB.'
		}
	],
	layout: 'default'
};

const configState = persistentWritable<DisplayConfigState>('queue-display-config-v1', initialState);

export const services = derived(configState, ($config) => $config.services);
export const announcements = derived(configState, ($config) => $config.announcements);
export const displayLayout = derived(configState, ($config) => $config.layout);

function slugify(value: string): string {
	return value
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
}

export function getServiceById(serviceId: string): ServiceConfig | undefined {
	let selected: ServiceConfig | undefined;
	configState.update((current) => {
		selected = current.services.find((service) => service.id === serviceId);
		return current;
	});
	return selected;
}

export function addService(name: string, prefix: string): ServiceConfig | null {
	const trimmedName = name.trim();
	const trimmedPrefix = prefix.trim().toUpperCase();
	if (!trimmedName || !trimmedPrefix) return null;

	let created: ServiceConfig | null = null;

	configState.update((current) => {
		const id = slugify(trimmedName);
		if (current.services.some((item) => item.id === id || item.prefix === trimmedPrefix)) {
			return current;
		}

		created = { id, name: trimmedName, prefix: trimmedPrefix };
		return {
			...current,
			services: [...current.services, created]
		};
	});

	return created;
}

export function removeService(serviceId: string): void {
	configState.update((current) => {
		if (current.services.length <= 1) return current;
		return {
			...current,
			services: current.services.filter((service) => service.id !== serviceId)
		};
	});
}

export function addAnnouncement(title: string, message: string): Announcement | null {
	const trimmedTitle = title.trim();
	const trimmedMessage = message.trim();
	if (!trimmedTitle || !trimmedMessage) return null;

	const announcement: Announcement = {
		id: crypto.randomUUID(),
		title: trimmedTitle,
		message: trimmedMessage
	};

	configState.update((current) => ({
		...current,
		announcements: [announcement, ...current.announcements]
	}));

	return announcement;
}

export function removeAnnouncement(id: string): void {
	configState.update((current) => ({
		...current,
		announcements: current.announcements.filter((item) => item.id !== id)
	}));
}

export function setAnnouncements(next: Announcement[]): void {
	configState.update((current) => ({
		...current,
		announcements: next
	}));
}

export function setLayout(layout: 'default' | 'compact'): void {
	configState.update((current) => ({
		...current,
		layout
	}));
}

