<script lang="ts">
	import { mobileState } from '../state.svelte';
	import { MobileProjectService } from '../services/MobileProjectService';
	import { MobileAudioStore } from '../services/MobileAudioStore';
	import { DEFAULT_TEXT_STYLE, type MobileBackground, type MobileTextStyle, type MobileProject } from '../types';

	let project = $derived(mobileState.currentProject!);
	let bg: MobileBackground = $state({ type: 'color', color: '#0f172a' });
	let style: MobileTextStyle = $state({ ...DEFAULT_TEXT_STYLE });
	let activeTab: 'background' | 'text' = $state('background');
	let videoBgUrl: string | null = $state(null);
	let imageBgUrl: string | null = $state(null);

	// Init from project
	$effect(() => {
		if (project) {
			bg = { ...project.background };
			style = { ...project.textStyle };
			if (bg.type === 'video' && bg.assetKey) {
				MobileAudioStore.getBlobUrl(bg.assetKey).then((url) => { videoBgUrl = url; });
			}
			if (bg.type === 'image' && bg.assetKey) {
				MobileAudioStore.getBlobUrl(bg.assetKey).then((url) => { imageBgUrl = url; });
			}
		}
	});

	async function pickImage() {
		const input = document.createElement('input');
		input.type = 'file';
		input.accept = 'image/*';
		input.onchange = async () => {
			const file = input.files?.[0];
			if (!file) return;
			const key = `bg_img_${project.id}`;
			await MobileAudioStore.save(key, file);
			if (imageBgUrl) URL.revokeObjectURL(imageBgUrl);
			imageBgUrl = URL.createObjectURL(file);
			bg = { type: 'image', assetKey: key };
		};
		input.click();
	}

	async function pickVideo() {
		const input = document.createElement('input');
		input.type = 'file';
		input.accept = 'video/*';
		input.onchange = async () => {
			const file = input.files?.[0];
			if (!file) return;
			const key = `bg_vid_${project.id}`;
			await MobileAudioStore.save(key, file);
			if (videoBgUrl) URL.revokeObjectURL(videoBgUrl);
			videoBgUrl = URL.createObjectURL(file);
			bg = { type: 'video', assetKey: key };
		};
		input.click();
	}

	// Live preview text
	const previewText = $derived(project?.clips?.[0]?.text ?? 'بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ');

	const previewBgStyle = $derived(() => {
		if (bg.type === 'color') return `background: ${bg.color}`;
		if (bg.type === 'gradient') return `background: linear-gradient(180deg, ${bg.color}, ${bg.color2 ?? '#000'})`;
		return 'background: #0f172a';
	});

	const textContainerStyle = $derived(
		`font-family: "${style.fontFamily}", serif; font-size: ${style.fontSize / 2}px; color: ${style.textColor};` +
		(style.backgroundEnabled ? `background: ${style.backgroundColor}${Math.round(style.backgroundOpacity * 255).toString(16).padStart(2, '0')}; padding: 4px 8px; border-radius: 6px;` : '') +
		(style.glowEnabled ? `text-shadow: 0 0 12px ${style.glowColor};` : '')
	);

	async function save() {
		const updated: MobileProject = { ...project, background: { ...bg }, textStyle: { ...style } };
		await MobileProjectService.save(updated);
		mobileState.setProject(updated);
		mobileState.navigate('export');
	}

	const fonts = ['QPC1', 'QPC2', 'Hafs'] as const;
	const positions = ['top', 'center', 'bottom'] as const;
	const presets = [
		{ label: 'Dark', color: '#0f172a' },
		{ label: 'Black', color: '#000000' },
		{ label: 'Navy', color: '#0a1628' },
		{ label: 'Forest', color: '#0d1f0d' },
		{ label: 'Purple', color: '#1a0d2e' },
		{ label: 'Teal', color: '#0d1f1f' }
	];
</script>

