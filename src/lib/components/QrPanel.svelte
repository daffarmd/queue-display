<script lang="ts">
	import { onMount } from 'svelte';
	import QRCode from 'qrcode';

	export let targetPath = '/queue/take';

	let qrImage = '';
	let queueUrl = targetPath;
	let qrError = '';

	onMount(async () => {
		try {
			queueUrl = `${window.location.origin}${targetPath}`;
			qrImage = await QRCode.toDataURL(queueUrl, {
				width: 280,
				margin: 1,
				color: {
					dark: '#1F2937',
					light: '#FFFFFF'
				}
			});
		} catch (error) {
			qrError = `Gagal membuat QR: ${(error as Error).message}`;
		}
	});
</script>

<section class="tv-card flex flex-col items-center gap-4 p-6 text-center">
	<p class="text-sm uppercase tracking-[0.2em] text-slate-500">Ambil Nomor Antrian</p>
	{#if qrImage}
		<img
			class="h-52 w-52 rounded-xl border border-blue-200 bg-white p-3 shadow-sm"
			src={qrImage}
			alt="QR Ambil Nomor"
		/>
	{:else if qrError}
		<div class="rounded-lg border border-rose-300 bg-rose-50 p-4 text-sm text-rose-700">{qrError}</div>
	{:else}
		<div class="h-52 w-52 animate-pulse rounded-xl border border-slate-300 bg-slate-100"></div>
	{/if}

	<p class="text-sm text-slate-600 md:text-base">Scan QR untuk ambil nomor melalui ponsel.</p>
	<p class="max-w-[16rem] break-all text-xs text-slate-500">{queueUrl}</p>
</section>
