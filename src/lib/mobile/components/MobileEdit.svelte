<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { mobileState } from '../state.svelte';
	import { MobileProjectService } from '../services/MobileProjectService';
	import { MobileAudioStore } from '../services/MobileAudioStore';
	import type { MobileSubtitleClip } from '../types';

	type Tab = 'sync' | 'style';
	type SyncMode = 'tap' | 'review';

	let tab: Tab = $state('sync');
	let syncMode: SyncMode = $state('tap');

	// Audio
	let audioEl: HTMLAudioElement | undefined = $state();
	let isPlaying = $state(false);
	let currentMs = $state(0);
	let rafId: number | null = null;

	// Sync
	let clips: MobileSubtitleClip[] = $state([]);
	let tapIndex = $state(0);

	// Style (local copy, saved on navigate away)
	let style = $state({ ...mobileState.currentProject?.textStyle });
	let bg = $state({ ...mobileState.currentProject?.background });

	onMount(async () => {
		const project = mobileState.currentProject;
		if (!project) return;
		clips = project.clips.map((c) => ({ ...c }));
		style = { ...project.textStyle };
		bg = { ...project.background };

		let url = mobileState.audioBlobUrl;
		if (!url) {
			url = await MobileAudioStore.getBlobUrl(project.audioKey);
			mobileState.audioBlobUrl = url;
		}
	});

	onDestroy(() => { if (rafId) cancelAnimationFrame(rafId); });

	function tick() {
		if (audioEl) currentMs = audioEl.currentTime * 1000;
		rafId = requestAnimationFrame(tick);
	}

	function togglePlay() {
		if (!audioEl) return;
		isPlaying ? audioEl.pause() : audioEl.play();
	}

	function mark() {
		if (tapIndex >= clips.length || !audioEl) return;
		const ms = Math.round(audioEl.currentTime * 1000);
		clips = clips.map((c, i) => {
			if (i === tapIndex) return { ...c, startMs: ms };
			if (i === tapIndex - 1) return { ...c, endMs: ms };
			return c;
		});
		if (tapIndex === clips.length - 1 && audioEl) {
			clips[clips.length - 1] = { ...clips[clips.length - 1], endMs: Math.round(audioEl.duration * 1000) };
		}
		tapIndex++;
		if (tapIndex >= clips.length) syncMode = 'review';
	}

	function nudge(id: string, field: 'startMs' | 'endMs', delta: number) {
		clips = clips.map((c) => c.id === id ? { ...c, [field]: Math.max(0, c[field] + delta) } : c);
	}

	function seek(e: MouseEvent) {
		const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
		const pct = (e.clientX - rect.left) / rect.width;
		if (audioEl) audioEl.currentTime = (pct * durationMs) / 1000;
	}

	function fmt(ms: number) {
		const s = Math.floor(ms / 1000);
		return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
	}

	async function saveAndExport() {
		const project = mobileState.currentProject;
		if (!project) return;
		const updated = { ...project, clips, textStyle: style, background: bg, updatedAt: Date.now() };
		await MobileProjectService.save(updated);
		mobileState.setProject(updated);
		mobileState.audioBlobUrl = mobileState.audioBlobUrl; // keep url
		mobileState.navigate('export');
	}

	const durationMs = $derived(mobileState.currentProject?.durationMs ?? 0);
	const progressPct = $derived(durationMs > 0 ? (currentMs / durationMs) * 100 : 0);
	const currentLabel = $derived(tapIndex < clips.length ? `${clips[tapIndex].surah}:${clips[tapIndex].ayah}` : 'All done!');
</script>