<div class="flex flex-col h-full">
	<!-- Header -->
	<div class="flex items-center gap-3 px-4 pt-safe pb-3 bg-neutral-900 border-b border-neutral-800">
		<button onclick={() => mobileState.navigate('timeline')} class="text-neutral-400 p-1">
			<span class="material-icons">arrow_back</span>
		</button>
		<h1 class="text-base font-bold">Style</h1>
	</div>

	<!-- Live preview (9:16 aspect ratio thumbnail) -->
	<div class="flex justify-center px-4 py-3 bg-neutral-950">
		<div
			class="relative overflow-hidden rounded-xl border border-neutral-700"
			style="width: 100px; height: 177px; {previewBgStyle()}"
		>
			{#if bg.type === 'image' && imageBgUrl}
				<img src={imageBgUrl} alt="bg" class="absolute inset-0 w-full h-full object-cover" />
			{:else if bg.type === 'video' && videoBgUrl}
				<video src={videoBgUrl} class="absolute inset-0 w-full h-full object-cover" muted autoplay loop playsinline></video>
			{/if}
			<div
				class="absolute flex items-end justify-center w-full pb-2 px-1"
				style="
					{style.position === 'bottom' ? 'bottom: 0;' : ''}
					{style.position === 'center' ? 'top: 50%; transform: translateY(-50%); align-items: center;' : ''}
					{style.position === 'top' ? 'top: 0; align-items: flex-start; padding-top: 8px;' : ''}
				"
			>
				<p
					class="text-center leading-tight"
					dir="rtl"
					style={textContainerStyle}
				>
					{previewText.slice(0, 30)}
				</p>
			</div>
		</div>
	</div>

	<!-- Tabs -->
	<div class="flex border-b border-neutral-800">
		{#each (['background', 'text'] as const) as tab}
			<button
				onclick={() => (activeTab = tab)}
				class="flex-1 py-2.5 text-sm font-semibold capitalize
					{activeTab === tab ? 'text-emerald-400 border-b-2 border-emerald-400' : 'text-neutral-500'}"
			>
				{tab}
			</button>
		{/each}
	</div>

	<div class="flex-1 overflow-y-auto px-4 py-4 space-y-4">
		{#if activeTab === 'background'}
			<!-- Background type selector -->
			<div class="flex gap-2">
				{#each (['color', 'gradient', 'image', 'video'] as const) as t}
					<button
						onclick={() => (bg = { ...bg, type: t })}
						class="flex-1 py-2 text-xs rounded-xl border font-semibold capitalize
							{bg.type === t ? 'bg-emerald-700 border-emerald-600 text-white' : 'bg-neutral-800 border-neutral-700 text-neutral-400'}"
					>
						{t}
					</button>
				{/each}
			</div>

			{#if bg.type === 'color'}
				<div class="space-y-2">
					<p class="text-xs text-neutral-400 font-semibold uppercase">Color Presets</p>
					<div class="flex flex-wrap gap-2">
						{#each presets as p}
							<button
								onclick={() => (bg = { type: 'color', color: p.color })}
								class="w-10 h-10 rounded-xl border-2 transition-all
									{bg.color === p.color ? 'border-white scale-110' : 'border-transparent'}"
								style="background: {p.color}"
								title={p.label}
							></button>
						{/each}
					</div>
					<div class="flex items-center gap-3 mt-2">
						<label class="text-xs text-neutral-400">Custom</label>
						<input
							type="color"
							bind:value={bg.color}
							class="w-10 h-8 rounded border-0 bg-transparent cursor-pointer"
						/>
						<span class="text-xs font-mono text-neutral-400">{bg.color}</span>
					</div>
				</div>

			{:else if bg.type === 'gradient'}
				<div class="space-y-3">
					<div class="flex items-center gap-3">
						<label class="text-xs text-neutral-400 w-16">Top color</label>
						<input type="color" bind:value={bg.color} class="w-10 h-8 rounded border-0 cursor-pointer" />
						<span class="text-xs font-mono text-neutral-400">{bg.color}</span>
					</div>
					<div class="flex items-center gap-3">
						<label class="text-xs text-neutral-400 w-16">Bottom</label>
						<input type="color" bind:value={bg.color2} class="w-10 h-8 rounded border-0 cursor-pointer" />
						<span class="text-xs font-mono text-neutral-400">{bg.color2 ?? '#000000'}</span>
					</div>
				</div>

			{:else if bg.type === 'image'}
				<button
					onclick={pickImage}
					class="w-full py-4 rounded-2xl border-2 border-dashed border-neutral-600 text-neutral-400 flex items-center justify-center gap-2"
				>
					<span class="material-icons">image</span>
					<span class="text-sm">{bg.assetKey ? 'Change image' : 'Pick from device'}</span>
				</button>

			{:else if bg.type === 'video'}
				<button
					onclick={pickVideo}
					class="w-full py-4 rounded-2xl border-2 border-dashed border-neutral-600 text-neutral-400 flex items-center justify-center gap-2"
				>
					<span class="material-icons">videocam</span>
					<span class="text-sm">{bg.assetKey ? 'Change video' : 'Pick from device'}</span>
				</button>
			{/if}

		{:else}
			<!-- Text style -->

			<!-- Font family -->
			<div class="space-y-2">
				<p class="text-xs text-neutral-400 font-semibold uppercase">Font</p>
				<div class="flex gap-2">
					{#each fonts as font}
						<button
							onclick={() => (style = { ...style, fontFamily: font })}
							class="flex-1 py-2 text-sm rounded-xl border
								{style.fontFamily === font ? 'bg-emerald-700 border-emerald-600 text-white' : 'bg-neutral-800 border-neutral-700 text-neutral-400'}"
							style="font-family: '{font}', serif"
						>
							{font}
						</button>
					{/each}
				</div>
			</div>

			<!-- Font size -->
			<div class="space-y-2">
				<div class="flex justify-between">
					<p class="text-xs text-neutral-400 font-semibold uppercase">Font Size</p>
					<span class="text-xs text-neutral-400">{style.fontSize}px</span>
				</div>
				<input type="range" bind:value={style.fontSize} min={24} max={96} step={2}
					class="w-full accent-emerald-500" />
			</div>

			<!-- Text color -->
			<div class="flex items-center gap-3">
				<p class="text-xs text-neutral-400 font-semibold uppercase flex-1">Text Color</p>
				<input type="color" bind:value={style.textColor} class="w-10 h-8 rounded border-0 cursor-pointer" />
				<span class="text-xs font-mono text-neutral-400">{style.textColor}</span>
			</div>

			<!-- Position -->
			<div class="space-y-2">
				<p class="text-xs text-neutral-400 font-semibold uppercase">Position</p>
				<div class="flex gap-2">
					{#each positions as pos}
						<button
							onclick={() => (style = { ...style, position: pos })}
							class="flex-1 py-2 text-xs rounded-xl border capitalize
								{style.position === pos ? 'bg-emerald-700 border-emerald-600 text-white' : 'bg-neutral-800 border-neutral-700 text-neutral-400'}"
						>
							{pos}
						</button>
					{/each}
				</div>
			</div>

			<!-- Background pill -->
			<div class="bg-neutral-800 rounded-2xl p-4 space-y-3">
				<div class="flex items-center justify-between">
					<p class="text-sm text-white">Text Background</p>
					<button
						onclick={() => (style = { ...style, backgroundEnabled: !style.backgroundEnabled })}
						class="w-10 h-5 rounded-full transition-colors {style.backgroundEnabled ? 'bg-emerald-500' : 'bg-neutral-600'} relative"
					>
						<span class="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all
							{style.backgroundEnabled ? 'left-5' : 'left-0.5'}"></span>
					</button>
				</div>
				{#if style.backgroundEnabled}
					<div class="flex items-center gap-3">
						<label class="text-xs text-neutral-400 flex-1">Color</label>
						<input type="color" bind:value={style.backgroundColor} class="w-10 h-8 rounded border-0 cursor-pointer" />
					</div>
					<div class="space-y-1">
						<div class="flex justify-between">
							<label class="text-xs text-neutral-400">Opacity</label>
							<span class="text-xs text-neutral-400">{Math.round(style.backgroundOpacity * 100)}%</span>
						</div>
						<input type="range" bind:value={style.backgroundOpacity} min={0} max={1} step={0.05}
							class="w-full accent-emerald-500" />
					</div>
				{/if}
			</div>

			<!-- Glow -->
			<div class="bg-neutral-800 rounded-2xl p-4 space-y-3">
				<div class="flex items-center justify-between">
					<p class="text-sm text-white">Text Glow</p>
					<button
						onclick={() => (style = { ...style, glowEnabled: !style.glowEnabled })}
						class="w-10 h-5 rounded-full transition-colors {style.glowEnabled ? 'bg-emerald-500' : 'bg-neutral-600'} relative"
					>
						<span class="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all
							{style.glowEnabled ? 'left-5' : 'left-0.5'}"></span>
					</button>
				</div>
				{#if style.glowEnabled}
					<div class="flex items-center gap-3">
						<label class="text-xs text-neutral-400 flex-1">Glow Color</label>
						<input type="color" bind:value={style.glowColor} class="w-10 h-8 rounded border-0 cursor-pointer" />
					</div>
				{/if}
			</div>
		{/if}
	</div>

	<!-- CTA -->
	<div class="px-4 pb-safe pt-3 border-t border-neutral-800 bg-neutral-900">
		<button
			onclick={save}
			class="w-full bg-emerald-600 text-white font-semibold py-4 rounded-2xl text-sm active:scale-[0.98] transition-transform"
		>
			Next: Export
		</button>
	</div>
</div>
