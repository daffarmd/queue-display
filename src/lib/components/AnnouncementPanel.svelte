<script lang="ts">
	import { onMount } from 'svelte';
	import type { Announcement } from '$lib/types';

	export let items: Announcement[] = [];

	let activeIndex = 0;

	$: list =
		items.length > 0
			? items
			: [
					{
						id: 'default-announcement',
						title: 'Pengumuman Layanan',
						message: 'Silakan tunggu nomor antrian Anda dipanggil.'
					}
				];

	$: if (activeIndex >= list.length) {
		activeIndex = 0;
	}

	$: current = list[activeIndex];

	onMount(() => {
		const timer = setInterval(() => {
			activeIndex = (activeIndex + 1) % list.length;
		}, 6000);

		return () => clearInterval(timer);
	});
</script>

<section
	class="flex h-full flex-col rounded-[1.1rem] border border-red-700/30 bg-[linear-gradient(140deg,#C62828,#991B1B)] p-6 text-white shadow-[0_10px_24px_rgba(153,27,27,0.28)]"
>
	<p class="text-sm uppercase tracking-[0.2em] text-red-100">Pengumuman</p>
	<h2 class="mt-4 text-2xl font-semibold text-white md:text-3xl">{current.title}</h2>
	<p class="mt-3 text-lg text-red-50">{current.message}</p>

	<div class="mt-auto flex gap-2 pt-6">
		{#each list as item, index (item.id)}
			<span
				class={`h-2 w-8 rounded-full transition ${
					index === activeIndex ? 'bg-yellow-300' : 'bg-red-200/35'
				}`}
				aria-hidden="true"
			></span>
		{/each}
	</div>
</section>
