/**
 * Exports a MobileProject to an MP4 video using ffmpeg.wasm.
 *
 * Output: 1080x1920 (9:16), libx264 ultrafast, aac 192k, max 3 minutes.
 *
 * Pipeline:
 *  1. Write audio to ffmpeg virtual FS
 *  2. For each subtitle clip, render a transparent PNG overlay to canvas, write to ffmpeg FS
 *  3. Build an ffconcat manifest for the subtitle PNG sequence
 *  4. Run FFmpeg filter graph:
 *     background [color/image/video] → scale 1080x1920
 *     subtitle PNGs → overlay at timed positions
 *     audio → aac encode
 *  5. Return the output MP4 as a Blob
 */

import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';
import type { MobileProject, MobileSubtitleClip, MobileTextStyle, MobileBackground } from '../types';
import { MobileAudioStore } from './MobileAudioStore';

export type ExportProgressCallback = (progress: number, message: string) => void;

const W = 1080;
const H = 1920;
const FPS = 30;

let ffmpegInstance: FFmpeg | null = null;

async function getFFmpeg(): Promise<FFmpeg> {
	if (ffmpegInstance && ffmpegInstance.loaded) return ffmpegInstance;
	ffmpegInstance = new FFmpeg();
	await ffmpegInstance.load();
	return ffmpegInstance;
}

// ─── Canvas subtitle renderer ─────────────────────────────────────────────────

function renderSubtitleFrame(
	clip: MobileSubtitleClip,
	style: MobileTextStyle,
	width: number,
	height: number
): Blob {
	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	const ctx = canvas.getContext('2d')!;

	// Clear to transparent
	ctx.clearRect(0, 0, width, height);

	const fontSize = style.fontSize;
	ctx.font = `${fontSize}px "${style.fontFamily}", serif`;
	ctx.textAlign = 'center';
	ctx.direction = 'rtl';

	const text = clip.text;
	const maxWidth = width - 80;

	// Measure text for wrapping
	const words = text.split(' ');
	const lines: string[] = [];
	let current = '';
	for (const word of words) {
		const test = current ? `${current} ${word}` : word;
		if (ctx.measureText(test).width > maxWidth && current) {
			lines.push(current);
			current = word;
		} else {
			current = test;
		}
	}
	if (current) lines.push(current);

	const lineHeight = fontSize * 1.4;
	const totalTextHeight = lines.length * lineHeight;
	const padding = 16;

	let blockY: number;
	if (style.position === 'bottom') blockY = height - totalTextHeight - padding * 3;
	else if (style.position === 'top') blockY = padding * 2;
	else blockY = (height - totalTextHeight) / 2;

	// Background pill
	if (style.backgroundEnabled) {
		const pillW = Math.max(...lines.map((l) => ctx.measureText(l).width)) + padding * 2;
		const pillH = totalTextHeight + padding;
		const pillX = (width - pillW) / 2;
		ctx.save();
		ctx.globalAlpha = style.backgroundOpacity;
		ctx.fillStyle = style.backgroundColor;
		ctx.beginPath();
		ctx.roundRect(pillX, blockY - padding / 2, pillW, pillH, 12);
		ctx.fill();
		ctx.restore();
	}

	// Glow
	if (style.glowEnabled) {
		ctx.shadowColor = style.glowColor;
		ctx.shadowBlur = 18;
	}

	// Text
	ctx.fillStyle = style.textColor;
	for (let i = 0; i < lines.length; i++) {
		ctx.fillText(lines[i], width / 2, blockY + i * lineHeight + fontSize);
	}

	// Convert to PNG blob synchronously via toDataURL
	const dataUrl = canvas.toDataURL('image/png');
	const byteString = atob(dataUrl.split(',')[1]);
	const ab = new ArrayBuffer(byteString.length);
	const ia = new Uint8Array(ab);
	for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
	return new Blob([ab], { type: 'image/png' });
}

// ─── Main export function ─────────────────────────────────────────────────────

