export function isMobilePlatform(): boolean {
	if (typeof window === 'undefined') return false;
	// Real Capacitor app (Android/iOS)
	if (!!(window as unknown as Record<string, unknown>)['Capacitor']) return true;
	// Browser on a phone or narrow screen (e.g. Chrome DevTools mobile mode)
	return window.innerWidth <= 768;
}

export function isDesktopPlatform(): boolean {
	return !isMobilePlatform();
}
