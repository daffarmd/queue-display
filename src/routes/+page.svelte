<svelte:head>
	<title>Queue Display System</title>
</svelte:head>

<main class="tv-display mx-auto flex min-h-screen max-w-6xl flex-col gap-6 p-6 md:p-10">
	<section class="panel p-8">
		<p class="text-xs uppercase tracking-[0.22em] text-blue-600">Svelte 5 + Tailwind 4</p>
		<h1 class="mt-2 text-3xl font-bold text-slate-900 md:text-5xl">Digital Queue Display System</h1>
		<p class="mt-3 max-w-2xl text-base text-slate-600 md:text-lg">
			Aplikasi antrian real-time untuk display TV, operator loket, admin pengaturan, dan halaman ambil
			nomor via QR.
		</p>
	</section>

	<section class="grid gap-4 md:grid-cols-2">
		<a class="panel block p-6 transition hover:-translate-y-0.5 hover:border-blue-300" href="/display">
			<h2 class="text-xl font-semibold text-slate-900">Display TV</h2>
			<p class="mt-2 text-slate-600">Tampilan nomor antrian aktif, QR, pengumuman, dan status loket.</p>
		</a>
		<a class="panel block p-6 transition hover:-translate-y-0.5 hover:border-blue-300" href="/operator">
			<h2 class="text-xl font-semibold text-slate-900">Operator Panel</h2>
			<p class="mt-2 text-slate-600">Aksi panggil, panggil ulang, skip, selesai, dan transfer antrian.</p>
		</a>
		<a class="panel block p-6 transition hover:-translate-y-0.5 hover:border-blue-300" href="/admin">
			<h2 class="text-xl font-semibold text-slate-900">Admin Panel</h2>
			<p class="mt-2 text-slate-600">Kelola loket, layanan, layout display, pengumuman, dan statistik.</p>
		</a>
		<a
			class="panel block p-6 transition hover:-translate-y-0.5 hover:border-blue-300"
			href="/queue/take"
		>
			<h2 class="text-xl font-semibold text-slate-900">Queue Take</h2>
			<p class="mt-2 text-slate-600">Simulasi halaman pengunjung untuk ambil nomor antrian.</p>
		</a>
	</section>

	<section class="panel p-6">
		<h3 class="text-lg font-semibold text-slate-900">Demo Credentials</h3>
		<p class="mt-2 text-slate-600">Operator: <code>operator / queue123</code></p>
		<p class="text-slate-600">Admin: <code>admin / admin123</code></p>
	</section>
</main>