export async function exportProject(
	project: MobileProject,
	onProgress: ExportProgressCallback
): Promise<Blob> {
	onProgress(0, 'Loading FFmpeg…');
	const ff = await getFFmpeg();

	ff.on('progress', ({ progress }) => {
		onProgress(0.1 + progress * 0.8, `Encoding… ${Math.round(progress * 100)}%`);
	});

	onProgress(0.05, 'Loading audio…');

	// 1. Write audio
	const audioBlob = await MobileAudioStore.load(project.audioKey);
	if (!audioBlob) throw new Error('Audio asset not found');
	await ff.writeFile('audio.webm', await fetchFile(audioBlob));

	// 2. Render subtitle PNGs
	onProgress(0.08, 'Rendering subtitle frames…');
	const clips = project.clips;
	for (let i = 0; i < clips.length; i++) {
		const png = renderSubtitleFrame(clips[i], project.textStyle, W, H);
		await ff.writeFile(`sub_${i}.png`, await fetchFile(png));
	}

	// 3. Build background inputs & filter graph
	const bgType = project.background.type;
	const ffArgs: string[] = [];
	let bgInputIdx = 0;
	let bgFilter = '';

	if (bgType === 'color') {
		const color = (project.background.color ?? '#0f172a').replace('#', '');
		ffArgs.push('-f', 'lavfi', '-i', `color=c=#${color}:s=${W}x${H}:r=${FPS}`);
		bgFilter = `[0:v]scale=${W}:${H},setsar=1[bg]`;
	} else if (bgType === 'gradient') {
		// Approximate gradient with drawbox — or just use color for MVP
		const color = (project.background.color ?? '#0f172a').replace('#', '');
		ffArgs.push('-f', 'lavfi', '-i', `color=c=#${color}:s=${W}x${H}:r=${FPS}`);
		bgFilter = `[0:v]scale=${W}:${H},setsar=1[bg]`;
	} else if (bgType === 'image' && project.background.assetKey) {
		const imgBlob = await MobileAudioStore.load(project.background.assetKey);
		if (imgBlob) {
			await ff.writeFile('bg_img', await fetchFile(imgBlob));
			ffArgs.push('-loop', '1', '-i', 'bg_img');
			bgFilter = `[0:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1[bg]`;
		}
	} else if (bgType === 'video' && project.background.assetKey) {
		const vidBlob = await MobileAudioStore.load(project.background.assetKey);
		if (vidBlob) {
			await ff.writeFile('bg_vid', await fetchFile(vidBlob));
			ffArgs.push('-stream_loop', '-1', '-i', 'bg_vid');
			bgFilter = `[0:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1[bg]`;
		}
	}

	// Audio input
	const audioInputIdx = ffArgs.filter((a) => a === '-i').length;
	ffArgs.push('-i', 'audio.webm');

	// Subtitle PNG inputs + overlay filter chain
	const subInputStart = audioInputIdx + 1;
	for (let i = 0; i < clips.length; i++) {
		ffArgs.push('-i', `sub_${i}.png`);
	}

	// Build overlay filter chain
	// Each subtitle PNG is overlaid during its time window using 'enable' expression
	const durationSec = project.durationMs / 1000;
	let filterComplex = bgFilter + ';\n';

	let prevLabel = 'bg';
	for (let i = 0; i < clips.length; i++) {
		const startSec = clips[i].startMs / 1000;
		const endSec = clips[i].endMs / 1000;
		const inputIdx = subInputStart + i;
		const outLabel = i < clips.length - 1 ? `v${i}` : 'vout';
		filterComplex +=
			`[${prevLabel}][${inputIdx}:v]overlay=x=0:y=0:enable='between(t,${startSec.toFixed(3)},${endSec.toFixed(3)})'[${outLabel}];\n`;
		prevLabel = outLabel;
	}

	if (clips.length === 0) {
		filterComplex += `[bg]copy[vout];\n`;
	}

	// Audio trim
	filterComplex += `[${audioInputIdx}:a]atrim=0:${durationSec.toFixed(3)},asetpts=PTS-STARTPTS[aout]`;

	onProgress(0.1, 'Starting encode…');

	const outputName = 'output.mp4';
	ffArgs.push(
		'-filter_complex', filterComplex,
		'-map', '[vout]',
		'-map', '[aout]',
		'-c:v', 'libx264',
		'-preset', 'ultrafast',
		'-crf', '28',
		'-c:a', 'aac',
		'-b:a', '192k',
		'-t', durationSec.toFixed(3),
		'-movflags', '+faststart',
		'-pix_fmt', 'yuv420p',
		outputName
	);

	await ff.exec(ffArgs);

	onProgress(0.92, 'Packaging output…');
	const data = await ff.readFile(outputName);
	const outputBlob = new Blob([data], { type: 'video/mp4' });

	// Cleanup
	await ff.deleteFile(outputName);
	await ff.deleteFile('audio.webm');
	for (let i = 0; i < clips.length; i++) {
		await ff.deleteFile(`sub_${i}.png`).catch(() => {});
	}

	onProgress(1, 'Done!');
	return outputBlob;
}
