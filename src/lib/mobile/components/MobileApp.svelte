<script lang="ts">
	import { onMount } from 'svelte';
	import { mobileState } from '../state.svelte';
	import { MobileProjectService } from '../services/MobileProjectService';
	import MobileHome from './MobileHome.svelte';
	import MobileNew from './MobileNew.svelte';
	import MobileEdit from './MobileEdit.svelte';
	import MobileExport from './MobileExport.svelte';

	onMount(async () => {
		mobileState.projects = await MobileProjectService.listAll();
	});
</script>

<div class="fixed inset-0 flex flex-col overflow-hidden bg-neutral-950 text-white" style="font-family: system-ui, sans-serif;">
	{#if mobileState.screen === 'home'}
		<MobileHome />
	{:else if mobileState.screen === 'new'}
		<MobileNew />
	{:else if mobileState.screen === 'edit'}
		<MobileEdit />
	{:else if mobileState.screen === 'export'}
		<MobileExport />
	{/if}
</div>
