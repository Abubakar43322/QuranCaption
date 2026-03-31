<script lang="ts">
	import { onMount } from 'svelte';
	import { mobileState } from '../state.svelte';
	import { MobileProjectService } from '../services/MobileProjectService';
	import { MobileAudioStore } from '../services/MobileAudioStore';
	import { loadTarteelModel, detectVerses, isTarteelModelLoaded, type TarteelDetection } from '../services/TarteelService';
	import { generateId, type MobileSubtitleClip } from '../types';
	import { Quran } from '$lib/classes/Quran';

	type DetectionState = 'loading-model' | 'detecting' | 'done' | 'error';

	let detectState: DetectionState = $state('loading-model');
	let modelProgress = $state(0);
	let detections: TarteelDetection[] = $state([]);
	let confirmed: Set<number> = $state(new Set()); // chunk indices confirmed
	let errorMsg = $state('');

	let surahNames: Record<number, string> = {};

	onMount(async () => {
		await Quran.load();
		Quran.getSurahs().forEach((s) => (surahNames[s.id] = s.name));

		if (!isTarteelModelLoaded()) {
			detectState = 'loading-model';
			try {
				await loadTarteelModel((loaded, total) => {
					modelProgress = total > 0 ? loaded / total : 0;
					mobileState.tarteelProgress = modelProgress;
				});
			} catch (e) {
				detectState = 'error';
				errorMsg = 'Failed to load Tarteel model. Check your internet connection and try again.';
				return;
			}
		}

		await runDetection();
	});

	async function runDetection() {
		detectState = 'detecting';
		const project = mobileState.currentProject;
		if (!project) return;

		const blob = await MobileAudioStore.load(project.audioKey);
		if (!blob) { detectState = 'error'; errorMsg = 'Audio not found.'; return; }

		const arrayBuffer = await blob.arrayBuffer();
		const audioCtx = new AudioContext({ sampleRate: 16000 });
		const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

		detections = [];
		confirmed = new Set();
		try {
			await detectVerses(audioBuffer, (d) => {
				detections = [...detections, d];
				// Auto-confirm if high confidence
				if (d.confidence > 0.75) {
					confirmed = new Set([...confirmed, d.chunkIndex]);
				}
			});
		} catch (e) {
			detectState = 'error';
			errorMsg = String(e);
			return;
		}
		detectState = 'done';
	}

	function toggleConfirm(chunkIndex: number) {
		const next = new Set(confirmed);
		if (next.has(chunkIndex)) next.delete(chunkIndex);
		else next.add(chunkIndex);
		confirmed = next;
	}

	async function proceed() {
		const project = mobileState.currentProject;
		if (!project) return;

		// Build initial clips from confirmed detections
		// Timestamps will be refined in the TapTimeline step
		const chunkSeconds = 5;
		const clips: MobileSubtitleClip[] = [];
		for (const d of detections) {
			if (!confirmed.has(d.chunkIndex)) continue;
			const startMs = d.chunkIndex * chunkSeconds * 1000;
			const endMs = Math.min(startMs + chunkSeconds * 1000, project.durationMs);

			// Get Arabic text for the detected verse
			let text = '';
			try {
				const verse = await Quran.getVerse(d.surah, d.ayah);
				if (verse) {
					text = verse.getArabicTextBetweenTwoIndexes(0, verse.words.length - 1);
				}
			} catch {
				text = `${d.surah}:${d.ayah}`;
			}

			clips.push({
				id: generateId(),
				startMs,
				endMs,
				surah: d.surah,
				ayah: d.ayah,
				startWord: 0,
				endWord: 999,
				text,
				confidence: d.confidence
			});
		}

		const updated = { ...project, clips };
		await MobileProjectService.save(updated);
		mobileState.setProject(updated);
		mobileState.navigate('timeline');
	}

	function confidenceColor(c: number): string {
		if (c > 0.8) return 'text-emerald-400';
		if (c > 0.5) return 'text-yellow-400';
		return 'text-red-400';
	}

	function surahName(id: number): string {
		return surahNames[id] ? `${id}. ${surahNames[id]}` : `Surah ${id}`;
	}
