<script lang="ts">
	import { activeByCounter, waitingTickets } from '$lib/stores/queueStore';
	import { counters } from '$lib/stores/counterStore';
	import { isOperatorAuthenticated, loginOperator, logout } from '$lib/stores/authStore';
	import {
		connectionState,
		operatorCallNext,
		operatorComplete,
		operatorRecall,
		operatorSkip,
		operatorStartServing,
		operatorTransfer
	} from '$lib/stores/socketStore';

	let username = 'operator';
	let password = 'queue123';
	let authError = '';
	let actionMessage = '';
	let selectedCounterId = 1;
	let transferTargetId: number | null = null;

	$: if ($counters.length > 0 && !$counters.some((counter) => counter.id === selectedCounterId)) {
		selectedCounterId = $counters[0].id;
	}

	$: selectedCounter = $counters.find((counter) => counter.id === selectedCounterId);
	$: selectedTicket = selectedCounter ? $activeByCounter[String(selectedCounter.id)] : null;
	$: availableTargets = $counters.filter(
		(counter) => counter.id !== selectedCounterId && counter.status !== 'offline'
	);

	$: if (availableTargets.length > 0 && !availableTargets.some((counter) => counter.id === transferTargetId)) {
		transferTargetId = availableTargets[0].id;
	}

	function submitLogin() {
		const result = loginOperator(username, password);
		if (!result.ok) {
			authError = result.message;
			return;
		}
		authError = '';
	}

	function handleCallNext() {
		if (!selectedCounter || selectedCounter.status === 'offline') {
			actionMessage = 'Loket sedang offline.';
			return;
		}

		const ticket = operatorCallNext(selectedCounter.id, selectedCounter.serviceId);
		actionMessage = ticket
			? `${ticket.queue} dipanggil ke ${selectedCounter.name}.`
			: 'Tidak ada antrean menunggu untuk layanan loket ini.';
	}

	function handleRecall() {
		if (!selectedCounter) return;
		const ticket = operatorRecall(selectedCounter.id);
		actionMessage = ticket ? `Panggil ulang ${ticket.queue}.` : 'Belum ada nomor aktif di loket.';
	}

	function handleStartServing() {
		if (!selectedCounter) return;
		const ticket = operatorStartServing(selectedCounter.id);
		actionMessage = ticket ? `${ticket.queue} masuk status sedang dilayani.` : 'Belum ada nomor aktif.';
	}

	function handleSkip() {
		if (!selectedCounter) return;
		const ticket = operatorSkip(selectedCounter.id);
		actionMessage = ticket ? `${ticket.queue} di-skip.` : 'Belum ada nomor aktif.';
	}

	function handleComplete() {
		if (!selectedCounter) return;
		const ticket = operatorComplete(selectedCounter.id);
		actionMessage = ticket ? `${ticket.queue} selesai dilayani.` : 'Belum ada nomor aktif.';
	}

	function handleTransfer() {
		if (!selectedCounter || transferTargetId === null) return;
		const ticket = operatorTransfer(selectedCounter.id, transferTargetId);
		actionMessage = ticket
			? `${ticket.queue} dipindahkan ke Loket ${transferTargetId}.`
			: 'Tidak ada nomor aktif untuk dipindahkan.';
	}
</script>

<svelte:head>
	<title>Operator | Queue System</title>
</svelte:head>

