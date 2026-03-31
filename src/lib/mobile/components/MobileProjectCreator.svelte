<script lang="ts">
	import { onMount } from 'svelte';
	import { Quran } from '$lib/classes/Quran';
	import { mobileState } from '../state.svelte';
	import { MobileProjectService } from '../services/MobileProjectService';
	import { generateId, DEFAULT_TEXT_STYLE, type MobileProject } from '../types';

	let name = $state('');
	let reciter = $state('');
	let surahStart = $state(1);
	let ayahStart = $state(1);
	let surahEnd = $state(1);
	let ayahEnd = $state(7);
	let surahList: { id: number; name: string; totalAyah: number }[] = $state([]);
	let loading = $state(false);

	onMount(async () => {
		await Quran.load();
		surahList = Quran.getSurahs().map((s) => ({
			id: s.id,
			name: `${s.id}. ${s.name}`,
			totalAyah: s.totalAyah
		}));
	});

	const maxAyahStart = $derived(surahList.find((s) => s.id === surahStart)?.totalAyah ?? 286);
	const maxAyahEnd = $derived(surahList.find((s) => s.id === surahEnd)?.totalAyah ?? 286);

	$effect(() => {
		if (ayahStart > maxAyahStart) ayahStart = maxAyahStart;
	});
	$effect(() => {
		if (ayahEnd > maxAyahEnd) ayahEnd = maxAyahEnd;
	});
	$effect(() => {
		// Ensure end >= start within same surah
		if (surahEnd < surahStart) {
			surahEnd = surahStart;
			ayahEnd = ayahStart;
		} else if (surahEnd === surahStart && ayahEnd < ayahStart) {
			ayahEnd = ayahStart;
		}
	});

	const canProceed = $derived(name.trim().length > 0);

	async function proceed() {
		if (!canProceed || loading) return;
		loading = true;
		const project: MobileProject = {
			id: generateId(),
			name: name.trim(),
			reciter: reciter.trim(),
			createdAt: Date.now(),
			updatedAt: Date.now(),
			durationMs: 0,
			audioKey: '',
			surahStart,
			ayahStart,
			surahEnd,
			ayahEnd,
			clips: [],
			background: { type: 'color', color: '#0f172a' },
			textStyle: { ...DEFAULT_TEXT_STYLE },
			exportStatus: 'idle'
		};
		await MobileProjectService.save(project);
		mobileState.projects = [project, ...mobileState.projects];
		mobileState.setProject(project);
		mobileState.navigate('record');
		loading = false;
	}
</script>

<div class="flex flex-col h-full">
	<!-- Header -->
	<div class="flex items-center gap-3 px-4 pt-safe pb-3 bg-neutral-900 border-b border-neutral-800">
		<button onclick={() => mobileState.navigate('home')} class="text-neutral-400 p-1">
			<span class="material-icons">arrow_back</span>
		</button>
		<h1 class="text-base font-bold">New Project</h1>
	</div>

	<div class="flex-1 overflow-y-auto px-4 py-4 space-y-5">
		<!-- Name -->
		<div class="space-y-1">
			<label class="text-xs font-semibold text-neutral-400 uppercase tracking-wider" for="proj-name">
				Project Name
			</label>
			<input
				id="proj-name"
				bind:value={name}
				placeholder="e.g. Surah Al-Fatiha Reel"
				class="w-full bg-neutral-800 border border-neutral-700 text-white rounded-xl px-3 py-3 text-sm focus:outline-none focus:border-emerald-500"
			/>
		</div>

		<!-- Reciter -->
		<div class="space-y-1">
			<label class="text-xs font-semibold text-neutral-400 uppercase tracking-wider" for="reciter">
				Reciter (optional)
			</label>
			<input
				id="reciter"
				bind:value={reciter}
				placeholder="e.g. Abdul Basit"
				class="w-full bg-neutral-800 border border-neutral-700 text-white rounded-xl px-3 py-3 text-sm focus:outline-none focus:border-emerald-500"
			/>
		</div>

		<!-- Verse range -->
		<div class="space-y-2">
			<p class="text-xs font-semibold text-neutral-400 uppercase tracking-wider">Verse Range</p>

			<div class="bg-neutral-800 rounded-2xl p-4 space-y-4">
				<!-- Start -->
				<div>
					<p class="text-xs text-neutral-500 mb-2">From</p>
					<div class="flex gap-2">
						<div class="flex-1">
							<label class="text-xs text-neutral-400" for="surah-start">Surah</label>
							<select
								id="surah-start"
								bind:value={surahStart}
								class="w-full mt-1 bg-neutral-700 text-white rounded-lg px-2 py-2 text-sm border border-neutral-600"
							>
								{#each surahList as s}
									<option value={s.id}>{s.name}</option>
								{/each}
							</select>
						</div>
						<div class="w-24">
							<label class="text-xs text-neutral-400" for="ayah-start">Ayah</label>
							<input
								id="ayah-start"
								type="number"
								bind:value={ayahStart}
								min={1}
								max={maxAyahStart}
								class="w-full mt-1 bg-neutral-700 text-white rounded-lg px-2 py-2 text-sm border border-neutral-600"
							/>
						</div>
					</div>
				</div>

				<!-- Divider -->
				<div class="border-t border-neutral-700"></div>

				<!-- End -->
				<div>
					<p class="text-xs text-neutral-500 mb-2">To</p>
					<div class="flex gap-2">
						<div class="flex-1">
							<label class="text-xs text-neutral-400" for="surah-end">Surah</label>
							<select
								id="surah-end"
								bind:value={surahEnd}
								class="w-full mt-1 bg-neutral-700 text-white rounded-lg px-2 py-2 text-sm border border-neutral-600"
							>
								{#each surahList as s}
									<option value={s.id}>{s.name}</option>
								{/each}
							</select>
						</div>
						<div class="w-24">
							<label class="text-xs text-neutral-400" for="ayah-end">Ayah</label>
							<input
								id="ayah-end"
								type="number"
								bind:value={ayahEnd}
								min={ayahStart}
								max={maxAyahEnd}
								class="w-full mt-1 bg-neutral-700 text-white rounded-lg px-2 py-2 text-sm border border-neutral-600"
							/>
						</div>
					</div>
				</div>
			</div>
		</div>
	</div>

	<!-- CTA -->
	<div class="px-4 pb-safe pt-3 border-t border-neutral-800 bg-neutral-900">
		<button
			onclick={proceed}
			disabled={!canProceed || loading}
			class="w-full bg-emerald-600 disabled:bg-neutral-700 disabled:text-neutral-500 text-white font-semibold py-4 rounded-2xl text-sm active:scale-[0.98] transition-transform"
		>
			{loading ? 'Creating…' : 'Next: Record Audio'}
		</button>
	</div>
</div>
