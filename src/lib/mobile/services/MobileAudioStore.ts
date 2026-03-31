/**
 * Stores large audio/video blobs in a separate IndexedDB object store.
 * Keeps project metadata lean while allowing large media assets.
 */

const DB_NAME = 'qurancaption';
const DB_VERSION = 1;
const ASSETS_STORE = 'assets';

function openDB(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const req = indexedDB.open(DB_NAME, DB_VERSION);
		req.onupgradeneeded = (e) => {
			const db = (e.target as IDBOpenDBRequest).result;
			if (!db.objectStoreNames.contains(ASSETS_STORE)) {
				db.createObjectStore(ASSETS_STORE, { keyPath: 'key' });
			}
		};
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error);
	});
}

export const MobileAudioStore = {
	async save(key: string, blob: Blob): Promise<void> {
		const db = await openDB();
		return new Promise((resolve, reject) => {
			const tx = db.transaction(ASSETS_STORE, 'readwrite');
			tx.objectStore(ASSETS_STORE).put({ key, blob });
			tx.oncomplete = () => resolve();
			tx.onerror = () => reject(tx.error);
		});
	},

	async load(key: string): Promise<Blob | null> {
		const db = await openDB();
		return new Promise((resolve, reject) => {
			const req = db.transaction(ASSETS_STORE, 'readonly').objectStore(ASSETS_STORE).get(key);
			req.onsuccess = () => resolve(req.result?.blob ?? null);
			req.onerror = () => reject(req.error);
		});
	},

	async delete(key: string): Promise<void> {
		const db = await openDB();
		return new Promise((resolve, reject) => {
			const tx = db.transaction(ASSETS_STORE, 'readwrite');
			tx.objectStore(ASSETS_STORE).delete(key);
			tx.oncomplete = () => resolve();
			tx.onerror = () => reject(tx.error);
		});
	},

	/** Returns a blob: URL for the stored asset. Caller must call URL.revokeObjectURL when done. */
	async getBlobUrl(key: string): Promise<string | null> {
		const blob = await this.load(key);
		if (!blob) return null;
		return URL.createObjectURL(blob);
	}
};
