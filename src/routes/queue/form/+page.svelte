<script lang="ts">
	import { services } from '$lib/stores/configStore';
	import { publicTakeQueue } from '$lib/stores/socketStore';
	import type { QueueTicket } from '$lib/types';

	let fullName = '';
	let selectedServiceId = 'customer-service';
	let generatedTicket: QueueTicket | null = null;
	let formError = '';

	$: if ($services.length > 0 && !$services.some((service) => service.id === selectedServiceId)) {
		selectedServiceId = $services[0].id;
	}

	$: selectedService = $services.find((service) => service.id === selectedServiceId);

	function submitForm() {
		if (!fullName.trim()) {
			formError = 'Nama wajib diisi.';
			return;
		}
		if (!selectedService) {
			formError = 'Layanan tidak valid.';
			return;
		}

		formError = '';
		generatedTicket = publicTakeQueue(selectedService);
	}
</script>

<svelte:head>
	<title>Queue Form | Queue System</title>
</svelte:head>

<main class="tv-display mx-auto min-h-screen max-w-xl p-4 md:p-6">
	<section class="panel p-6 md:p-8">
		<p class="text-xs uppercase tracking-[0.2em] text-blue-600">Queue Form</p>
		<h1 class="mt-2 text-3xl font-bold text-slate-900">Form Pengambilan Antrian</h1>

		<form class="mt-6 space-y-4" on:submit|preventDefault={submitForm}>
			<div>
				<label class="mb-1 block text-sm text-slate-500" for="visitor-name">Nama</label>
				<input
					id="visitor-name"
					class="field"
					placeholder="Masukkan nama lengkap"
					bind:value={fullName}
				/>
			</div>
			<div>
				<label class="mb-1 block text-sm text-slate-500" for="service-id">Layanan</label>
				<select
					id="service-id"
					class="field"
					bind:value={selectedServiceId}
				>
					{#each $services as service (service.id)}
						<option value={service.id}>{service.name}</option>
					{/each}
				</select>
			</div>

			{#if formError}
				<p class="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700">
					{formError}
				</p>
			{/if}

			<button class="w-full rounded-lg bg-[#1E63D5] px-4 py-3 text-lg font-semibold text-white">
				Submit & Ambil Nomor
			</button>
		</form>

		{#if generatedTicket}
			<div class="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-5 text-center">
				<p class="text-sm uppercase tracking-[0.2em] text-amber-700">Nomor Antrian</p>
				<p class="mt-2 text-6xl font-black text-[#F4B400]">{generatedTicket.queue}</p>
				<p class="mt-2 text-base text-slate-700">
					{fullName} - {generatedTicket.serviceName}
				</p>
			</div>
		{/if}
	</section>
</main>
