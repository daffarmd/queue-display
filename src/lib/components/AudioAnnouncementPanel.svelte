<script lang="ts">
	import {
		audioLastError,
		audioEngineState,
		displayAudioSettings,
		ensureDisplayAudioEnabled,
		initializeDisplayAudio,
		isDisplayAudioSupported,
		resumeDisplayAudio,
		setDisplayAudioEnabled,
		setDisplayAudioVolume,
		speakAudioTest
	} from '$lib/stores/displayAudioStore';
	import { onMount } from 'svelte';

	$: settings = $displayAudioSettings;
	$: supportLabel = $isDisplayAudioSupported
		? settings.enabled
			? 'Browser TTS aktif'
			: 'Browser TTS nonaktif'
		: 'Suara browser tidak tersedia';

	$: engineLabel =
		$audioEngineState === 'browser'
			? 'Engine: Browser TTS (dituning lebih natural)'
			: 'Engine: Tidak tersedia di browser ini';

	onMount(() => {
		initializeDisplayAudio();
	});

	function handleToggle(event: Event): void {
		const target = event.currentTarget as HTMLInputElement;
		setDisplayAudioEnabled(target.checked);
	}

	function handleVolume(event: Event): void {
		const target = event.currentTarget as HTMLInputElement;
		setDisplayAudioVolume(Number(target.value));
	}

	function handleTest(): void {
		ensureDisplayAudioEnabled();
		resumeDisplayAudio();
		speakAudioTest();
	}
</script>

<section class="tv-card p-4 md:p-5">
	<div class="flex items-center justify-between gap-3">
		<h2 class="text-base font-semibold text-slate-800 md:text-lg">Audio Announcement</h2>
		<span
			class={`rounded-full px-3 py-1 text-xs font-semibold ${
				$isDisplayAudioSupported
					? settings.enabled
						? 'bg-green-100 text-green-700'
						: 'bg-slate-100 text-slate-600'
					: 'bg-rose-100 text-rose-700'
			}`}
		>
			{supportLabel}
		</span>
	</div>

	<div class="mt-4 flex items-center justify-between gap-3">
		<label class="text-sm font-medium text-slate-600" for="audio-enabled">Aktifkan Suara</label>
		<input
			id="audio-enabled"
			type="checkbox"
			checked={settings.enabled}
			disabled={!$isDisplayAudioSupported}
			on:change={handleToggle}
			class="h-5 w-5 accent-[#1E63D5]"
		/>
	</div>
	<p class="mt-2 text-xs text-slate-500">{engineLabel}</p>
	{#if $audioLastError}
		<p class="mt-2 rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-xs text-rose-700">
			{$audioLastError}
		</p>
	{/if}

	<div class="mt-4">
		<div class="mb-2 flex items-center justify-between">
			<label class="text-sm font-medium text-slate-600" for="audio-volume">Volume</label>
			<span class="text-sm text-slate-500">{Math.round(settings.volume * 100)}%</span>
		</div>
		<input
			id="audio-volume"
			type="range"
			min="0"
			max="1"
			step="0.05"
			value={settings.volume}
			disabled={!$isDisplayAudioSupported}
			on:input={handleVolume}
			class="h-2 w-full cursor-pointer accent-[#1E63D5]"
		/>
	</div>

	<button
		class="mt-4 rounded-lg bg-[#1E63D5] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#174EA6] disabled:cursor-not-allowed disabled:bg-slate-300"
		disabled={!$isDisplayAudioSupported}
		on:click={handleTest}
	>
		Test
	</button>
</section>
