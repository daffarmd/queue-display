import { browser } from '$app/environment';
import { derived, get, writable } from 'svelte/store';
import type { DisplayAudioSettings, QueueCalledPayload } from '$lib/types';
import { persistentWritable } from '$lib/utils/persistent';

const STORAGE_KEY = 'queue-display-audio-settings-v4';

const defaultSettings: DisplayAudioSettings = {
	enabled: true,
	volume: 1,
	voiceLang: undefined
};

type AudioSupportState = 'available' | 'unavailable' | 'unknown';

const audioSettingsStore = persistentWritable<DisplayAudioSettings>(STORAGE_KEY, defaultSettings);
export const displayAudioSettings = audioSettingsStore;
export const isDisplayAudioEnabled = derived(displayAudioSettings, ($settings) => $settings.enabled);

const supportState = writable<AudioSupportState>('unknown');
export const audioEngineState = derived(supportState, ($state) =>
	$state === 'available' ? 'browser' : 'unavailable'
);
export const isDisplayAudioSupported = derived(supportState, ($state) => $state === 'available');
export const audioLastError = writable<string | null>(null);

let initialized = false;
let synth: SpeechSynthesis | null = null;
let selectedVoice: SpeechSynthesisVoice | null = null;
let playbackSession = 0;
let pendingSegmentTimeout: ReturnType<typeof setTimeout> | null = null;
let warmupDone = false;
let lastQueueCallSignature = '';
let lastQueueCallAt = 0;
const CALL_DEDUPE_WINDOW_MS = 2500;

function formatSpeechError(errorValue: unknown): string {
	const normalized = typeof errorValue === 'string' ? errorValue : 'unknown';
	return `Mesin TTS browser gagal memutar suara (${normalized}).`;
}

const FEMALE_HINTS = ['female', 'woman', 'girl', 'zira', 'gadis', 'perempuan', 'siti', 'putri'];
const MALE_HINTS = ['male', 'man', 'boy', 'andika', 'ardi', 'pria', 'laki'];
const NATURAL_HINTS = ['natural', 'neural', 'online', 'google', 'microsoft', 'siri', 'premium'];
const ROBOTIC_HINTS = ['espeak', 'festival', 'mbrola', 'robot'];
const DIGIT_WORDS: Record<string, string> = {
	'0': 'nol',
	'1': 'satu',
	'2': 'dua',
	'3': 'tiga',
	'4': 'empat',
	'5': 'lima',
	'6': 'enam',
	'7': 'tujuh',
	'8': 'delapan',
	'9': 'sembilan'
};

function clampVolume(value: number): number {
	if (!Number.isFinite(value)) return defaultSettings.volume;
	return Math.min(1, Math.max(0, value));
}

function isIndonesianVoice(voice: SpeechSynthesisVoice): boolean {
	const lang = voice.lang.toLowerCase();
	const name = voice.name.toLowerCase();
	return lang.startsWith('id') || name.includes('indonesia') || name.includes('bahasa');
}

function isFemaleVoice(voice: SpeechSynthesisVoice): boolean {
	const name = voice.name.toLowerCase();
	if (MALE_HINTS.some((hint) => name.includes(hint))) return false;
	return FEMALE_HINTS.some((hint) => name.includes(hint));
}

function scoreVoice(voice: SpeechSynthesisVoice, preferredLang?: string): number {
	const lang = voice.lang.toLowerCase();
	const name = voice.name.toLowerCase();
	let score = 0;

	if (preferredLang && lang === preferredLang.toLowerCase()) score += 90;
	if (isIndonesianVoice(voice)) score += 110;
	if (lang.startsWith('id')) score += 60;
	if (isFemaleVoice(voice)) score += 20;
	if (NATURAL_HINTS.some((hint) => name.includes(hint))) score += 35;
	if (ROBOTIC_HINTS.some((hint) => name.includes(hint))) score -= 120;
	if (voice.localService) score += 8;

	return score;
}

function pickVoice(preferredLang?: string): SpeechSynthesisVoice | null {
	if (!synth) return null;
	const voices = synth.getVoices();
	if (voices.length === 0) return null;

	const ranked = [...voices].sort((a, b) => scoreVoice(b, preferredLang) - scoreVoice(a, preferredLang));
	const topScore = scoreVoice(ranked[0], preferredLang);
	if (topScore > 0) return ranked[0];

	const langCandidates = [preferredLang, 'id-ID', 'en-US'].filter(Boolean) as string[];
	for (const lang of langCandidates) {
		const exact = voices.find((voice) => voice.lang.toLowerCase() === lang.toLowerCase());
		if (exact) return exact;
	}

	return voices[0] ?? null;
}

function refreshVoice(): void {
	const settings = get(displayAudioSettings);
	selectedVoice = pickVoice(settings.voiceLang);
}

