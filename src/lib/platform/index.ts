/**
 * Platform detection utility.
 * Determines whether the app is running in a Capacitor (mobile) or Tauri (desktop) context.
 */

export function isMobilePlatform(): boolean {
	if (typeof window === 'undefined') return false;
	// Capacitor injects this global
	return !!(window as unknown as Record<string, unknown>)['Capacitor'];
}

export function isDesktopPlatform(): boolean {
	return !isMobilePlatform();
}
