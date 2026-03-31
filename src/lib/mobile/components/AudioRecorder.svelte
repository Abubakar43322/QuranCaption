<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { mobileState } from '../state.svelte';
	import { MobileProjectService } from '../services/MobileProjectService';
	import { MobileAudioStore } from '../services/MobileAudioStore';
	import { MAX_DURATION_MS } from '../types';

	const MAX_SECONDS = MAX_DURATION_MS / 1000; // 180

	type RecordState = 'idle' | 'recording' | 'done' | 'importing';

	let recordState: RecordState = $state('idle');
	let elapsedMs = $state(0);
	let audioBlobUrl: string | null = $state(null);
	let audioBlob: Blob | null = $state(null);
	let errorMsg: string | null = $state(null);

	let mediaRecorder: MediaRecorder | null = null;
	let chunks: Blob[] = [];
	let timerInterval: number | null = null;
	let startTime = 0;

	onDestroy(() => stopCleanup());

	function stopCleanup() {
		if (timerInterval) clearInterval(timerInterval);
		if (mediaRecorder?.state === 'recording') mediaRecorder.stop();
	}

	async function startRecording() {
		try {
			errorMsg = null;
			chunks = [];
			const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
			mediaRecorder = new MediaRecorder(stream);
			mediaRecorder.ondataavailable = (e) => chunks.push(e.data);
			mediaRecorder.onstop = () => {
				stream.getTracks().forEach((t) => t.stop());
				const blob = new Blob(chunks, { type: 'audio/webm' });
				audioBlob = blob;
				if (audioBlobUrl) URL.revokeObjectURL(audioBlobUrl);
				audioBlobUrl = URL.createObjectURL(blob);
				recordState = 'done';
			};
			mediaRecorder.start(250);
			startTime = Date.now();
			recordState = 'recording';
			timerInterval = window.setInterval(() => {
				elapsedMs = Date.now() - startTime;
				if (elapsedMs >= MAX_DURATION_MS) stopRecording();
			}, 100);
		} catch (e) {
			errorMsg = 'Microphone access denied. Please allow microphone permission.';
		}
	}

	function stopRecording() {
		if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
		mediaRecorder?.stop();
	}

	async function importFile() {
		recordState = 'importing';
		const input = document.createElement('input');
		input.type = 'file';
		input.accept = 'audio/*,video/*';
		input.onchange = async () => {
			const file = input.files?.[0];
			if (!file) { recordState = 'idle'; return; }
			audioBlob = file;
			if (audioBlobUrl) URL.revokeObjectURL(audioBlobUrl);
			audioBlobUrl = URL.createObjectURL(file);
			recordState = 'done';
		};
		input.click();
	}

	async function proceed() {
		if (!audioBlob || !mobileState.currentProject) return;
		const project = mobileState.currentProject;

		// Get duration via Audio API
		const url = URL.createObjectURL(audioBlob);
		const audioEl = new Audio(url);
		await new Promise<void>((res) => { audioEl.onloadedmetadata = () => res(); });
		const durationMs = Math.min(Math.round(audioEl.duration * 1000), MAX_DURATION_MS);
		URL.revokeObjectURL(url);

		// Store audio blob with project id as key
		await MobileAudioStore.save(project.id, audioBlob);

		const updated = { ...project, durationMs, audioKey: project.id };
		await MobileProjectService.save(updated);
		mobileState.setProject(updated);
		mobileState.audioBlobUrl = audioBlobUrl;
		audioBlobUrl = null; // transferred ownership
		mobileState.navigate('detect');
	}

	function formatTime(ms: number): string {
		const s = Math.floor(ms / 1000);
		const m = Math.floor(s / 60);
		return `${m}:${(s % 60).toString().padStart(2, '0')}`;
	}

	const remaining = $derived(MAX_SECONDS - Math.floor(elapsedMs / 1000));
	const progressPct = $derived(Math.min((elapsedMs / MAX_DURATION_MS) * 100, 100));
</script>

