<script lang="ts">
	import { onMount } from 'svelte';

	export let locale = 'id-ID';
	export let showDate = true;
	export let tone: 'light' | 'dark' = 'light';

	let now = new Date();

	$: timeLabel = new Intl.DateTimeFormat(locale, {
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit'
	}).format(now);

	$: dateLabel = new Intl.DateTimeFormat(locale, {
		weekday: 'long',
		day: '2-digit',
		month: 'long',
		year: 'numeric'
	}).format(now);

	onMount(() => {
		const timer = setInterval(() => {
			now = new Date();
		}, 1000);

		return () => clearInterval(timer);
	});
</script>

<div class="text-right">
	{#if showDate}
		<p class={`text-sm font-medium md:text-base ${tone === 'light' ? 'text-blue-100' : 'text-slate-500'}`}>
			{dateLabel}
		</p>
	{/if}
	<p class={`text-2xl font-bold tracking-wide md:text-4xl ${tone === 'light' ? 'text-white' : 'text-slate-800'}`}>
		{timeLabel}
	</p>
</div>
