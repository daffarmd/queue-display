<script lang="ts">
	import AnnouncementPanel from '$lib/components/AnnouncementPanel.svelte';
	import CounterGrid from '$lib/components/CounterGrid.svelte';
	import HeaderBar from '$lib/components/HeaderBar.svelte';
	import QrPanel from '$lib/components/QrPanel.svelte';
	import QueueCard from '$lib/components/QueueCard.svelte';
	import { counters } from '$lib/stores/counterStore';
	import { announcements, displayLayout } from '$lib/stores/configStore';
	import { latestQueueCall } from '$lib/stores/queueStore';
	import { connectionState } from '$lib/stores/socketStore';

	$: showReconnectBanner =
		$connectionState === 'connecting' ||
		$connectionState === 'reconnecting' ||
		$connectionState === 'disconnected';

	$: contentGridClass =
		$displayLayout === 'compact'
			? 'grid gap-6 xl:grid-cols-[18rem_minmax(0,1fr)_20rem]'
			: 'grid gap-6 xl:grid-cols-[22rem_minmax(0,1fr)_24rem]';
</script>

<svelte:head>
	<title>Tes Display | Queue System</title>
</svelte:head>

<main class="tv-display min-h-screen p-4 md:p-6">
	<HeaderBar
		title="Display Antrian Test"
		subtitle="Mode visual tanpa Audio Announcement"
	/>

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

	<div class="mt-6">
		<CounterGrid items={$counters} />
	</div>
</main>