<div class="flex flex-col h-full">
	<!-- Header -->
	<div class="flex items-center gap-3 px-4 pt-safe pb-3 bg-neutral-900 border-b border-neutral-800">
		<button onclick={() => mobileState.navigate('create')} class="text-neutral-400 p-1">
			<span class="material-icons">arrow_back</span>
		</button>
		<div>
			<h1 class="text-base font-bold">Record Recitation</h1>
			<p class="text-xs text-neutral-400">Max 3 minutes</p>
		</div>
	</div>

	<div class="flex-1 flex flex-col items-center justify-center px-6 gap-8">
		<!-- Timer ring -->
		<div class="relative flex items-center justify-center">
			<svg class="w-48 h-48 -rotate-90" viewBox="0 0 120 120">
				<circle cx="60" cy="60" r="54" fill="none" stroke="#262626" stroke-width="8" />
				<circle
					cx="60" cy="60" r="54" fill="none"
					stroke={recordState === 'recording' ? '#10b981' : '#404040'}
					stroke-width="8"
					stroke-linecap="round"
					stroke-dasharray={`${2 * Math.PI * 54}`}
					stroke-dashoffset={`${2 * Math.PI * 54 * (1 - progressPct / 100)}`}
					class="transition-all duration-100"
				/>
			</svg>
			<div class="absolute flex flex-col items-center">
				<span class="text-3xl font-mono font-bold text-white">
					{recordState === 'recording' ? formatTime(elapsedMs) : formatTime(0)}
				</span>
				{#if recordState === 'recording'}
					<span class="text-xs text-neutral-400 mt-1">{remaining}s left</span>
				{:else if recordState === 'done'}
					<span class="text-xs text-emerald-400 mt-1">Recorded</span>
				{:else}
					<span class="text-xs text-neutral-500 mt-1">3:00 max</span>
				{/if}
			</div>
		</div>

		{#if errorMsg}
			<p class="text-red-400 text-sm text-center">{errorMsg}</p>
		{/if}

		<!-- Audio preview -->
		{#if audioBlobUrl && recordState === 'done'}
			<audio src={audioBlobUrl} controls class="w-full rounded-lg"></audio>
		{/if}

		<!-- Controls -->
		<div class="flex items-center gap-6">
			{#if recordState === 'idle'}
				<button
					onclick={startRecording}
					class="w-20 h-20 rounded-full bg-red-600 hover:bg-red-500 flex items-center justify-center active:scale-95 transition-transform shadow-lg shadow-red-900/40"
				>
					<span class="material-icons text-3xl text-white">mic</span>
				</button>
			{:else if recordState === 'recording'}
				<button
					onclick={stopRecording}
					class="w-20 h-20 rounded-full bg-neutral-700 hover:bg-neutral-600 flex items-center justify-center active:scale-95 transition-transform"
				>
					<span class="material-icons text-3xl text-white">stop</span>
				</button>
			{:else if recordState === 'done'}
				<button
					onclick={() => { recordState = 'idle'; elapsedMs = 0; audioBlob = null; if (audioBlobUrl) { URL.revokeObjectURL(audioBlobUrl); audioBlobUrl = null; } }}
					class="flex flex-col items-center gap-1 text-neutral-400"
				>
					<span class="material-icons text-2xl">refresh</span>
					<span class="text-xs">Re-record</span>
				</button>
			{/if}

			{#if recordState === 'idle' || recordState === 'done'}
				<button
					onclick={importFile}
					class="flex flex-col items-center gap-1 text-neutral-400 hover:text-white"
				>
					<span class="material-icons text-2xl">upload_file</span>
					<span class="text-xs">Import</span>
				</button>
			{/if}
		</div>
	</div>

	<!-- CTA -->
	<div class="px-4 pb-safe pt-3 border-t border-neutral-800 bg-neutral-900">
		<button
			onclick={proceed}
			disabled={!audioBlob}
			class="w-full bg-emerald-600 disabled:bg-neutral-700 disabled:text-neutral-500 text-white font-semibold py-4 rounded-2xl text-sm active:scale-[0.98] transition-transform"
		>
			Next: Detect Verses
		</button>
	</div>
</div>
