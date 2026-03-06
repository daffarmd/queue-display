<script lang="ts">
	import type { QueueTicket } from '$lib/types';

	export let ticket: QueueTicket | null = null;

	$: queueTone =
		ticket?.status === 'serving'
			? 'text-[#16A34A]'
			: ticket?.status === 'called'
				? 'text-[#F4B400]'
				: 'text-slate-400';

	$: statusLabel =
		ticket?.status === 'serving'
			? 'Sedang Dilayani'
			: ticket?.status === 'called'
				? 'Memanggil'
				: ticket?.status === 'completed'
					? 'Selesai'
					: ticket?.status === 'skipped'
						? 'Dilewati'
						: 'Menunggu';
</script>

<section class="tv-card flex min-h-[20rem] flex-col justify-between p-6 md:p-8">
	<div>
		<p class="text-sm uppercase tracking-[0.2em] text-slate-500">Nomor Antrian Aktif</p>
		{#if ticket}
			<h2 class={`mt-4 text-7xl font-black tracking-tight md:text-8xl ${queueTone}`}>{ticket.queue}</h2>
			<p class="mt-3 text-lg text-slate-700 md:text-2xl">{ticket.serviceName}</p>
			<p class="mt-1 text-xl font-semibold text-slate-800 md:text-3xl">
				Loket {ticket.counterId ?? '-'}
			</p>
		{:else}
			<h2 class="mt-4 text-4xl font-bold text-slate-500 md:text-5xl">Menunggu panggilan</h2>
			<p class="mt-3 text-lg text-slate-600">Operator belum memanggil nomor baru.</p>
		{/if}
	</div>

	{#if ticket}
		<div
			class={`mt-6 rounded-xl border px-4 py-3 text-sm md:text-base ${
				ticket.status === 'serving'
					? 'border-green-200 bg-green-50 text-green-700'
					: ticket.status === 'called'
						? 'border-amber-200 bg-amber-50 text-amber-700'
						: ticket.status === 'completed'
							? 'border-slate-200 bg-slate-50 text-slate-700'
							: 'border-rose-200 bg-rose-50 text-rose-700'
			}`}
		>
			Status: {statusLabel}
		</div>
	{/if}
</section>
