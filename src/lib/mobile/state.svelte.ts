/**
 * Global reactive state for the mobile app.
 * Uses Svelte 5 runes ($state) — intentionally separate from the desktop GlobalState.
 */

import type { MobileProject } from './types';

export type MobileScreen =
	| 'home'
	| 'create'
	| 'record'
	| 'detect'
	| 'timeline'
	| 'style'
	| 'export';

class MobileState {
	/** List of project summaries shown on the home screen */
	projects: MobileProject[] = $state([]);

	/** The project currently being edited */
	currentProject: MobileProject | null = $state(null);

	/** Which screen is visible */
	screen: MobileScreen = $state('home');

	/** Blob URL for the current project's audio (revoked when project changes) */
	audioBlobUrl: string | null = $state(null);

	/** Whether the Tarteel WASM model is currently loading */
	tarteelLoading: boolean = $state(false);

	/** Tarteel model load progress 0–1 */
	tarteelProgress: number = $state(0);

	navigate(screen: MobileScreen) {
		this.screen = screen;
	}

	setProject(project: MobileProject) {
		if (this.audioBlobUrl) {
			URL.revokeObjectURL(this.audioBlobUrl);
			this.audioBlobUrl = null;
		}
		this.currentProject = project;
	}

	clearProject() {
		if (this.audioBlobUrl) {
			URL.revokeObjectURL(this.audioBlobUrl);
			this.audioBlobUrl = null;
		}
		this.currentProject = null;
		this.screen = 'home';
	}
}

export const mobileState = new MobileState();