<main class="tv-display mx-auto min-h-screen max-w-7xl p-4 md:p-6">
	{#if !$isOperatorAuthenticated}
		<section class="panel mx-auto mt-14 w-full max-w-xl p-8">
			<p class="text-xs uppercase tracking-[0.2em] text-blue-600">Operator Login</p>
			<h1 class="mt-2 text-3xl font-bold text-slate-900">Masuk Panel Operator</h1>
			<p class="mt-2 text-slate-600">Gunakan sesi JWT mock untuk mengakses kontrol panggilan antrian.</p>

			<form class="mt-6 space-y-4" on:submit|preventDefault={submitLogin}>
				<div>
					<label class="mb-1 block text-sm text-slate-600" for="operator-username">Username</label>
					<input
						id="operator-username"
						class="field"
						bind:value={username}
						autocomplete="username"
					/>
				</div>
				<div>
					<label class="mb-1 block text-sm text-slate-600" for="operator-password">Password</label>
					<input
						id="operator-password"
						type="password"
						class="field"
						bind:value={password}
						autocomplete="current-password"
					/>
				</div>
				{#if authError}
					<p class="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700">
						{authError}
					</p>
				{/if}
				<button class="w-full rounded-lg bg-[#1E63D5] px-4 py-3 font-semibold text-white transition hover:bg-[#174EA6]">
					Login Operator
				</button>
			</form>

			<p class="mt-4 text-sm text-slate-500">Demo: <code>operator / queue123</code></p>
		</section>
	{:else}
		<header class="tv-header flex flex-wrap items-center justify-between gap-4 p-5">
			<div>
				<p class="text-xs uppercase tracking-[0.2em] text-blue-100">Operator Dashboard</p>
				<h1 class="text-2xl font-semibold text-white md:text-3xl">Kontrol Antrian Real-time</h1>
			</div>
			<div class="flex flex-wrap items-center gap-3">
				<span class="rounded-full border border-white/35 bg-white/20 px-3 py-1 text-xs uppercase tracking-wide text-white">
					Connection: {$connectionState}
				</span>
				<button
					class="rounded-lg border border-white/35 px-4 py-2 text-sm text-white transition hover:bg-white/15"
					on:click={logout}
				>
					Logout
				</button>
			</div>
		</header>

		<div class="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
			<section class="panel p-5">
				<div class="flex flex-wrap items-center justify-between gap-3">
					<div>
						<p class="text-xs uppercase tracking-[0.2em] text-slate-500">Loket Aktif</p>
						<select
							class="field mt-2"
							bind:value={selectedCounterId}
						>
							{#each $counters as counter (counter.id)}
								<option value={counter.id}>{counter.name} ({counter.status})</option>
							{/each}
						</select>
					</div>
					<div class="text-right">
						<p class="text-sm text-slate-500">Layanan</p>
						<p class="text-lg font-semibold text-slate-900">{selectedCounter?.serviceId ?? '-'}</p>
					</div>
				</div>

				<div class="tv-soft mt-6 p-4">
					<p class="text-sm text-slate-500">Nomor saat ini</p>
					<p class="mt-2 text-4xl font-black text-[#F4B400]">
						{selectedTicket?.queue ?? '-'}
					</p>
					<p class="text-sm text-slate-600">{selectedTicket?.serviceName ?? 'Belum ada antrian aktif'}</p>
				</div>

				<div class="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
					<button class="rounded-lg bg-[#F4B400] px-4 py-3 font-semibold text-slate-900" on:click={handleCallNext}>
						Panggil Antrian
					</button>
					<button class="rounded-lg bg-[#4A8CF0] px-4 py-3 font-semibold text-white" on:click={handleRecall}>
						Panggil Ulang
					</button>
					<button class="rounded-lg bg-[#16A34A] px-4 py-3 font-semibold text-white" on:click={handleStartServing}>
						Sedang Dilayani
					</button>
					<button class="rounded-lg bg-[#DC2626] px-4 py-3 font-semibold text-white" on:click={handleSkip}>
						Skip
					</button>
					<button class="rounded-lg bg-slate-700 px-4 py-3 font-semibold text-white" on:click={handleComplete}>
						Selesai
					</button>
					<div class="flex gap-2">
						<select
							class="field min-w-0 flex-1 px-2 py-3 text-sm"
							bind:value={transferTargetId}
						>
							{#if availableTargets.length === 0}
								<option value={null}>Tidak ada target</option>
							{:else}
								{#each availableTargets as target (target.id)}
									<option value={target.id}>{target.name}</option>
								{/each}
						{/if}
						</select>
						<button
							class="rounded-lg bg-[#1E63D5] px-3 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
							on:click={handleTransfer}
							disabled={availableTargets.length === 0}
						>
							Pindah
						</button>
					</div>
				</div>

				{#if actionMessage}
					<p class="mt-4 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-700">
						{actionMessage}
					</p>
				{/if}
			</section>

			<aside class="panel p-5">
				<h2 class="text-lg font-semibold text-slate-900">Antrian Menunggu</h2>
				<div class="mt-3 space-y-2">
					{#if $waitingTickets.length === 0}
						<p class="text-sm text-slate-500">Tidak ada antrean menunggu.</p>
					{:else}
						{#each $waitingTickets.slice(0, 12) as ticket (ticket.queue)}
							<div class="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
								<p class="text-lg font-semibold text-slate-800">{ticket.queue}</p>
								<p class="text-xs text-slate-500">{ticket.serviceName}</p>
							</div>
						{/each}
					{/if}
				</div>
			</aside>
		</div>
	{/if}
</main>
