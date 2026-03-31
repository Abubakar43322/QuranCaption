/**
 * Mobile project persistence using IndexedDB.
 * Replaces the Tauri-based ProjectService for the mobile app.
 */

import type { MobileProject } from '../types';

const DB_NAME = 'qurancaption';
const DB_VERSION = 1;
const PROJECTS_STORE = 'projects';

function openDB(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const req = indexedDB.open(DB_NAME, DB_VERSION);
		req.onupgradeneeded = (e) => {
			const db = (e.target as IDBOpenDBRequest).result;
			if (!db.objectStoreNames.contains(PROJECTS_STORE)) {
				const store = db.createObjectStore(PROJECTS_STORE, { keyPath: 'id' });
				store.createIndex('updatedAt', 'updatedAt', { unique: false });
			}
		};
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error);
	});
}

export const MobileProjectService = {
	async save(project: MobileProject): Promise<void> {
		const db = await openDB();
		return new Promise((resolve, reject) => {
			const tx = db.transaction(PROJECTS_STORE, 'readwrite');
			tx.objectStore(PROJECTS_STORE).put({ ...project, updatedAt: Date.now() });
			tx.oncomplete = () => resolve();
			tx.onerror = () => reject(tx.error);
		});
	},

	async load(id: string): Promise<MobileProject | null> {
		const db = await openDB();
		return new Promise((resolve, reject) => {
			const req = db.transaction(PROJECTS_STORE, 'readonly').objectStore(PROJECTS_STORE).get(id);
			req.onsuccess = () => resolve(req.result ?? null);
			req.onerror = () => reject(req.error);
		});
	},

	async listAll(): Promise<MobileProject[]> {
		const db = await openDB();
		return new Promise((resolve, reject) => {
			const req = db.transaction(PROJECTS_STORE, 'readonly').objectStore(PROJECTS_STORE).getAll();
			req.onsuccess = () => {
				const projects: MobileProject[] = req.result;
				projects.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
				resolve(projects);
			};
			req.onerror = () => reject(req.error);
		});
	},

	async delete(id: string): Promise<void> {
		const db = await openDB();
		return new Promise((resolve, reject) => {
			const tx = db.transaction(PROJECTS_STORE, 'readwrite');
			tx.objectStore(PROJECTS_STORE).delete(id);
			tx.oncomplete = () => resolve();
			tx.onerror = () => reject(tx.error);
		});
	}
};
