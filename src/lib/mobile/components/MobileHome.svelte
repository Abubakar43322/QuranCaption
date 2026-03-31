<script lang="ts">
	import { mobileState } from '../state.svelte';
	import { MobileProjectService } from '../services/MobileProjectService';
	import { MobileAudioStore } from '../services/MobileAudioStore';
	import type { MobileProject } from '../types';

	function openProject(project: MobileProject) {
		mobileState.setProject(project);
		mobileState.navigate('timeline');
	}

	async function deleteProject(id: string, e: MouseEvent) {
		e.stopPropagation();
		if (!confirm('Delete this project?')) return;
		await MobileProjectService.delete(id);
		await MobileAudioStore.delete(id);
		mobileState.projects = mobileState.projects.filter((p) => p.id !== id);
	}

	function formatDuration(ms: number): string {
		const s = Math.floor(ms / 1000);
		const m = Math.floor(s / 60);
		return `${m}:${(s % 60).toString().padStart(2, '0')}`;
	}

	function formatDate(ts: number): string {
		return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
	}
</script>

<div class="flex flex-col h-full">
	<!-- Header -->
	<div class="flex items-center justify-between px-4 pt-safe pb-3 bg-neutral-900 border-b border-neutral-800">
		<div>
			<h1 class="text-lg font-bold text-white">QuranCaption</h1>
			<p class="text-xs text-neutral-400">Short-form Quran videos</p>
		</div>
		<button
			onclick={() => mobileState.navigate('create')}
			class="flex items-center gap-1 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold px-3 py-2 rounded-xl active:scale-95 transition-transform"
		>
			<span class="material-icons text-base">add</span>
			New
		</button>
	</div>

	<!-- Project list -->
	<div class="flex-1 overflow-y-auto px-4 py-3 space-y-3">
		{#if mobileState.projects.length === 0}
			<div class="flex flex-col items-center justify-center h-full gap-4 text-center py-20">
				<span class="material-icons text-5xl text-neutral-600">video_library</span>
				<p class="text-neutral-400 text-sm max-w-[200px]">
					No projects yet. Tap <strong class="text-white">New</strong> to create your first Quran caption video.
				</p>
			</div>
		{:else}
			{#each mobileState.projects as project (project.id)}
				<div class="relative">
					<!-- Tap target (card) -->
					<div
						role="button"
						tabindex="0"
						onclick={() => openProject(project)}
						onkeydown={(e) => e.key === 'Enter' && openProject(project)}
						class="w-full text-left bg-neutral-800 rounded-2xl p-4 active:scale-[0.98] transition-transform cursor-pointer pr-12"
					>
						<div class="flex items-start justify-between gap-2">
							<div class="flex-1 min-w-0">
								<p class="font-semibold text-white truncate">{project.name}</p>
								<p class="text-xs text-neutral-400 mt-0.5">{project.reciter || 'No reciter'}</p>
							</div>
							<span class="text-xs text-neutral-500 shrink-0">{formatDate(project.updatedAt)}</span>
						</div>
						<div class="flex items-center gap-3 mt-3">
							<span class="inline-flex items-center gap-1 text-xs bg-neutral-700 text-neutral-300 px-2 py-0.5 rounded-full">
								<span class="material-icons text-xs">schedule</span>
								{formatDuration(project.durationMs)}
							</span>
							<span class="text-xs text-neutral-500">
								{project.surahStart}:{project.ayahStart}–{project.surahEnd}:{project.ayahEnd}
							</span>
							{#if project.clips.length > 0}
								<span class="inline-flex items-center gap-1 text-xs bg-emerald-900/50 text-emerald-400 px-2 py-0.5 rounded-full">
									<span class="material-icons text-xs">check_circle</span>
									{project.clips.length}
								</span>
							{/if}
						</div>
					</div>
					<!-- Delete button (separate from card to avoid nested buttons) -->
					<button
						onclick={(e) => deleteProject(project.id, e)}
						class="absolute top-3 right-3 text-neutral-600 hover:text-red-400 p-1"
					>
						<span class="material-icons text-base">delete_outline</span>
					</button>
				</div>
			{/each}
		{/if}
	</div>
</div>
