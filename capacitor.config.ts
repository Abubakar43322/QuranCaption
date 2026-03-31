import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
	appId: 'io.qurancaption.app',
	appName: 'QuranCaption',
	webDir: 'build',
	server: {
		androidScheme: 'https'
	},
	android: {
		allowMixedContent: true,
		captureInput: true,
		webContentsDebuggingEnabled: true
	}
};

export default config;
