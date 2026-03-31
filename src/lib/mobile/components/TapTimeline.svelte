<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { mobileState } from '../state.svelte';
	import { MobileProjectService } from '../services/MobileProjectService';
	import { MobileAudioStore } from '../services/MobileAudioStore';
	import type { MobileSubtitleClip } from '../types';

	type TimelineMode = 'tap' | 'review';

	let mode: TimelineMode = $state('tap');
	let isPlaying = $state(false);
	let currentMs = $state(0);
	let audioBlobUrl: string | null = $state(null);
	let audioEl: HTMLAudioElement | undefined = $state(undefined);
	let clips: MobileSubtitleClip[] = $state([]);
	let tapIndex = $state(0); // which clip we're marking next
	let editingClipId: string | null = $state(null);
	let nudgeAmount = 100; // ms

	let rafId: number | null = null;

	onMount(async () => {
		const project = mobileState.currentProject;
		if (!project) return;

		// Load audio
		let url = mobileState.audioBlobUrl;
		if (!url) {
			url = await MobileAudioStore.getBlobUrl(project.audioKey);
			mobileState.audioBlobUrl = url;
		}
		audioBlobUrl = url;

		// Start with the Tarteel-detected clips as the baseline
		clips = project.clips.map((c) => ({ ...c }));
		// Reset start times so user taps them in order
		tapIndex = 0;
	});

	onDestroy(() => {
		if (rafId) cancelAnimationFrame(rafId);
	});

	function tick() {
		if (audioEl) currentMs = audioEl.currentTime * 1000;
		rafId = requestAnimationFrame(tick);
	}

	function onAudioPlay() {
		isPlaying = true;
		rafId = requestAnimationFrame(tick);
	}

	function onAudioPause() {
		isPlaying = false;
		if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
		if (audioEl) currentMs = audioEl.currentTime * 1000;
	}

	function togglePlay() {
		if (!audioEl) return;
		if (isPlaying) audioEl.pause();
		else audioEl.play();
	}

	/** Called when user taps the big Mark button during tap mode */
	function markTimestamp() {
		if (tapIndex >= clips.length || !audioEl) return;
		const ms = Math.round(audioEl.currentTime * 1000);

		// Set the startMs of the current clip; adjust previous clip's endMs
		const updated = clips.map((c, i) => {
			if (i === tapIndex) return { ...c, startMs: ms };
			if (i === tapIndex - 1) return { ...c, endMs: ms };
			return c;
		});

		// Last clip's end = audio duration
		if (tapIndex === clips.length - 1 && audioEl) {
			updated[clips.length - 1] = {
				...updated[clips.length - 1],
				endMs: Math.round(audioEl.duration * 1000)
			};
		}

		clips = updated;
		tapIndex++;

		if (tapIndex >= clips.length) {
			mode = 'review';
		}
	}

	function nudge(clipId: string, field: 'startMs' | 'endMs', deltaMs: number) {
		clips = clips.map((c) =>
			c.id === clipId ? { ...c, [field]: Math.max(0, c[field] + deltaMs) } : c
		);
	}

	function seekTo(ms: number) {
		if (audioEl) audioEl.currentTime = ms / 1000;
	}

	function formatTime(ms: number): string {
		const s = Math.floor(ms / 1000);
		const m = Math.floor(s / 60);
		return `${m}:${(s % 60).toString().padStart(2, '0')}.${(ms % 1000).toString().slice(0, 1)}`;
	}

	async function save() {
		const project = mobileState.currentProject;
		if (!project) return;
		const updated = { ...project, clips };
		await MobileProjectService.save(updated);
		mobileState.setProject(updated);
		mobileState.navigate('style');
	}

	const currentClipLabel = $derived(
		tapIndex < clips.length
			? `${clips[tapIndex].surah}:${clips[tapIndex].ayah}`
			: 'All marked!'
	);

	const durationMs = $derived(mobileState.currentProject?.durationMs ?? 0);
	const progressPct = $derived(durationMs > 0 ? (currentMs / durationMs) * 100 : 0);
</script>

