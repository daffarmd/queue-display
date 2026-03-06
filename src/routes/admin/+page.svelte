<script lang="ts">
	import { get } from 'svelte/store';
	import { isAdminAuthenticated, loginAdmin, logout } from '$lib/stores/authStore';
	import {
		addAnnouncement,
		addService,
		announcements,
		displayLayout,
		removeAnnouncement,
		removeService,
		services,
		setLayout
	} from '$lib/stores/configStore';
	import {
		addCounter,
		counters,
		toggleCounterOffline,
		updateCounterService
	} from '$lib/stores/counterStore';
	import { queueMetrics } from '$lib/stores/queueStore';
	import { broadcastAnnouncements } from '$lib/stores/socketStore';

	let username = 'admin';
	let password = 'admin123';
	let authError = '';
	let panelMessage = '';

	let serviceName = '';
	let servicePrefix = '';

	let announcementTitle = '';
	let announcementMessage = '';

	let counterName = '';
	let counterServiceId = 'customer-service';

	$: if ($services.length > 0 && !$services.some((service) => service.id === counterServiceId)) {
		counterServiceId = $services[0].id;
	}

	function submitLogin() {
		const result = loginAdmin(username, password);
		if (!result.ok) {
			authError = result.message;
			return;
		}
		authError = '';
	}

	function handleAddService() {
		const created = addService(serviceName, servicePrefix);
		if (!created) {
			panelMessage = 'Gagal menambah service. Pastikan nama/prefix valid dan unik.';
			return;
		}

		panelMessage = `Service ${created.name} ditambahkan.`;
		serviceName = '';
		servicePrefix = '';
	}

	function handleAddCounter() {
		const createdId = addCounter(counterName, counterServiceId);
		if (!createdId) {
			panelMessage = 'Nama loket tidak boleh kosong.';
			return;
		}

		panelMessage = `Loket baru ditambahkan (ID: ${createdId}).`;
		counterName = '';
	}

	function handleAddAnnouncement() {
		const created = addAnnouncement(announcementTitle, announcementMessage);
		if (!created) {
			panelMessage = 'Judul dan isi pengumuman wajib diisi.';
			return;
		}

		broadcastAnnouncements(get(announcements));
		panelMessage = 'Pengumuman baru telah dipublikasikan.';
		announcementTitle = '';
		announcementMessage = '';
	}

	function handleRemoveAnnouncement(id: string) {
		removeAnnouncement(id);
		broadcastAnnouncements(get(announcements));
		panelMessage = 'Pengumuman dihapus.';
	}

	function handleLayoutChange(event: Event) {
		const value = (event.currentTarget as HTMLSelectElement).value as 'default' | 'compact';
		setLayout(value);
		panelMessage = `Layout display diubah ke mode ${value}.`;
	}

	function handleServiceChange(counterId: number, event: Event) {
		const value = (event.currentTarget as HTMLSelectElement).value;
		updateCounterService(counterId, value);
		panelMessage = `Service untuk Loket ${counterId} diperbarui.`;
	}
</script>

<svelte:head>
	<title>Admin | Queue System</title>
</svelte:head>

