<script lang="ts">
	import { onMount } from 'svelte';
	import AudioAnnouncementPanel from '$lib/components/AudioAnnouncementPanel.svelte';
	import AnnouncementPanel from '$lib/components/AnnouncementPanel.svelte';
	import CounterGrid from '$lib/components/CounterGrid.svelte';
	import HeaderBar from '$lib/components/HeaderBar.svelte';
	import QrPanel from '$lib/components/QrPanel.svelte';
	import QueueCard from '$lib/components/QueueCard.svelte';
	import { counters } from '$lib/stores/counterStore';
	import { announcements, displayLayout } from '$lib/stores/configStore';
	import { latestQueueCall } from '$lib/stores/queueStore';
	import { connectionState, lastSocketEvent } from '$lib/stores/socketStore';
	import {
		initializeDisplayAudio,
		shouldAnnounceQueueAudio,
		speakQueueCall
	} from '$lib/stores/displayAudioStore';

	$: showReconnectBanner =
		$connectionState === 'connecting' ||
		$connectionState === 'reconnecting' ||
		$connectionState === 'disconnected';

	$: contentGridClass =
		$displayLayout === 'compact'
			? 'grid gap-6 xl:grid-cols-[18rem_minmax(0,1fr)_20rem]'
			: 'grid gap-6 xl:grid-cols-[22rem_minmax(0,1fr)_24rem]';

	onMount(() => {
		initializeDisplayAudio();

		let isFirstEmission = true;
		let lastAnnouncedSignature = '';
		let lastAnnouncedAt = 0;
		const unsubscribe = lastSocketEvent.subscribe((event) => {
			if (isFirstEmission) {
				isFirstEmission = false;
				return;
			}
			if (!event || event.type !== 'queue_called') return;
			if (!shouldAnnounceQueueAudio()) return;

			const signature = `${event.payload.queue}-${event.payload.counter}`;
			const now = Date.now();
			if (signature === lastAnnouncedSignature && now - lastAnnouncedAt < 1200) {
				return;
			}
			lastAnnouncedSignature = signature;
			lastAnnouncedAt = now;

			speakQueueCall(event.payload);
		});

		return () => unsubscribe();
	});
</script>

<svelte:head>
	<title>Display | Queue System</title>
</svelte:head>

<main class="tv-display min-h-screen p-4 md:p-6">
	<HeaderBar title="Display Antrian Digital" subtitle="Layar TV / Monitor Real-time Queue" />

	{#if showReconnectBanner}
		<div class="mt-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-amber-700">
			Reconnecting... koneksi realtime terputus, mencoba ulang setiap 3 detik.
		</div>
	{/if}

	<div class={`mt-6 ${contentGridClass}`}>
		<QrPanel targetPath="/queue/take" />
		<QueueCard ticket={$latestQueueCall} />
		<AnnouncementPanel items={$announcements} />
	</div>

	<div class="mt-4 max-w-xl">
		<AudioAnnouncementPanel />
	</div>

	<div class="mt-6">
		<CounterGrid items={$counters} />
	</div>
</main>