function createUtterance(
	text: string,
	options?: {
		rate?: number;
		pitch?: number;
	}
): SpeechSynthesisUtterance | null {
	if (!synth) return null;

	const settings = get(displayAudioSettings);
	const utterance = new SpeechSynthesisUtterance(text);
	utterance.volume = clampVolume(settings.volume);
	utterance.rate = options?.rate ?? 0.95;
	utterance.pitch = options?.pitch ?? 1;

	const voice = selectedVoice ?? pickVoice(settings.voiceLang);
	if (voice) {
		utterance.voice = voice;
		// Keep utterance language aligned with selected voice for better browser compatibility.
		utterance.lang = voice.lang || settings.voiceLang || navigator.language || 'en-US';
	} else {
		utterance.lang = settings.voiceLang ?? navigator.language ?? 'en-US';
	}

	return utterance;
}

function stopSpeech(): void {
	playbackSession += 1;
	if (pendingSegmentTimeout) {
		clearTimeout(pendingSegmentTimeout);
		pendingSegmentTimeout = null;
	}
	if (synth) synth.cancel();
}

function speakUsingDefaultVoice(text: string): void {
	if (!ensureAudioReady() || !synth || !text.trim()) return;

	stopSpeech();
	const settings = get(displayAudioSettings);
	const utterance = new SpeechSynthesisUtterance(text);
	utterance.volume = clampVolume(settings.volume);
	utterance.rate = 0.95;
	utterance.pitch = 1;
	utterance.lang = 'id-ID';

	utterance.onstart = () => {
		audioLastError.set(null);
	};

	utterance.onerror = (event: Event) => {
		const speechEvent = event as SpeechSynthesisErrorEvent;
		audioLastError.set(formatSpeechError(speechEvent.error));
	};

	synth.speak(utterance);
}

function ensureAudioReady(): boolean {
	if (!browser) return false;
	if (!initialized) initializeDisplayAudio();
	if (!synth) return false;
	return get(supportState) === 'available';
}

export function resumeDisplayAudio(): void {
	if (!ensureAudioReady() || !synth) return;
	try {
		synth.resume();
	} catch {
		// noop
	}
}

export function ensureDisplayAudioEnabled(): void {
	const settings = get(displayAudioSettings);
	if (!settings.enabled) setDisplayAudioEnabled(true);
}

function speakSegmented(
	segments: Array<{
		text: string;
		rate?: number;
		pitch?: number;
		pauseMs?: number;
	}>,
	options?: {
		interrupt?: boolean;
	}
): void {
	if (!ensureAudioReady() || !synth) return;
	const validSegments = segments.filter((segment) => segment.text.trim().length > 0);
	if (validSegments.length === 0) return;
	const plainFallbackText = validSegments.map((segment) => segment.text.trim()).join(' ');
	let fallbackAttempted = false;
	const shouldInterrupt = options?.interrupt ?? true;

	resumeDisplayAudio();
	if (shouldInterrupt) {
		stopSpeech();
	}
	const currentSession = playbackSession;
	let currentIndex = 0;

	const speakNext = () => {
		if (currentSession !== playbackSession) return;
		if (!synth) return;
		if (currentIndex >= validSegments.length) return;
		const segment = validSegments[currentIndex];
		const utterance = createUtterance(segment.text, {
			rate: segment.rate,
			pitch: segment.pitch
		});
		if (!utterance) return;

		utterance.onstart = () => {
			audioLastError.set(null);
		};

		utterance.onend = () => {
			if (currentSession !== playbackSession) return;
			currentIndex += 1;
			const delay = segment.pauseMs ?? 0;
			if (delay > 0) {
				pendingSegmentTimeout = setTimeout(() => {
					pendingSegmentTimeout = null;
					speakNext();
				}, delay);
			} else {
				speakNext();
			}
		};

		utterance.onerror = (event: Event) => {
			if (currentSession !== playbackSession) return;
			const speechEvent = event as SpeechSynthesisErrorEvent;
			audioLastError.set(formatSpeechError(speechEvent.error));

			if (!fallbackAttempted) {
				fallbackAttempted = true;
				speakUsingDefaultVoice(plainFallbackText);
				return;
			}

			currentIndex += 1;
			speakNext();
		};

		synth.speak(utterance);
	};

	speakNext();
}

export function initializeDisplayAudio(): void {
	if (!browser || initialized) return;
	initialized = true;

	if (!('speechSynthesis' in window)) {
		supportState.set('unavailable');
		return;
	}

	synth = window.speechSynthesis;
	supportState.set('available');
	audioLastError.set(null);
	// Warm-up voice list to reduce first-call drop on some browsers.
	try {
		synth.getVoices();
	} catch {
		// noop
	}
	refreshVoice();
	synth.addEventListener('voiceschanged', refreshVoice);
}

