/**
 * Lightweight settings persistence for mobile using localStorage.
 */

const SETTINGS_KEY = 'qc_mobile_settings';

export interface MobileSettings {
	hasSeenOnboarding: boolean;
	tarteelModelDownloaded: boolean;
	defaultFontFamily: 'QPC1' | 'QPC2' | 'Hafs';
}

const DEFAULTS: MobileSettings = {
	hasSeenOnboarding: false,
	tarteelModelDownloaded: false,
	defaultFontFamily: 'QPC2'
};

export const MobileSettingsService = {
	load(): MobileSettings {
		try {
			const raw = localStorage.getItem(SETTINGS_KEY);
			if (!raw) return { ...DEFAULTS };
			return { ...DEFAULTS, ...JSON.parse(raw) };
		} catch {
			return { ...DEFAULTS };
		}
	},

	save(settings: Partial<MobileSettings>): void {
		const current = this.load();
		localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...current, ...settings }));
	},

	update<K extends keyof MobileSettings>(key: K, value: MobileSettings[K]): void {
		this.save({ [key]: value } as Partial<MobileSettings>);
	}
};