<div class="flex flex-col h-full">
	<!-- Header -->
	<div class="flex items-center gap-3 px-4 pt-safe pb-3 bg-neutral-900 border-b border-neutral-800">
		<button onclick={() => mobileState.navigate('detect')} class="text-neutral-400 p-1">
			<span class="material-icons">arrow_back</span>
		</button>
		<div class="flex-1">
			<h1 class="text-base font-bold">Sync Timestamps</h1>
			<p class="text-xs text-neutral-400">
				{mode === 'tap' ? `Tap Mark when each verse starts` : 'Review & fine-tune'}
			</p>
		</div>
		{#if mode === 'tap'}
			<button onclick={() => { mode = 'review'; }} class="text-xs text-neutral-400 border border-neutral-700 px-2 py-1 rounded-lg">
				Skip to review
			</button>
		{/if}
	</div>

	<!-- Audio player + progress bar -->
	<div class="px-4 py-3 bg-neutral-900 border-b border-neutral-800 space-y-2">
		{#if audioBlobUrl}
			<audio
				bind:this={audioEl}
				src={audioBlobUrl}
				onplay={onAudioPlay}
				onpause={onAudioPause}
				class="hidden"
			></audio>
		{/if}

		<!-- Progress bar (tappable) -->
		<div
			class="w-full h-2 bg-neutral-700 rounded-full cursor-pointer relative overflow-hidden"
			onclick={(e) => {
				const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
				const pct = (e.clientX - rect.left) / rect.width;
				seekTo(pct * durationMs);
			}}
		>
			<div class="h-2 bg-emerald-500 rounded-full" style="width: {progressPct}%"></div>
			<!-- Clip markers -->
			{#each clips as clip}
				<div
					class="absolute top-0 w-0.5 h-full bg-yellow-400 opacity-70"
					style="left: {(clip.startMs / durationMs) * 100}%"
				></div>
			{/each}
		</div>

		<div class="flex items-center justify-between">
			<span class="text-xs text-neutral-500 font-mono">{formatTime(currentMs)}</span>
			<button
				onclick={togglePlay}
				class="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center active:scale-95"
			>
				<span class="material-icons text-white">{isPlaying ? 'pause' : 'play_arrow'}</span>
			</button>
			<span class="text-xs text-neutral-500 font-mono">{formatTime(durationMs)}</span>
		</div>
	</div>

	<div class="flex-1 overflow-y-auto">
		{#if mode === 'tap'}
			<!-- Tap mode -->
			<div class="flex flex-col items-center justify-center h-full gap-6 px-6">
				<div class="text-center">
					<p class="text-neutral-400 text-sm">Next verse to mark:</p>
					<p class="text-2xl font-bold text-white mt-1">{currentClipLabel}</p>
					{#if tapIndex < clips.length}
						<p class="text-xs text-neutral-500 mt-1 max-w-[240px] mx-auto line-clamp-2 text-right" dir="rtl">
							{clips[tapIndex].text}
						</p>
					{/if}
					<p class="text-xs text-neutral-600 mt-2">{tapIndex} / {clips.length} marked</p>
				</div>

				<button
					onclick={markTimestamp}
					disabled={tapIndex >= clips.length}
					class="w-32 h-32 rounded-full bg-emerald-600 disabled:bg-neutral-700 flex items-center justify-center
						active:scale-95 transition-transform shadow-xl shadow-emerald-900/40 text-white flex-col gap-1"
				>
					<span class="material-icons text-3xl">flag</span>
					<span class="text-xs font-semibold">MARK</span>
				</button>

				<p class="text-xs text-neutral-600 text-center">
					Press play, then tap Mark each time a new verse starts
				</p>
			</div>

		{:else}
			<!-- Review mode -->
			<div class="px-4 py-3 space-y-3">
				{#each clips as clip (clip.id)}
					<div class="bg-neutral-800 rounded-2xl p-3 space-y-2">
						<!-- Clip header -->
						<div class="flex items-start justify-between">
							<div>
								<p class="font-semibold text-sm text-white">{clip.surah}:{clip.ayah}</p>
								<p class="text-xs text-neutral-400 text-right mt-0.5 line-clamp-1" dir="rtl">
									{clip.text.slice(0, 40)}…
								</p>
							</div>
							<button
								onclick={() => seekTo(clip.startMs)}
								class="text-neutral-400 hover:text-white p-1"
							>
								<span class="material-icons text-base">play_circle_outline</span>
							</button>
						</div>

						<!-- Start time -->
						<div class="flex items-center gap-2">
							<span class="text-xs text-neutral-500 w-8">Start</span>
							<span class="text-xs font-mono text-emerald-400 w-16">{formatTime(clip.startMs)}</span>
							<div class="flex gap-1 ml-auto">
								<button onclick={() => nudge(clip.id, 'startMs', -500)} class="nudge-btn">-0.5s</button>
								<button onclick={() => nudge(clip.id, 'startMs', -100)} class="nudge-btn">-0.1s</button>
								<button onclick={() => nudge(clip.id, 'startMs', 100)} class="nudge-btn">+0.1s</button>
								<button onclick={() => nudge(clip.id, 'startMs', 500)} class="nudge-btn">+0.5s</button>
							</div>
						</div>

						<!-- End time -->
						<div class="flex items-center gap-2">
							<span class="text-xs text-neutral-500 w-8">End</span>
							<span class="text-xs font-mono text-orange-400 w-16">{formatTime(clip.endMs)}</span>
							<div class="flex gap-1 ml-auto">
								<button onclick={() => nudge(clip.id, 'endMs', -500)} class="nudge-btn">-0.5s</button>
								<button onclick={() => nudge(clip.id, 'endMs', -100)} class="nudge-btn">-0.1s</button>
								<button onclick={() => nudge(clip.id, 'endMs', 100)} class="nudge-btn">+0.1s</button>
								<button onclick={() => nudge(clip.id, 'endMs', 500)} class="nudge-btn">+0.5s</button>
							</div>
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</div>

	<!-- CTA -->
	{#if mode === 'review'}
		<div class="px-4 pb-safe pt-3 border-t border-neutral-800 bg-neutral-900">
			<button
				onclick={save}
				class="w-full bg-emerald-600 text-white font-semibold py-4 rounded-2xl text-sm active:scale-[0.98] transition-transform"
			>
				Next: Style
			</button>
		</div>
	{/if}
</div>

<style>
	:global(.nudge-btn) {
		background: #404040;
		color: #d4d4d4;
		font-size: 0.65rem;
		padding: 2px 5px;
		border-radius: 6px;
		active:scale-95;
	}
</style>
