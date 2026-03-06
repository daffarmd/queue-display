<script lang="ts">
	import Clock from '$lib/components/Clock.svelte';

	export let title = 'Digital Queue Display';
	export let subtitle = 'Realtime Queue Management';
	export let showClock = true;
</script>

<header class="tv-header flex items-center justify-between gap-6 px-6 py-5 md:px-8 md:py-6">
	<div>
		<p class="text-xs uppercase tracking-[0.2em] text-blue-100 md:text-sm">Queue System</p>
		<h1 class="mt-1 text-2xl font-semibold text-white md:text-4xl">{title}</h1>
		<p class="text-sm text-blue-100/95 md:text-base">{subtitle}</p>
	</div>

	{#if showClock}
		<Clock tone="light" />
	{/if}
</header>
