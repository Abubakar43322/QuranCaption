<script lang="ts">
	import { mobileState } from '../state.svelte';
	import { MobileProjectService } from '../services/MobileProjectService';
	import { exportProject } from '../services/MobileExportService';

	type ExportState = 'idle' | 'exporting' | 'done' | 'error';

	let exportState: ExportState = $state('idle');
	let progress = $state(0);
	let progressMessage = $state('');
	let errorMsg = $state('');
	let outputUrl: string | null = $state(null);
	let outputBlob: Blob | null = $state(null);

	const project = $derived(mobileState.currentProject!);

	async function startExport() {
		if (!project) return;
		exportState = 'exporting';
		progress = 0;
		errorMsg = '';
		try {
			const blob = await exportProject(project, (p, msg) => {
				progress = p;
				progressMessage = msg;
			});
			outputBlob = blob;
			if (outputUrl) URL.revokeObjectURL(outputUrl);
			outputUrl = URL.createObjectURL(blob);
			exportState = 'done';

			// Update project status
			const updated = { ...project, exportStatus: 'done' as const };
			await MobileProjectService.save(updated);
			mobileState.setProject(updated);
		} catch (e) {
			exportState = 'error';
			errorMsg = String(e);
		}
	}

	function downloadVideo() {
		if (!outputUrl || !outputBlob) return;
		const a = document.createElement('a');
		a.href = outputUrl;
		a.download = `${project.name.replace(/[^a-z0-9]/gi, '_')}_quran.mp4`;
		a.click();
	}

	/** Share via Web Share API (available in Capacitor WebView on Android/iOS) */
	async function shareVideo() {
		if (!outputBlob) return;
		const file = new File([outputBlob], `${project.name}_quran.mp4`, { type: 'video/mp4' });
		if (navigator.canShare?.({ files: [file] })) {
			await navigator.share({ files: [file], title: project.name });
		} else {
			downloadVideo();
		}
	}

	function formatDuration(ms: number): string {
		const s = Math.floor(ms / 1000);
		const m = Math.floor(s / 60);
		return `${m}:${(s % 60).toString().padStart(2, '0')}`;
	}
</script>

<div class="flex flex-col h-full">
	<!-- Header -->
	<div class="flex items-center gap-3 px-4 pt-safe pb-3 bg-neutral-900 border-b border-neutral-800">
		<button onclick={() => mobileState.navigate('style')} class="text-neutral-400 p-1">
			<span class="material-icons">arrow_back</span>
		</button>
		<h1 class="text-base font-bold">Export</h1>
	</div>

	<div class="flex-1 flex flex-col items-center justify-center px-6 gap-6">
		{#if exportState === 'idle'}
			<!-- Summary -->
			<div class="w-full bg-neutral-800 rounded-2xl p-4 space-y-2">
				<h2 class="text-sm font-bold text-white">{project.name}</h2>
				<div class="grid grid-cols-2 gap-2 text-xs text-neutral-400">
					<div>Duration: <span class="text-white">{formatDuration(project.durationMs)}</span></div>
					<div>Clips: <span class="text-white">{project.clips.length}</span></div>
					<div>Format: <span class="text-white">MP4 · 1080×1920</span></div>
					<div>Codec: <span class="text-white">H.264 · AAC</span></div>
				</div>
			</div>

			<div class="text-center text-xs text-neutral-500 max-w-[260px]">
				Export runs on-device using ffmpeg.wasm. A 1-minute video takes about 1–2 minutes to encode.
			</div>

		{:else if exportState === 'exporting'}
			<!-- Progress -->
			<div class="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
			<div class="text-center space-y-2">
				<p class="text-sm text-white font-semibold">{progressMessage}</p>
				<div class="w-64 bg-neutral-700 rounded-full h-2 overflow-hidden">
					<div
						class="bg-emerald-500 h-2 rounded-full transition-all duration-300"
						style="width: {Math.round(progress * 100)}%"
					></div>
				</div>
				<p class="text-xs text-neutral-500">{Math.round(progress * 100)}%</p>
			</div>

		{:else if exportState === 'done'}
			<!-- Success -->
			<div class="flex flex-col items-center gap-3">
				<div class="w-16 h-16 bg-emerald-600 rounded-full flex items-center justify-center">
					<span class="material-icons text-3xl text-white">check</span>
				</div>
				<p class="text-lg font-bold text-white">Video Ready!</p>
				<p class="text-xs text-neutral-400 text-center">1080×1920 · H.264 · saved locally</p>
			</div>

			{#if outputUrl}
				<video
					src={outputUrl}
					controls
					class="w-40 rounded-xl border border-neutral-700"
					style="aspect-ratio: 9/16"
				></video>
			{/if}

			<div class="w-full space-y-3">
				<button
					onclick={shareVideo}
					class="w-full bg-emerald-600 text-white font-semibold py-4 rounded-2xl text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
				>
					<span class="material-icons text-base">share</span>
					Share / Save to Gallery
				</button>
				<button
					onclick={downloadVideo}
					class="w-full bg-neutral-700 text-white font-semibold py-3 rounded-2xl text-sm flex items-center justify-center gap-2"
				>
					<span class="material-icons text-base">download</span>
					Download
				</button>
			</div>

		{:else if exportState === 'error'}
			<span class="material-icons text-4xl text-red-400">error_outline</span>
			<p class="text-sm text-red-300 text-center">{errorMsg}</p>
			<button onclick={startExport} class="bg-neutral-700 text-white px-4 py-2 rounded-xl text-sm">
				Retry
			</button>
		{/if}
	</div>

	{#if exportState === 'idle'}
		<div class="px-4 pb-safe pt-3 border-t border-neutral-800 bg-neutral-900">
			<button
				onclick={startExport}
				disabled={project.clips.length === 0}
				class="w-full bg-emerald-600 disabled:bg-neutral-700 disabled:text-neutral-500 text-white font-semibold py-4 rounded-2xl text-sm active:scale-[0.98] transition-transform flex items-center justify-center gap-2"
			>
				<span class="material-icons text-base">movie</span>
				Export Video
			</button>
		</div>
	{/if}

	{#if exportState === 'done'}
		<div class="px-4 pb-safe pt-3 border-t border-neutral-800 bg-neutral-900">
			<button
				onclick={() => mobileState.navigate('home')}
				class="w-full bg-neutral-800 text-white font-semibold py-3 rounded-2xl text-sm"
			>
				Back to Home
			</button>
		</div>
	{/if}
</div>
