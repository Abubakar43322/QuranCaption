import type { MobileProject } from './types';

export type MobileScreen = 'home' | 'new' | 'edit' | 'export';

class MobileState {
	projects: MobileProject[] = $state([]);
	currentProject: MobileProject | null = $state(null);
	screen: MobileScreen = $state('home');
	audioBlobUrl: string | null = $state(null);

	navigate(screen: MobileScreen) {
		this.screen = screen;
	}

	setProject(project: MobileProject) {
		if (this.audioBlobUrl) URL.revokeObjectURL(this.audioBlobUrl);
		this.audioBlobUrl = null;
		this.currentProject = project;
	}

	clearProject() {
		if (this.audioBlobUrl) URL.revokeObjectURL(this.audioBlobUrl);
		this.audioBlobUrl = null;
		this.currentProject = null;
		this.screen = 'home';
	}
}

export const mobileState = new MobileState();