</script>

<div class="flex flex-col h-full">
	<!-- Header -->
	<div class="flex items-center gap-3 px-4 pt-safe pb-3 bg-neutral-900 border-b border-neutral-800">
		<button onclick={() => mobileState.navigate('record')} class="text-neutral-400 p-1">
			<span class="material-icons">arrow_back</span>
		</button>
		<div>
			<h1 class="text-base font-bold">Verse Detection</h1>
			<p class="text-xs text-neutral-400">Powered by offline Tarteel</p>
		</div>
	</div>

	<div class="flex-1 overflow-y-auto px-4 py-4">
		{#if detectState === 'loading-model'}
			<div class="flex flex-col items-center justify-center h-full gap-4">
				<span class="material-icons text-4xl text-emerald-500 animate-pulse">model_training</span>
				<p class="text-sm text-neutral-300 font-semibold">Loading Tarteel model…</p>
				<p class="text-xs text-neutral-500">131 MB · one-time download · stored locally</p>
				<div class="w-64 bg-neutral-800 rounded-full h-2 overflow-hidden">
					<div
						class="bg-emerald-500 h-2 rounded-full transition-all duration-200"
						style="width: {Math.round(modelProgress * 100)}%"
					></div>
				</div>
				<p class="text-xs text-neutral-500">{Math.round(modelProgress * 100)}%</p>
			</div>

		{:else if detectState === 'detecting'}
			<div class="flex flex-col items-center justify-center h-full gap-4">
				<div class="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
				<p class="text-sm text-neutral-300">Detecting verses…</p>
				<p class="text-xs text-neutral-500">{detections.length} chunks processed</p>
			</div>

		{:else if detectState === 'error'}
			<div class="flex flex-col items-center justify-center h-full gap-4 text-center">
				<span class="material-icons text-4xl text-red-400">error_outline</span>
				<p class="text-sm text-red-300">{errorMsg}</p>
				<button onclick={runDetection} class="bg-neutral-700 text-white px-4 py-2 rounded-xl text-sm">
					Retry
				</button>
			</div>

		{:else if detectState === 'done'}
			<div class="space-y-2">
				<p class="text-xs text-neutral-500 mb-3">
					{confirmed.size} of {detections.length} chunks confirmed. Tap to toggle.
				</p>
				{#each detections as d}
					<button
						onclick={() => toggleConfirm(d.chunkIndex)}
						class="w-full text-left rounded-2xl p-3 border transition-colors
							{confirmed.has(d.chunkIndex)
								? 'bg-emerald-900/30 border-emerald-700'
								: 'bg-neutral-800 border-neutral-700'}"
					>
						<div class="flex items-center justify-between">
							<div>
								<p class="font-semibold text-sm text-white">
									{surahName(d.surah)}, Ayah {d.ayah}
								</p>
								<p class="text-xs text-neutral-500 mt-0.5">
									Chunk {d.chunkIndex + 1} · {d.chunkIndex * 5}s–{(d.chunkIndex + 1) * 5}s
								</p>
							</div>
							<div class="flex items-center gap-2">
								<span class="text-xs font-mono {confidenceColor(d.confidence)}">
									{Math.round(d.confidence * 100)}%
								</span>
								<span class="material-icons text-base {confirmed.has(d.chunkIndex) ? 'text-emerald-400' : 'text-neutral-600'}">
									{confirmed.has(d.chunkIndex) ? 'check_circle' : 'radio_button_unchecked'}
								</span>
							</div>
						</div>
					</button>
				{/each}
			</div>
		{/if}
	</div>

	{#if detectState === 'done'}
		<div class="px-4 pb-safe pt-3 border-t border-neutral-800 bg-neutral-900">
			<button
				onclick={proceed}
				disabled={confirmed.size === 0}
				class="w-full bg-emerald-600 disabled:bg-neutral-700 disabled:text-neutral-500 text-white font-semibold py-4 rounded-2xl text-sm active:scale-[0.98] transition-transform"
			>
				Next: Sync Timestamps ({confirmed.size} verses)
			</button>
		</div>
	{/if}
</div>
