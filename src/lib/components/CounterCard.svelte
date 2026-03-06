<script lang="ts">
	import type { Counter } from '$lib/types';

	export let counter: Counter;

	const statusStyle = {
		idle: {
			label: 'Idle',
			badge: 'bg-slate-100 text-slate-600 border-slate-300',
			accent: 'bg-slate-400'
		},
		calling: {
			label: 'Memanggil',
			badge: 'bg-amber-100 text-amber-700 border-amber-300',
			accent: 'bg-amber-500'
		},
		serving: {
			label: 'Sedang Dilayani',
			badge: 'bg-green-100 text-green-700 border-green-300',
			accent: 'bg-green-600'
		},
		offline: {
			label: 'Offline',
			badge: 'bg-red-100 text-red-700 border-red-300',
			accent: 'bg-red-600'
		}
	} as const;

	$: tone = statusStyle[counter.status];
</script>

<article class="tv-card relative overflow-hidden p-4">
	<div class={`absolute inset-y-0 left-0 w-1.5 ${tone.accent}`}></div>
	<div class="flex items-center justify-between gap-3">
		<h3 class="text-lg font-semibold text-slate-800 md:text-2xl">{counter.name}</h3>
		<span class={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide ${tone.badge}`}>
			{tone.label}
		</span>
	</div>

	<p class="mt-2 text-sm text-slate-500 md:text-base">{counter.serviceName ?? 'Belum ada layanan aktif'}</p>
	<p class="mt-3 text-3xl font-bold text-slate-800 md:text-4xl">{counter.currentQueue ?? '-'}</p>
</article>