<div class="flex flex-col h-full">
	<!-- Header -->
	<div class="flex items-center gap-3 px-4 pt-4 pb-3 bg-neutral-900 border-b border-neutral-800">
		<button onclick={() => mobileState.navigate('home')} class="text-neutral-400 p-1">
			<span class="material-icons">arrow_back</span>
		</button>
		<h1 class="flex-1 text-base font-bold truncate">{mobileState.currentProject?.name}</h1>
		<button onclick={saveAndExport} class="bg-emerald-600 text-white text-sm font-semibold px-3 py-1.5 rounded-xl">
			Export
		</button>
	</div>

	<!-- Audio player -->
	<div class="px-4 py-3 bg-neutral-900 border-b border-neutral-800 space-y-2">
		{#if mobileState.audioBlobUrl}
			<audio bind:this={audioEl} src={mobileState.audioBlobUrl}
				onplay={() => { isPlaying = true; rafId = requestAnimationFrame(tick); }}
				onpause={() => { isPlaying = false; if (rafId) { cancelAnimationFrame(rafId); rafId = null; } }}
				class="hidden"
			></audio>
		{/if}
		<!-- Scrub bar -->
		<div role="slider" aria-valuenow={progressPct} aria-valuemin={0} aria-valuemax={100} tabindex="0"
			class="w-full h-2 bg-neutral-700 rounded-full cursor-pointer relative overflow-hidden"
			onclick={seek}
			onkeydown={(e) => { if (e.key === 'ArrowRight') seek; }}
		>
			<div class="h-2 bg-emerald-500 rounded-full pointer-events-none" style="width:{progressPct}%"></div>
			{#each clips as c}
				<div class="absolute top-0 w-0.5 h-full bg-yellow-400/60 pointer-events-none"
					style="left:{(c.startMs / durationMs) * 100}%"></div>
			{/each}
		</div>
		<div class="flex items-center justify-between">
			<span class="text-xs text-neutral-500 font-mono">{fmt(currentMs)}</span>
			<button onclick={togglePlay} class="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center active:scale-95">
				<span class="material-icons">{isPlaying ? 'pause' : 'play_arrow'}</span>
			</button>
			<span class="text-xs text-neutral-500 font-mono">{fmt(durationMs)}</span>
		</div>
	</div>

	<!-- Tabs -->
	<div class="flex border-b border-neutral-800 bg-neutral-900">
		{#each (['sync', 'style'] as Tab[]) as t}
			<button onclick={() => tab = t}
				class="flex-1 py-2.5 text-sm font-semibold transition-colors {tab === t ? 'text-white border-b-2 border-emerald-500' : 'text-neutral-500'}">
				{t === 'sync' ? 'Sync' : 'Style'}
			</button>
		{/each}
	</div>

	<!-- Tab content -->
	<div class="flex-1 overflow-y-auto">
		{#if tab === 'sync'}
			{#if syncMode === 'tap'}
				<!-- Tap mode -->
				<div class="flex flex-col items-center justify-center h-full gap-6 px-6 text-center">
					<div>
						<p class="text-neutral-400 text-sm">Tap when this verse starts</p>
						<p class="text-3xl font-bold mt-1">{currentLabel}</p>
						{#if tapIndex < clips.length}
							<p class="text-sm text-neutral-500 mt-1 font-arabic" dir="rtl">{clips[tapIndex].text}</p>
						{/if}
						<p class="text-xs text-neutral-600 mt-2">{tapIndex} / {clips.length}</p>
					</div>

					<button onclick={mark} disabled={tapIndex >= clips.length}
						class="w-28 h-28 rounded-full bg-emerald-600 disabled:bg-neutral-700 flex flex-col items-center justify-center gap-1 active:scale-95 transition-transform shadow-xl shadow-emerald-900/30">
						<span class="material-icons text-3xl">flag</span>
						<span class="text-xs font-bold">MARK</span>
					</button>

					<button onclick={() => syncMode = 'review'} class="text-xs text-neutral-600 underline">
						Skip to review
					</button>
				</div>
			{:else}
				<!-- Review mode -->
				<div class="px-4 py-3 space-y-2">
					<div class="flex items-center justify-between mb-2">
						<p class="text-xs text-neutral-400">Fine-tune timestamps</p>
						<button onclick={() => { tapIndex = 0; syncMode = 'tap'; }}
							class="text-xs text-neutral-500 border border-neutral-700 px-2 py-1 rounded-lg">
							Re-mark
						</button>
					</div>
					{#each clips as clip (clip.id)}
						<div class="bg-neutral-800 rounded-2xl p-3">
							<div class="flex items-center justify-between mb-2">
								<div>
									<span class="font-semibold text-sm">{clip.surah}:{clip.ayah}</span>
									<p class="text-xs text-neutral-500 mt-0.5" dir="rtl">{clip.text.slice(0, 30)}…</p>
								</div>
								<button onclick={() => { if (audioEl) audioEl.currentTime = clip.startMs / 1000; }}
									class="text-neutral-400 p-1">
									<span class="material-icons text-base">play_circle_outline</span>
								</button>
							</div>
							<div class="flex gap-2 text-xs">
								<div class="flex-1 space-y-1">
									<p class="text-neutral-500">Start <span class="font-mono text-emerald-400">{fmt(clip.startMs)}</span></p>
									<div class="flex gap-1">
										<button onclick={() => nudge(clip.id, 'startMs', -500)} class="nudge">-½s</button>
										<button onclick={() => nudge(clip.id, 'startMs', -100)} class="nudge">-0.1</button>
										<button onclick={() => nudge(clip.id, 'startMs', 100)} class="nudge">+0.1</button>
										<button onclick={() => nudge(clip.id, 'startMs', 500)} class="nudge">+½s</button>
									</div>
								</div>
								<div class="flex-1 space-y-1">
									<p class="text-neutral-500">End <span class="font-mono text-orange-400">{fmt(clip.endMs)}</span></p>
									<div class="flex gap-1">
										<button onclick={() => nudge(clip.id, 'endMs', -500)} class="nudge">-½s</button>
										<button onclick={() => nudge(clip.id, 'endMs', -100)} class="nudge">-0.1</button>
										<button onclick={() => nudge(clip.id, 'endMs', 100)} class="nudge">+0.1</button>
										<button onclick={() => nudge(clip.id, 'endMs', 500)} class="nudge">+½s</button>
									</div>
								</div>
							</div>
						</div>
					{/each}
				</div>
			{/if}

		{:else}
			<!-- Style tab -->
			<div class="px-4 py-4 space-y-5">
				<!-- Font -->
				<div class="space-y-2">
					<p class="text-xs text-neutral-400 font-semibold uppercase tracking-wider">Font</p>
					<div class="flex gap-2">
						{#each ['QPC1', 'QPC2', 'Hafs'] as f}
							<button onclick={() => style.fontFamily = f as typeof style.fontFamily}
								class="flex-1 py-2.5 rounded-xl text-sm font-semibold border transition-colors
									{style.fontFamily === f ? 'bg-emerald-600 border-emerald-500 text-white' : 'bg-neutral-800 border-neutral-700 text-neutral-300'}">
								{f}
							</button>
						{/each}
					</div>
				</div>

				<!-- Text color -->
				<div class="flex items-center justify-between">
					<p class="text-xs text-neutral-400 font-semibold uppercase tracking-wider">Text Color</p>
					<input type="color" bind:value={style.textColor} class="w-10 h-10 rounded-xl cursor-pointer border-0 bg-transparent" />
				</div>

				<!-- Position -->
				<div class="space-y-2">
					<p class="text-xs text-neutral-400 font-semibold uppercase tracking-wider">Position</p>
					<div class="flex gap-2">
						{#each [['top', 'Top'], ['center', 'Middle'], ['bottom', 'Bottom']] as [val, label]}
							<button onclick={() => style.position = val as typeof style.position}
								class="flex-1 py-2.5 rounded-xl text-sm font-semibold border transition-colors
									{style.position === val ? 'bg-emerald-600 border-emerald-500 text-white' : 'bg-neutral-800 border-neutral-700 text-neutral-300'}">
								{label}
							</button>
						{/each}
					</div>
				</div>

				<!-- Background -->
				<div class="space-y-2">
					<p class="text-xs text-neutral-400 font-semibold uppercase tracking-wider">Background</p>
					<div class="flex gap-2">
						{#each [['color', 'Solid'], ['gradient', 'Gradient']] as [val, label]}
							<button onclick={() => bg.type = val as typeof bg.type}
								class="flex-1 py-2.5 rounded-xl text-sm font-semibold border transition-colors
									{bg.type === val ? 'bg-emerald-600 border-emerald-500 text-white' : 'bg-neutral-800 border-neutral-700 text-neutral-300'}">
								{label}
							</button>
						{/each}
					</div>
					<div class="flex items-center gap-3 bg-neutral-800 rounded-2xl p-3">
						<input type="color" bind:value={bg.color} class="w-10 h-10 rounded-xl cursor-pointer border-0 bg-transparent" />
						<span class="text-sm text-neutral-400">
							{bg.type === 'gradient' ? 'Color 1' : 'Color'}
						</span>
						{#if bg.type === 'gradient'}
							<input type="color" bind:value={bg.color2} class="w-10 h-10 rounded-xl cursor-pointer border-0 bg-transparent ml-auto" />
							<span class="text-sm text-neutral-400">Color 2</span>
						{/if}
					</div>
				</div>

				<!-- Preview -->
				<div class="rounded-2xl overflow-hidden aspect-[9/16] w-full max-w-[180px] mx-auto flex items-end justify-center p-4 text-center"
					style="background: {bg.type === 'gradient' && bg.color2
						? `linear-gradient(to bottom, ${bg.color}, ${bg.color2})`
						: bg.color}">
					<p class="text-white text-sm font-bold" style="font-family: {style.fontFamily}; color: {style.textColor}; text-shadow: 0 1px 4px #000">
						{clips[0]?.text.slice(0, 20) ?? 'بِسْمِ ٱللَّهِ'}
					</p>
				</div>
			</div>
		{/if}
	</div>
</div>

<style>
	:global(.nudge) {
		flex: 1;
		background: #404040;
		color: #d4d4d4;
		font-size: 0.65rem;
		padding: 3px 0;
		border-radius: 6px;
		text-align: center;
	}
</style>
