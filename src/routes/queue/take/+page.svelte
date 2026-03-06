<script lang="ts">
	import { waitingTickets } from '$lib/stores/queueStore';
	import { services } from '$lib/stores/configStore';
	import { publicTakeQueue } from '$lib/stores/socketStore';
	import type { QueueTicket } from '$lib/types';

	let selectedServiceId = 'customer-service';
	let generatedTicket: QueueTicket | null = null;

	$: if ($services.length > 0 && !$services.some((service) => service.id === selectedServiceId)) {
		selectedServiceId = $services[0].id;
	}

	$: selectedService = $services.find((service) => service.id === selectedServiceId);
	$: waitingByService = $waitingTickets.reduce<Record<string, number>>((acc, ticket) => {
		acc[ticket.serviceId] = (acc[ticket.serviceId] ?? 0) + 1;
		return acc;
	}, {});

	function handleTakeQueue() {
		if (!selectedService) return;
		generatedTicket = publicTakeQueue(selectedService);
	}
</script>

<svelte:head>
	<title>Take Queue | Queue System</title>
</svelte:head>

<main class="tv-display mx-auto min-h-screen max-w-xl p-4 md:p-6">
	<section class="panel p-6 md:p-8">
		<p class="text-xs uppercase tracking-[0.2em] text-blue-600">Queue Take</p>
		<h1 class="mt-2 text-3xl font-bold text-slate-900">Ambil Nomor Antrian</h1>
		<p class="mt-2 text-slate-600">
			Pilih jenis layanan, lalu tekan tombol untuk mendapatkan nomor antrian.
		</p>

		<div class="mt-6 space-y-4">
			<label class="block text-sm text-slate-500" for="service-select">Jenis layanan</label>
			<select
				id="service-select"
				class="field"
				bind:value={selectedServiceId}
			>
				{#each $services as service (service.id)}
					<option value={service.id}>
						{service.name} - waiting {waitingByService[service.id] ?? 0}
					</option>
				{/each}
			</select>
			<button
				class="w-full rounded-lg bg-[#1E63D5] px-4 py-3 text-lg font-semibold text-white transition hover:bg-[#174EA6]"
				on:click={handleTakeQueue}
			>
				Ambil Nomor
			</button>
		</div>

		{#if generatedTicket}
			<div class="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-5 text-center">
				<p class="text-sm uppercase tracking-[0.2em] text-amber-700">Nomor Anda</p>
				<p class="mt-2 text-6xl font-black text-[#F4B400]">{generatedTicket.queue}</p>
				<p class="mt-2 text-base text-slate-700">{generatedTicket.serviceName}</p>
				<p class="mt-1 text-sm text-slate-600">Silakan tunggu hingga nomor dipanggil.</p>
			</div>
		{/if}

		<p class="mt-6 text-sm text-slate-500">
			Alternatif form tersedia di <a class="text-blue-600 underline" href="/queue/form">/queue/form</a>.
		</p>
	</section>
</main>
