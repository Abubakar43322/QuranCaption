<script lang="ts">
	import { onMount } from 'svelte';
	import { mobileState } from '../state.svelte';
	import { MobileProjectService } from '../services/MobileProjectService';
	import MobileHome from './MobileHome.svelte';
	import MobileProjectCreator from './MobileProjectCreator.svelte';
	import AudioRecorder from './AudioRecorder.svelte';
	import VerseDetector from './VerseDetector.svelte';
	import TapTimeline from './TapTimeline.svelte';
	import MobileStyleEditor from './MobileStyleEditor.svelte';
	import MobileExport from './MobileExport.svelte';

	onMount(async () => {
		const projects = await MobileProjectService.listAll();
		mobileState.projects = projects;
	});
</script>

<div
	class="mobile-app fixed inset-0 flex flex-col overflow-hidden bg-neutral-950 text-white"
	style="font-family: system-ui, sans-serif;"
>
	{#if mobileState.screen === 'home'}
		<MobileHome />
	{:else if mobileState.screen === 'create'}
		<MobileProjectCreator />
	{:else if mobileState.screen === 'record'}
		<AudioRecorder />
	{:else if mobileState.screen === 'detect'}
		<VerseDetector />
	{:else if mobileState.screen === 'timeline'}
		<TapTimeline />
	{:else if mobileState.screen === 'style'}
		<MobileStyleEditor />
	{:else if mobileState.screen === 'export'}
		<MobileExport />
	{/if}
</div>
