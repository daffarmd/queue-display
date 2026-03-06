<script lang="ts">
	import CounterCard from '$lib/components/CounterCard.svelte';
	import type { Counter } from '$lib/types';

	export let items: Counter[] = [];
</script>

<section>
	<div class="mb-3 flex items-center justify-between">
		<h2 class="text-lg font-semibold text-slate-800 md:text-2xl">Status Loket</h2>
		<p class="text-xs uppercase tracking-[0.18em] text-slate-500 md:text-sm">{items.length} Loket</p>
	</div>
	<div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
		{#each items as item (item.id)}
			<CounterCard counter={item} />
		{/each}
	</div>
</section>
