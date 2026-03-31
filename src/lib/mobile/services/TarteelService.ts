/**
 * Wraps the offline-tarteel ONNX model for verse detection.
 * Model: 131 MB quantized ONNX (uint8), runs via onnxruntime-web (WASM backend).
 *
 * Detection strategy:
 *  1. Decode audio to Float32 PCM at 16 kHz mono
 *  2. Slice into 5-second non-overlapping chunks
 *  3. Run each chunk through the model
 *  4. Each result gives { surah, ayah, confidence }
 */

import * as ort from 'onnxruntime-web';
import { MobileAudioStore } from './MobileAudioStore';

const MODEL_STORE_KEY = '__tarteel_model__';
const MODEL_URL =
	'https://huggingface.co/yazinsai/offline-tarteel/resolve/main/model_uint8.onnx';

const SAMPLE_RATE = 16000;
const CHUNK_SECONDS = 5;
const N_MELS = 80;
const MEL_FRAMES = 500; // frames per 5 s chunk at 10 ms hop

export interface TarteelDetection {
	surah: number;
	ayah: number;
	confidence: number;
	chunkIndex: number;
}

type ProgressCallback = (loaded: number, total: number) => void;

let session: ort.InferenceSession | null = null;
let melFilterbank: Float32Array[] | null = null;

// ─── Model loading ──────────────────────────────────────────────────────────

async function fetchWithProgress(url: string, onProgress: ProgressCallback): Promise<ArrayBuffer> {
	const res = await fetch(url);
	if (!res.ok) throw new Error(`Failed to fetch model: ${res.statusText}`);
	const total = parseInt(res.headers.get('Content-Length') ?? '0', 10);
	const reader = res.body!.getReader();
	const chunks: Uint8Array[] = [];
	let loaded = 0;
	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		chunks.push(value);
		loaded += value.byteLength;
		onProgress(loaded, total || loaded);
	}
	const merged = new Uint8Array(loaded);
	let offset = 0;
	for (const chunk of chunks) {
		merged.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return merged.buffer;
}

export async function loadTarteelModel(onProgress?: ProgressCallback): Promise<void> {
	if (session) return;

	// Try cached model first
	let modelBuffer: ArrayBuffer | null = null;
	const cached = await MobileAudioStore.load(MODEL_STORE_KEY);
	if (cached) {
		modelBuffer = await cached.arrayBuffer();
	} else {
		modelBuffer = await fetchWithProgress(MODEL_URL, onProgress ?? (() => {}));
		await MobileAudioStore.save(MODEL_STORE_KEY, new Blob([modelBuffer]));
	}

	session = await ort.InferenceSession.create(modelBuffer, {
		executionProviders: ['wasm']
	});
}

export function isTarteelModelLoaded(): boolean {
	return session !== null;
}

// ─── Mel spectrogram (simplified triangular filterbank) ────────────────────

function buildMelFilterbank(sr: number, nFft: number, nMels: number): Float32Array[] {
	const fMin = 0;
	const fMax = sr / 2;
	const melMin = 2595 * Math.log10(1 + fMin / 700);
	const melMax = 2595 * Math.log10(1 + fMax / 700);
	const melPoints = Array.from({ length: nMels + 2 }, (_, i) => melMin + (i * (melMax - melMin)) / (nMels + 1));
	const hzPoints = melPoints.map((m) => 700 * (10 ** (m / 2595) - 1));
	const binPoints = hzPoints.map((f) => Math.floor(((nFft + 1) * f) / sr));
	const filters: Float32Array[] = [];
	for (let m = 1; m <= nMels; m++) {
		const filter = new Float32Array(Math.floor(nFft / 2) + 1);
		for (let k = binPoints[m - 1]; k < binPoints[m]; k++) {
			filter[k] = (k - binPoints[m - 1]) / (binPoints[m] - binPoints[m - 1]);
		}
		for (let k = binPoints[m]; k < binPoints[m + 1]; k++) {
			filter[k] = (binPoints[m + 1] - k) / (binPoints[m + 1] - binPoints[m]);
		}
		filters.push(filter);
	}
	return filters;
}

function getMelFilterbank(): Float32Array[] {
	if (!melFilterbank) {
		melFilterbank = buildMelFilterbank(SAMPLE_RATE, 512, N_MELS);
	}
	return melFilterbank;
}