<main class="tv-display mx-auto min-h-screen max-w-7xl p-4 md:p-6">
	{#if !$isAdminAuthenticated}
		<section class="panel mx-auto mt-14 w-full max-w-xl p-8">
			<p class="text-xs uppercase tracking-[0.2em] text-blue-600">Admin Login</p>
			<h1 class="mt-2 text-3xl font-bold text-slate-900">Masuk Panel Admin</h1>
			<p class="mt-2 text-slate-600">Akses pengelolaan loket, layanan, layout, dan statistik antrian.</p>

			<form class="mt-6 space-y-4" on:submit|preventDefault={submitLogin}>
				<div>
					<label class="mb-1 block text-sm text-slate-600" for="admin-username">Username</label>
					<input
						id="admin-username"
						class="field"
						bind:value={username}
						autocomplete="username"
					/>
				</div>
				<div>
					<label class="mb-1 block text-sm text-slate-600" for="admin-password">Password</label>
					<input
						id="admin-password"
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
					Login Admin
				</button>
			</form>

			<p class="mt-4 text-sm text-slate-500">Demo: <code>admin / admin123</code></p>
		</section>
	{:else}
		<header class="tv-header flex flex-wrap items-center justify-between gap-4 p-5">
			<div>
				<p class="text-xs uppercase tracking-[0.2em] text-blue-100">Admin Dashboard</p>
				<h1 class="text-2xl font-semibold text-white md:text-3xl">Queue Configuration & Analytics</h1>
			</div>
			<button
				class="rounded-lg border border-white/35 px-4 py-2 text-sm text-white transition hover:bg-white/15"
				on:click={logout}
			>
				Logout
			</button>
		</header>

		<section class="mt-6 grid gap-4 md:grid-cols-4">
			<div class="panel p-4">
				<p class="text-sm text-slate-500">Waiting</p>
				<p class="mt-1 text-3xl font-black text-[#F4B400]">{$queueMetrics.waiting}</p>
			</div>
			<div class="panel p-4">
				<p class="text-sm text-slate-500">Active</p>
				<p class="mt-1 text-3xl font-black text-[#1E63D5]">{$queueMetrics.active}</p>
			</div>
			<div class="panel p-4">
				<p class="text-sm text-slate-500">Completed</p>
				<p class="mt-1 text-3xl font-black text-[#16A34A]">{$queueMetrics.completed}</p>
			</div>
			<div class="panel p-4">
				<p class="text-sm text-slate-500">Skipped</p>
				<p class="mt-1 text-3xl font-black text-[#DC2626]">{$queueMetrics.skipped}</p>
			</div>
		</section>

		{#if panelMessage}
			<p class="mt-4 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-700">
				{panelMessage}
			</p>
		{/if}

		<div class="mt-6 grid gap-6 xl:grid-cols-2">
			<section class="panel p-5">
				<h2 class="text-xl font-semibold text-slate-900">Service Management</h2>
				<form class="mt-4 grid gap-3 md:grid-cols-[1fr_7rem_auto]" on:submit|preventDefault={handleAddService}>
					<input
						class="field"
						placeholder="Nama layanan"
						bind:value={serviceName}
					/>
					<input
						class="field uppercase"
						placeholder="Prefix"
						maxlength="4"
						bind:value={servicePrefix}
					/>
					<button class="rounded-lg bg-[#1E63D5] px-4 py-2 font-semibold text-white">Tambah</button>
				</form>

				<div class="mt-4 space-y-2">
					{#each $services as service (service.id)}
						<div class="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
							<div>
								<p class="font-semibold text-slate-800">{service.name}</p>
								<p class="text-xs text-slate-500">Prefix: {service.prefix}</p>
							</div>
							<button
								class="rounded-md border border-rose-300 px-3 py-1 text-xs text-rose-700 transition hover:bg-rose-50"
								on:click={() => removeService(service.id)}
							>
								Hapus
							</button>
						</div>
					{/each}
				</div>
			</section>

			<section class="panel p-5">
				<h2 class="text-xl font-semibold text-slate-900">Display Settings</h2>
				<div class="mt-4">
					<label class="mb-1 block text-sm text-slate-500" for="layout-select">Layout Display</label>
					<select
						id="layout-select"
						class="field"
						value={$displayLayout}
						on:change={handleLayoutChange}
					>
						<option value="default">Default</option>
						<option value="compact">Compact</option>
					</select>
				</div>

				<h3 class="mt-6 text-lg font-semibold text-slate-800">Announcement Panel</h3>
				<form class="mt-3 space-y-3" on:submit|preventDefault={handleAddAnnouncement}>
					<input
						class="field"
						placeholder="Judul pengumuman"
						bind:value={announcementTitle}
					/>
					<textarea
						class="field min-h-24"
						placeholder="Isi pengumuman"
						bind:value={announcementMessage}
					></textarea>
					<button class="rounded-lg bg-[#1E63D5] px-4 py-2 font-semibold text-white">
						Publikasikan
					</button>
				</form>

				<div class="mt-4 space-y-2">
					{#each $announcements as item (item.id)}
						<div class="rounded-lg border border-slate-200 bg-slate-50 p-3">
							<div class="flex items-start justify-between gap-3">
								<div>
									<p class="font-semibold text-slate-800">{item.title}</p>
									<p class="text-sm text-slate-600">{item.message}</p>
								</div>
								<button
									class="rounded-md border border-rose-300 px-2 py-1 text-xs text-rose-700"
									on:click={() => handleRemoveAnnouncement(item.id)}
								>
									Hapus
								</button>
							</div>
						</div>
					{/each}
				</div>
			</section>
		</div>

		<section class="panel mt-6 p-5">
			<h2 class="text-xl font-semibold text-slate-900">Counter Management</h2>
			<form class="mt-4 grid gap-3 md:grid-cols-[1fr_14rem_auto]" on:submit|preventDefault={handleAddCounter}>
				<input
					class="field"
					placeholder="Nama loket baru"
					bind:value={counterName}
				/>
				<select class="field" bind:value={counterServiceId}>
					{#each $services as service (service.id)}
						<option value={service.id}>{service.name}</option>
					{/each}
				</select>
				<button class="rounded-lg bg-[#1E63D5] px-4 py-2 font-semibold text-white">Tambah Loket</button>
			</form>

			<div class="mt-4 space-y-2">
				{#each $counters as counter (counter.id)}
					<div class="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 md:grid-cols-[1fr_14rem_auto_auto] md:items-center">
						<div>
							<p class="font-semibold text-slate-800">{counter.name}</p>
							<p class="text-xs text-slate-500">Status: {counter.status}</p>
						</div>
						<select
							class="field"
							value={counter.serviceId}
							on:change={(event) => handleServiceChange(counter.id, event)}
						>
							{#each $services as service (service.id)}
								<option value={service.id}>{service.name}</option>
							{/each}
						</select>
						<span class="rounded-full border border-slate-300 px-3 py-1 text-xs uppercase tracking-wide text-slate-600">
							{counter.currentQueue ?? 'No Queue'}
						</span>
						<button
							class="rounded-md border border-amber-300 px-3 py-2 text-sm text-amber-700 transition hover:bg-amber-50"
							on:click={() => toggleCounterOffline(counter.id)}
						>
							{counter.status === 'offline' ? 'Set Idle' : 'Set Offline'}
						</button>
					</div>
				{/each}
			</div>
		</section>
	{/if}
</main>
