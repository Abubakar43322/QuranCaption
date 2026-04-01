<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { Quran } from '$lib/classes/Quran';
	import { mobileState } from '../state.svelte';
	import { MobileProjectService } from '../services/MobileProjectService';
	import { MobileAudioStore } from '../services/MobileAudioStore';
	import { generateId, DEFAULT_TEXT_STYLE, MAX_DURATION_MS, type MobileProject, type MobileSubtitleClip } from '../types';

	let surahList: { id: number; name: string; totalAyah: number }[] = $state([]);
	let surah = $state(1);
	let ayahStart = $state(1);
	let ayahEnd = $state(7);

	// Recording state
	type RecordState = 'idle' | 'recording' | 'done';
	let recordState: RecordState = $state('idle');
	let elapsedMs = $state(0);
	let audioBlob: Blob | null = $state(null);
	let audioBlobUrl: string | null = $state(null);
	let errorMsg: string | null = $state(null);
	let saving = $state(false);

	let mediaRecorder: MediaRecorder | null = null;
	let chunks: Blob[] = [];
	let timerInterval: number | null = null;

	onMount(async () => {
		await Quran.load();
		surahList = Quran.getSurahs().map((s) => ({
			id: s.id,
			name: `${s.id}. ${s.name}`,
			totalAyah: s.totalAyah
		}));
	});

	onDestroy(cleanup);

	function cleanup() {
		if (timerInterval) clearInterval(timerInterval);
		if (mediaRecorder?.state === 'recording') mediaRecorder.stop();
	}

	const maxAyah = $derived(surahList.find((s) => s.id === surah)?.totalAyah ?? 286);
	$effect(() => { if (ayahEnd > maxAyah) ayahEnd = maxAyah; });
	$effect(() => { if (ayahStart > maxAyah) ayahStart = 1; });
	$effect(() => { if (ayahEnd < ayahStart) ayahEnd = ayahStart; });

	const elapsed = $derived({
		m: Math.floor(elapsedMs / 60000),
		s: Math.floor((elapsedMs % 60000) / 1000),
		pct: (elapsedMs / MAX_DURATION_MS) * 100
	});

	async function startRecording() {
		try {
			errorMsg = null;
			chunks = [];
			const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
			mediaRecorder = new MediaRecorder(stream);
			mediaRecorder.ondataavailable = (e) => chunks.push(e.data);
			mediaRecorder.onstop = () => {
				stream.getTracks().forEach((t) => t.stop());
				audioBlob = new Blob(chunks, { type: 'audio/webm' });
				if (audioBlobUrl) URL.revokeObjectURL(audioBlobUrl);
				audioBlobUrl = URL.createObjectURL(audioBlob);
				recordState = 'done';
			};
			mediaRecorder.start(250);
			const startTime = Date.now();
			recordState = 'recording';
			timerInterval = window.setInterval(() => {
				elapsedMs = Date.now() - startTime;
				if (elapsedMs >= MAX_DURATION_MS) stopRecording();
			}, 100);
		} catch {
			errorMsg = 'Microphone access denied.';
		}
	}

	function stopRecording() {
		if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
		mediaRecorder?.stop();
	}

	async function importAudio() {
		const input = document.createElement('input');
		input.type = 'file';
		input.accept = 'audio/*,video/*';
		input.onchange = async () => {
			const file = input.files?.[0];
			if (!file) return;
			// Get duration
			const url = URL.createObjectURL(file);
			const audio = new Audio(url);
			await new Promise<void>((res) => { audio.onloadedmetadata = () => res(); });
			const durationMs = Math.min(audio.duration * 1000, MAX_DURATION_MS);
			elapsedMs = durationMs;
			audioBlob = file;
			if (audioBlobUrl) URL.revokeObjectURL(audioBlobUrl);
			audioBlobUrl = url;
			recordState = 'done';
		};
		input.click();
	}

	async function startEditing() {
		if (!audioBlob || saving) return;
		saving = true;

		// Build one clip per ayah in the range
		const clips: MobileSubtitleClip[] = [];
		const totalAyahs = ayahEnd - ayahStart + 1;
		const msPerAyah = elapsedMs / totalAyahs;

		for (let i = 0; i < totalAyahs; i++) {
			const ayah = ayahStart + i;
			const verse = await Quran.getVerse(surah, ayah);
			const text = verse?.words.map((w) => w.arabic).join(' ') ?? '';
			clips.push({
				id: generateId(),
				startMs: Math.round(i * msPerAyah),
				endMs: Math.round((i + 1) * msPerAyah),
				surah,
				ayah,
				startWord: 0,
				endWord: (verse?.words.length ?? 1) - 1,
				text,
				confidence: null
			});
		}

		const audioKey = generateId();
		const project: MobileProject = {
			id: generateId(),
			name: `${surahList.find((s) => s.id === surah)?.name ?? 'Surah'} ${ayahStart}–${ayahEnd}`,
			reciter: '',
			createdAt: Date.now(),
			updatedAt: Date.now(),
			durationMs: elapsedMs,
			audioKey,
			surahStart: surah,
			ayahStart,
			surahEnd: surah,
			ayahEnd,
			clips,
			background: { type: 'color', color: '#0f172a' },
			textStyle: { ...DEFAULT_TEXT_STYLE },
			exportStatus: 'idle'
		};

		await MobileAudioStore.save(audioKey, audioBlob);
		await MobileProjectService.save(project);
		mobileState.projects = [project, ...mobileState.projects];
		mobileState.setProject(project);
		mobileState.audioBlobUrl = audioBlobUrl;
		mobileState.navigate('edit');
		saving = false;
	}
