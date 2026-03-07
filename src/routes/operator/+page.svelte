<script lang="ts">
	import { page } from '$app/stores';
	import { activeByCounter, waitingTickets } from '$lib/stores/queueStore';
	import { counters } from '$lib/stores/counterStore';
	import {
		authSession,
		isOperatorAuthenticated,
		loginOperator,
		logout,
		operatorLoginHints
	} from '$lib/stores/authStore';
	import {
		connectionState,
		operatorCallNext,
		operatorComplete,
		operatorRecall,
		operatorSkip,
		operatorStartServing,
		operatorTransfer
	} from '$lib/stores/socketStore';

	let username = 'op-loket-1';
	let password = 'queue123';
	let pin = '1001';
	let authError = '';
	let actionMessage = '';
	let selectedCounterId = 1;
	let transferTargetId: number | null = null;

	$: routeLoketQuery = $page.url.searchParams.get('loket');
	$: routeLockedCounterId =
		routeLoketQuery && /^[0-9]+$/.test(routeLoketQuery) ? Number(routeLoketQuery) : null;

	$: currentSession = $authSession;
	$: isOperatorSession = currentSession?.role === 'operator';
	$: assignedCounterId = isOperatorSession ? (currentSession?.assignedCounterId ?? null) : null;

	$: if (
		currentSession?.role === 'admin' &&
		$counters.length > 0 &&
		!$counters.some((counter) => counter.id === selectedCounterId)
	) {
		selectedCounterId = $counters[0].id;
	}

	$: effectiveCounterId =
		currentSession?.role === 'operator'
			? assignedCounterId
			: currentSession?.role === 'admin'
				? selectedCounterId
				: null;

	$: selectedCounter =
		effectiveCounterId === null
			? null
			: $counters.find((counter) => counter.id === effectiveCounterId) ?? null;

	$: selectedTicket = selectedCounter ? $activeByCounter[String(selectedCounter.id)] : null;
	$: waitingForSelectedService = selectedCounter
		? $waitingTickets.filter((ticket) => ticket.serviceId === selectedCounter.serviceId)
		: [];
	$: waitingForOtherServices = selectedCounter
		? $waitingTickets.filter((ticket) => ticket.serviceId !== selectedCounter.serviceId)
		: $waitingTickets;
	$: waitingOtherServiceCount = selectedCounter
		? Math.max(0, $waitingTickets.length - waitingForSelectedService.length)
		: $waitingTickets.length;
	$: waitingVisibleTickets =
		waitingForSelectedService.length > 0 ? waitingForSelectedService : waitingForOtherServices;
	$: showingOtherServiceFallback =
		!!selectedCounter && waitingForSelectedService.length === 0 && waitingForOtherServices.length > 0;
	$: availableTargets = selectedCounter
		? $counters.filter((counter) => counter.id !== selectedCounter.id && counter.status !== 'offline')
		: [];

	$: if (availableTargets.length > 0 && !availableTargets.some((counter) => counter.id === transferTargetId)) {
		transferTargetId = availableTargets[0].id;
	}

	$: routeMismatch =
		currentSession?.role === 'operator' &&
		routeLockedCounterId !== null &&
		assignedCounterId !== routeLockedCounterId;

	$: controlsBlocked = routeMismatch || !selectedCounter;

	function submitLogin() {
		const result = loginOperator(username, password, pin, routeLockedCounterId ?? undefined);
		if (!result.ok) {
			authError = result.message;
			return;
		}
		authError = '';
	}

	function ensureCounterAccess(): boolean {
		if (routeMismatch) {
			actionMessage = 'Akses ditolak: akun operator ini tidak sesuai dengan loket pada URL.';
			return false;
		}
		if (!selectedCounter) {
			actionMessage = 'Loket tidak tersedia.';
			return false;
		}
		if (selectedCounter.status === 'offline') {
			actionMessage = 'Loket sedang offline.';
			return false;
		}
		return true;
	}

	function handleCallNext() {
		if (!ensureCounterAccess() || !selectedCounter) return;

		const ticket = operatorCallNext(selectedCounter.id, selectedCounter.serviceId);
		if (ticket) {
			actionMessage = `${ticket.queue} dipanggil ke ${selectedCounter.name}.`;
			return;
		}

		actionMessage =
			waitingOtherServiceCount > 0
				? `Tidak ada antrean untuk layanan ${selectedCounter.serviceId}. Saat ini ada ${waitingOtherServiceCount} antrean di layanan lain.`
				: 'Tidak ada antrean menunggu untuk layanan loket ini.';
	}

	function handleRecall() {
		if (!ensureCounterAccess() || !selectedCounter) return;
		const ticket = operatorRecall(selectedCounter.id);
		if (ticket) {
			actionMessage = `Panggil ulang ${ticket.queue}.`;
			return;
		}
		actionMessage = 'Belum ada nomor aktif di loket.';
	}

	function handleStartServing() {
		if (!ensureCounterAccess() || !selectedCounter) return;
		const ticket = operatorStartServing(selectedCounter.id);
		actionMessage = ticket ? `${ticket.queue} masuk status sedang dilayani.` : 'Belum ada nomor aktif.';
	}

	function handleSkip() {
		if (!ensureCounterAccess() || !selectedCounter) return;
		const ticket = operatorSkip(selectedCounter.id);
		actionMessage = ticket ? `${ticket.queue} di-skip.` : 'Belum ada nomor aktif.';
	}

	function handleComplete() {
		if (!ensureCounterAccess() || !selectedCounter) return;
		const ticket = operatorComplete(selectedCounter.id);
		actionMessage = ticket ? `${ticket.queue} selesai dilayani.` : 'Belum ada nomor aktif.';
	}

	function handleTransfer() {
		if (!ensureCounterAccess() || !selectedCounter) return;
		const targetId = transferTargetId === null ? null : Number(transferTargetId);
		if (targetId === null) {
			actionMessage = 'Tidak ada loket tujuan transfer.';
			return;
		}

		const ticket = operatorTransfer(selectedCounter.id, targetId);
		actionMessage = ticket
			? `${ticket.queue} dipindahkan ke Loket ${targetId}.`
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
			<p class="mt-2 text-slate-600">
				Akun operator sekarang per-loket dan wajib PIN agar akses lebih aman.
			</p>
			{#if routeLockedCounterId !== null}
				<p class="mt-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-700">
					Mode loket terkunci dari URL: Loket {routeLockedCounterId}
				</p>
			{/if}

			<form class="mt-6 space-y-4" on:submit|preventDefault={submitLogin}>
				<div>
					<label class="mb-1 block text-sm text-slate-600" for="operator-username">Username</label>
					<input id="operator-username" class="field" bind:value={username} autocomplete="username" />
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
				<div>
					<label class="mb-1 block text-sm text-slate-600" for="operator-pin">PIN Loket</label>
					<input
						id="operator-pin"
						type="password"
						class="field"
						bind:value={pin}
						inputmode="numeric"
						autocomplete="one-time-code"
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

			<div class="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
				<p class="font-semibold text-slate-800">Demo akun operator:</p>
				<ul class="mt-2 space-y-1">
					{#each operatorLoginHints as account (account.username)}
						<li>
							Loket {account.counterId}: <code>{account.username} / queue123 / PIN {account.pin}</code>
						</li>
					{/each}
				</ul>
			</div>
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

		{#if routeMismatch}
			<p class="mt-4 rounded-lg border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-700">
				Akses URL loket tidak cocok dengan akun login. Gunakan akun loket yang benar atau akses
				<code>/operator</code>.
			</p>
		{/if}

		<div class="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
			<section class="panel p-5">
				<div class="flex flex-wrap items-center justify-between gap-3">
					<div>
						<p class="text-xs uppercase tracking-[0.2em] text-slate-500">Loket Aktif</p>
						{#if currentSession?.role === 'admin'}
							<select class="field mt-2" bind:value={selectedCounterId}>
								{#each $counters as counter (counter.id)}
									<option value={counter.id}>{counter.name} ({counter.status})</option>
								{/each}
							</select>
						{:else}
							<div class="field mt-2 bg-slate-100">
								{selectedCounter ? selectedCounter.name : 'Loket tidak tersedia'} (Terkunci)
							</div>
						{/if}
					</div>
					<div class="text-right">
						<p class="text-sm text-slate-500">Layanan</p>
						<p class="text-lg font-semibold text-slate-900">{selectedCounter?.serviceId ?? '-'}</p>
					</div>
				</div>

				<div class="tv-soft mt-6 p-4">
					<p class="text-sm text-slate-500">Nomor saat ini</p>
					<p class="mt-2 text-4xl font-black text-[#F4B400]">{selectedTicket?.queue ?? '-'}</p>
					<p class="text-sm text-slate-600">{selectedTicket?.serviceName ?? 'Belum ada antrian aktif'}</p>
				</div>

				<div class="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
					<button
						class="rounded-lg bg-[#F4B400] px-4 py-3 font-semibold text-slate-900 disabled:cursor-not-allowed disabled:bg-slate-300"
						on:click={handleCallNext}
						disabled={controlsBlocked}
					>
						Panggil Antrian
					</button>
					<button
						class="rounded-lg bg-[#4A8CF0] px-4 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
						on:click={handleRecall}
						disabled={controlsBlocked}
					>
						Panggil Ulang
					</button>
					<button
						class="rounded-lg bg-[#16A34A] px-4 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
						on:click={handleStartServing}
						disabled={controlsBlocked}
					>
						Sedang Dilayani
					</button>
					<button
						class="rounded-lg bg-[#DC2626] px-4 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
						on:click={handleSkip}
						disabled={controlsBlocked}
					>
						Skip
					</button>
					<button
						class="rounded-lg bg-slate-700 px-4 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
						on:click={handleComplete}
						disabled={controlsBlocked}
					>
						Selesai
					</button>
					<div class="flex gap-2">
						<select
							class="field min-w-0 flex-1 px-2 py-3 text-sm"
							bind:value={transferTargetId}
							disabled={controlsBlocked}
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
							disabled={controlsBlocked || availableTargets.length === 0}
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
				<p class="mt-1 text-xs text-slate-500">
					Service aktif: {selectedCounter?.serviceId ?? '-'}
				</p>
				{#if showingOtherServiceFallback}
					<p class="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
						Tidak ada antrean untuk layanan loket ini. Menampilkan antrean layanan lain.
					</p>
				{/if}
				<div class="mt-3 space-y-2">
					{#if waitingVisibleTickets.length === 0}
						<p class="text-sm text-slate-500">
							Tidak ada antrean untuk layanan loket ini.
							{#if waitingOtherServiceCount > 0}
								({waitingOtherServiceCount} antrean ada di layanan lain)
							{/if}
						</p>
					{:else}
						{#each waitingVisibleTickets.slice(0, 12) as ticket (ticket.queue)}
							<div class="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
								<div class="flex items-center justify-between gap-2">
									<p class="text-lg font-semibold text-slate-800">{ticket.queue}</p>
									{#if showingOtherServiceFallback}
										<span class="rounded-full border border-slate-300 px-2 py-0.5 text-[10px] uppercase tracking-wide text-slate-600">
											{ticket.serviceName}
										</span>
									{/if}
								</div>
								<p class="text-xs text-slate-500">{ticket.serviceName}</p>
							</div>
						{/each}
					{/if}
				</div>
			</aside>
		</div>
	{/if}
</main>
