<script lang="ts">
	import { onMount } from 'svelte';
	import '../app.css';
	import { startSocket, stopSocket } from '$lib/stores/socketStore';

	onMount(() => {
		startSocket();
		return () => {
			stopSocket();
		};
	});
</script>

<slot />