</script>

<div class="flex flex-col h-full">
	<!-- Header -->
	<div class="flex items-center gap-3 px-4 pt-4 pb-3 bg-neutral-900 border-b border-neutral-800">
		<button onclick={() => mobileState.navigate('home')} class="text-neutral-400 p-1">
			<span class="material-icons">arrow_back</span>
		</button>
		<h1 class="text-base font-bold">New Video</h1>
	</div>

	<div class="flex-1 overflow-y-auto px-4 py-5 space-y-6">
		<!-- Verse picker -->
		<div class="space-y-3">
			<p class="text-xs font-semibold text-neutral-400 uppercase tracking-wider">Surah & Verses</p>
			<select
				bind:value={surah}
				class="w-full bg-neutral-800 border border-neutral-700 text-white rounded-xl px-3 py-3 text-sm"
			>
				{#each surahList as s}
					<option value={s.id}>{s.name}</option>
				{/each}
			</select>
			<div class="flex gap-3">
				<div class="flex-1 space-y-1">
					<label class="text-xs text-neutral-400" for="from">From Ayah</label>
					<input id="from" type="number" bind:value={ayahStart} min={1} max={maxAyah}
						class="w-full bg-neutral-800 border border-neutral-700 text-white rounded-xl px-3 py-3 text-sm" />
				</div>
				<div class="flex-1 space-y-1">
					<label class="text-xs text-neutral-400" for="to">To Ayah</label>
					<input id="to" type="number" bind:value={ayahEnd} min={ayahStart} max={maxAyah}
						class="w-full bg-neutral-800 border border-neutral-700 text-white rounded-xl px-3 py-3 text-sm" />
				</div>
			</div>
		</div>

		<!-- Audio -->
		<div class="space-y-3">
			<p class="text-xs font-semibold text-neutral-400 uppercase tracking-wider">Recitation Audio</p>

			{#if recordState === 'idle'}
				<div class="flex gap-3">
					<button onclick={startRecording}
						class="flex-1 flex flex-col items-center gap-2 bg-emerald-600 text-white rounded-2xl py-6 active:scale-95 transition-transform">
						<span class="material-icons text-3xl">mic</span>
						<span class="text-sm font-semibold">Record</span>
					</button>
					<button onclick={importAudio}
						class="flex-1 flex flex-col items-center gap-2 bg-neutral-800 text-neutral-300 rounded-2xl py-6 active:scale-95 transition-transform">
						<span class="material-icons text-3xl">upload_file</span>
						<span class="text-sm font-semibold">Import</span>
					</button>
				</div>

			{:else if recordState === 'recording'}
				<div class="bg-neutral-800 rounded-2xl p-5 flex flex-col items-center gap-4">
					<div class="flex items-center gap-2">
						<span class="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
						<span class="text-lg font-mono font-bold text-white">
							{elapsed.m}:{elapsed.s.toString().padStart(2, '0')}
						</span>
						<span class="text-xs text-neutral-500">/ 3:00</span>
					</div>
					<div class="w-full h-1.5 bg-neutral-700 rounded-full overflow-hidden">
						<div class="h-full bg-red-500 transition-all" style="width: {elapsed.pct}%"></div>
					</div>
					<button onclick={stopRecording}
						class="bg-red-600 text-white font-semibold px-8 py-3 rounded-2xl active:scale-95 transition-transform">
						Stop Recording
					</button>
				</div>

			{:else}
				<div class="bg-neutral-800 rounded-2xl p-4 flex items-center gap-3">
					<span class="material-icons text-emerald-400">check_circle</span>
					<div class="flex-1">
						<p class="text-sm font-semibold text-white">Audio ready</p>
						<p class="text-xs text-neutral-400">
							{elapsed.m}:{elapsed.s.toString().padStart(2, '0')} recorded
						</p>
					</div>
					<button onclick={() => { recordState = 'idle'; audioBlob = null; }}
						class="text-xs text-neutral-500 border border-neutral-700 px-2 py-1 rounded-lg">
						Redo
					</button>
				</div>
				{#if audioBlobUrl}
					<audio controls src={audioBlobUrl} class="w-full rounded-xl" style="height:40px"></audio>
				{/if}
			{/if}

			{#if errorMsg}
				<p class="text-xs text-red-400">{errorMsg}</p>
			{/if}
		</div>
	</div>

	<!-- CTA -->
	<div class="px-4 pb-6 pt-3 border-t border-neutral-800 bg-neutral-900">
		<button
			onclick={startEditing}
			disabled={recordState !== 'done' || saving}
			class="w-full bg-emerald-600 disabled:bg-neutral-700 disabled:text-neutral-500 text-white font-semibold py-4 rounded-2xl text-sm active:scale-[0.98] transition-transform"
		>
			{saving ? 'Loading…' : 'Start Editing →'}
		</button>
	</div>
</div>