function warmupSpeechEngine(): void {
	if (!ensureAudioReady() || !synth || warmupDone) return;
	try {
		const probe = new SpeechSynthesisUtterance(' ');
		probe.volume = 0;
		probe.rate = 1;
		probe.pitch = 1;
		synth.speak(probe);
		synth.cancel();
		warmupDone = true;
	} catch {
		// noop
	}
}

export function setDisplayAudioEnabled(enabled: boolean): void {
	displayAudioSettings.update((current) => ({
		...current,
		enabled
	}));
}

export function setDisplayAudioVolume(volume: number): void {
	const nextVolume = clampVolume(volume);
	displayAudioSettings.update((current) => ({
		...current,
		volume: nextVolume
	}));
}

export function speakQueueCall(payload: QueueCalledPayload): void {
	ensureDisplayAudioEnabled();
	resumeDisplayAudio();
	warmupSpeechEngine();

	const callSignature = `${payload.queue}-${payload.counter}-${payload.calledAt ?? 0}-${payload.recallCount ?? 0}`;
	const nowMs = Date.now();
	if (callSignature === lastQueueCallSignature && nowMs - lastQueueCallAt < CALL_DEDUPE_WINDOW_MS) {
		return;
	}
	lastQueueCallSignature = callSignature;
	lastQueueCallAt = nowMs;

	const queueSpeech = toSpokenQueue(payload.queue);
	const counterSpeech = toSpokenCounter(payload.counter);

	speakSegmented([
		{
			text: `Perhatian. Nomor antrian ${queueSpeech}, silakan menuju loket ${counterSpeech}. Terima kasih.`,
			rate: 0.93,
			pitch: 1
		}
	], { interrupt: false });
}

export function speakAudioTest(): void {
	ensureDisplayAudioEnabled();
	resumeDisplayAudio();
	warmupSpeechEngine();
	speakSegmented([
		{
			text: 'Tes suara. Perhatian, nomor antrian ce es nol nol empat belas, silakan menuju loket tiga. Terima kasih.',
			rate: 0.93,
			pitch: 1
		}
	]);
}

export function shouldAnnounceQueueAudio(): boolean {
	return get(displayAudioSettings).enabled;
}

function toSpokenQueue(queueCode: string): string {
	const trimmed = queueCode.trim().toUpperCase();
	if (!trimmed) return queueCode;

	const parts = trimmed.match(/^([A-Z]+)(\d+)$/);
	if (!parts) return trimmed.split('').join(' ');

	const prefix = toSpokenPrefix(parts[1]);
	const digits = toSpokenNumberWithLeadingZeros(parts[2]);

	return `${prefix} ${digits}`;
}

function toSpokenPrefix(prefix: string): string {
	if (prefix === 'CS') return 'ce es';
	if (prefix === 'TL') return 'te el';
	if (prefix === 'PR') return 'pe er';
	return prefix.split('').join(' ').toLowerCase();
}

function toSpokenNumberWithLeadingZeros(numberText: string): string {
	const leadingZeroMatch = numberText.match(/^0+/);
	const leadingZeros = leadingZeroMatch ? leadingZeroMatch[0].length : 0;
	const rest = numberText.slice(leadingZeros);

	const zeroWords = new Array(leadingZeros).fill('nol');
	if (!rest) return zeroWords.join(' ');

	const numeric = Number(rest);
	if (!Number.isFinite(numeric)) {
		return numberText
			.split('')
			.map((digit) => DIGIT_WORDS[digit] ?? digit)
			.join(' ');
	}

	const spokenRest = numberToBahasa(numeric);
	return [...zeroWords, spokenRest].join(' ').trim();
}

function numberToBahasa(value: number): string {
	const angka = [
		'nol',
		'satu',
		'dua',
		'tiga',
		'empat',
		'lima',
		'enam',
		'tujuh',
		'delapan',
		'sembilan',
		'sepuluh',
		'sebelas'
	];

	if (value < 12) return angka[value];
	if (value < 20) return `${angka[value - 10]} belas`;
	if (value < 100) {
		const puluh = Math.floor(value / 10);
		const sisa = value % 10;
		return `${angka[puluh]} puluh${sisa ? ` ${numberToBahasa(sisa)}` : ''}`;
	}
	if (value < 200) return `seratus${value > 100 ? ` ${numberToBahasa(value - 100)}` : ''}`;
	if (value < 1000) {
		const ratus = Math.floor(value / 100);
		const sisa = value % 100;
		return `${angka[ratus]} ratus${sisa ? ` ${numberToBahasa(sisa)}` : ''}`;
	}
	if (value < 2000) return `seribu${value > 1000 ? ` ${numberToBahasa(value - 1000)}` : ''}`;
	if (value < 1000000) {
		const ribu = Math.floor(value / 1000);
		const sisa = value % 1000;
		return `${numberToBahasa(ribu)} ribu${sisa ? ` ${numberToBahasa(sisa)}` : ''}`;
	}

	return String(value);
}

function toSpokenCounter(counterNumber: number): string {
	return numberToBahasa(counterNumber);
}