function pcmToMelSpectrogram(pcm: Float32Array): Float32Array {
	const nFft = 512;
	const hopLen = Math.floor((SAMPLE_RATE * CHUNK_SECONDS) / MEL_FRAMES);
	const filters = getMelFilterbank();
	const numFrames = MEL_FRAMES;
	const result = new Float32Array(N_MELS * numFrames);
	const window = new Float32Array(nFft);
	for (let i = 0; i < nFft; i++) {
		window[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (nFft - 1))); // Hann
	}

	for (let t = 0; t < numFrames; t++) {
		const start = t * hopLen;
		const frame = new Float32Array(nFft);
		for (let i = 0; i < nFft; i++) {
			frame[i] = (pcm[start + i] ?? 0) * window[i];
		}
		// Simple DFT magnitude for first nFft/2+1 bins
		const mag = new Float32Array(Math.floor(nFft / 2) + 1);
		for (let k = 0; k <= nFft / 2; k++) {
			let re = 0;
			let im = 0;
			for (let n = 0; n < nFft; n++) {
				const angle = (2 * Math.PI * k * n) / nFft;
				re += frame[n] * Math.cos(angle);
				im -= frame[n] * Math.sin(angle);
			}
			mag[k] = Math.sqrt(re * re + im * im);
		}
		// Apply mel filterbank
		for (let m = 0; m < N_MELS; m++) {
			let energy = 0;
			for (let k = 0; k < mag.length; k++) {
				energy += mag[k] * filters[m][k];
			}
			result[m * numFrames + t] = Math.log(energy + 1e-6);
		}
	}
	return result;
}

// ─── Main detection function ────────────────────────────────────────────────

export async function detectVerses(
	audioBuffer: AudioBuffer,
	onChunk?: (detection: TarteelDetection) => void
): Promise<TarteelDetection[]> {
	if (!session) throw new Error('Tarteel model not loaded');

	// Downmix to mono Float32 at 16 kHz
	const rawPcm = audioBuffer.getChannelData(0);
	const srcRate = audioBuffer.sampleRate;
	const ratio = SAMPLE_RATE / srcRate;
	const outLen = Math.floor(rawPcm.length * ratio);
	const pcm = new Float32Array(outLen);
	for (let i = 0; i < outLen; i++) {
		pcm[i] = rawPcm[Math.floor(i / ratio)];
	}

	const chunkLen = SAMPLE_RATE * CHUNK_SECONDS;
	const numChunks = Math.ceil(pcm.length / chunkLen);
	const detections: TarteelDetection[] = [];

	for (let c = 0; c < numChunks; c++) {
		const chunk = pcm.slice(c * chunkLen, (c + 1) * chunkLen);
		const mel = pcmToMelSpectrogram(chunk);
		const inputTensor = new ort.Tensor('float32', mel, [1, N_MELS, MEL_FRAMES]);
		const feeds = { input: inputTensor };
		const output = await session.run(feeds);

		// Model output: logits over all (surah, ayah) pairs or a single verse prediction
		// offline-tarteel outputs 6236 classes (total ayahs in the Quran)
		const logits = output[Object.keys(output)[0]].data as Float32Array;
		const maxIdx = logits.indexOf(Math.max(...logits));
		const confidence = Math.exp(logits[maxIdx]) / logits.reduce((s, v) => s + Math.exp(v), 0);

		// Map flat index to surah/ayah using standard Quran verse count
		const { surah, ayah } = flatIndexToSurahAyah(maxIdx);
		const detection: TarteelDetection = { surah, ayah, confidence, chunkIndex: c };
		detections.push(detection);
		onChunk?.(detection);
	}

	return detections;
}

// ─── Quran index mapping ─────────────────────────────────────────────────────

/** Total ayahs per surah (114 surahs) */
const AYAH_COUNTS = [
	7, 286, 200, 176, 120, 165, 206, 75, 129, 109, 123, 111, 43, 52, 99, 128, 111, 110, 98, 135,
	112, 78, 118, 64, 77, 227, 93, 88, 69, 60, 34, 30, 73, 54, 45, 83, 182, 88, 75, 85, 54, 53,
	89, 59, 37, 35, 38, 29, 18, 45, 60, 49, 62, 55, 78, 96, 29, 22, 24, 13, 14, 11, 11, 18, 12,
	12, 30, 52, 52, 44, 28, 28, 20, 56, 40, 31, 50, 40, 46, 42, 29, 31, 36, 38, 23, 17, 19, 26,
	30, 20, 15, 21, 11, 8, 8, 19, 5, 8, 8, 11, 11, 8, 3, 9, 5, 4, 6, 5, 6, 5, 5, 3, 4, 5,
	4, 5, 3
];

function flatIndexToSurahAyah(index: number): { surah: number; ayah: number } {
	let remaining = index;
	for (let s = 0; s < AYAH_COUNTS.length; s++) {
		if (remaining < AYAH_COUNTS[s]) {
			return { surah: s + 1, ayah: remaining + 1 };
		}
		remaining -= AYAH_COUNTS[s];
	}
	return { surah: 114, ayah: 6 };
}
