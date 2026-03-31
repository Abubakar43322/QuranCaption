/**
 * Core data types for the QuranCaption mobile app.
 * These are intentionally independent of Tauri-coupled desktop classes.
 */

export type BackgroundType = 'color' | 'gradient' | 'image' | 'video';

export interface MobileBackground {
	type: BackgroundType;
	/** For color/gradient: CSS color string(s) */
	color?: string;
	color2?: string;
	/** For image/video: base64 data URL or blob URL stored in IDB */
	assetKey?: string;
}

export interface MobileSubtitleClip {
	id: string;
	startMs: number;
	endMs: number;
	surah: number;
	ayah: number;
	/** Start word index within the ayah (0 = beginning) */
	startWord: number;
	/** End word index within the ayah (inclusive) */
	endWord: number;
	/** Arabic text for this clip */
	text: string;
	/** Optional translation text */
	translation?: string;
	/** Confidence from Tarteel detection (0–1), null if manually placed */
	confidence: number | null;
}

export interface MobileTextStyle {
	fontFamily: 'QPC1' | 'QPC2' | 'Hafs';
	fontSize: number;
	textColor: string;
	position: 'top' | 'center' | 'bottom';
	backgroundEnabled: boolean;
	backgroundColor: string;
	backgroundOpacity: number;
	glowEnabled: boolean;
	glowColor: string;
}

export const DEFAULT_TEXT_STYLE: MobileTextStyle = {
	fontFamily: 'QPC2',
	fontSize: 52,
	textColor: '#FFFFFF',
	position: 'bottom',
	backgroundEnabled: true,
	backgroundColor: '#000000',
	backgroundOpacity: 0.5,
	glowEnabled: false,
	glowColor: '#FFFFFF'
};

export interface MobileProject {
	id: string;
	name: string;
	reciter: string;
	createdAt: number;
	updatedAt: number;
	/** Duration of the audio in ms (max 180_000) */
	durationMs: number;
	/** IDB key for the recorded/imported audio blob */
	audioKey: string;
	/** Surah + verse range */
	surahStart: number;
	ayahStart: number;
	surahEnd: number;
	ayahEnd: number;
	/** Detected/placed subtitle clips */
	clips: MobileSubtitleClip[];
	background: MobileBackground;
	textStyle: MobileTextStyle;
	/** Export status */
	exportStatus: 'idle' | 'exporting' | 'done' | 'error';
}

export const MAX_DURATION_MS = 180_000; // 3 minutes — Instagram Reels limit

/** Generate a simple unique ID */
export function generateId(): string {
	return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}
