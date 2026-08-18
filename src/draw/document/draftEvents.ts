/**
 * Dependency-free notification seam between draft persistence and anything that
 * wants to react to it (today: cloud sync).
 *
 * Deliberately NOT the app-wide `EventBus` from `@/main`: subscribers live in
 * the service layer and pull firebase/auth, and the draw module keeps those out
 * of its import graph. Listeners register into this module; the draw side only
 * ever calls the notify functions, so the arrow never points back at the app.
 */

type DraftPersistedListener = (id: string, updatedAt: number) => void;
type DraftDeletedListener = (id: string) => void;
type DrawSessionListener = (active: boolean) => void;

const persistedListeners = new Set<DraftPersistedListener>();
const deletedListeners = new Set<DraftDeletedListener>();
const sessionListeners = new Set<DrawSessionListener>();

/**
 * True while a canvas is live. Read as "the main thread belongs to drawing":
 * anything expensive and deferrable — compressing and uploading a whole
 * document, above all — has no business running in that window on the low-end
 * Android WebViews this app has to stay smooth on.
 */
let drawSessionActive = false;

export function isDrawSessionActive(): boolean {
	return drawSessionActive;
}

export function onDrawSessionChanged(
	listener: DrawSessionListener,
): () => void {
	sessionListeners.add(listener);
	return () => sessionListeners.delete(listener);
}

export function notifyDrawSession(active: boolean): void {
	if (drawSessionActive === active) return;
	drawSessionActive = active;
	for (const listener of sessionListeners) {
		try {
			listener(active);
		} catch (error) {
			console.warn("[drafts] draw session listener failed:", error);
		}
	}
}

export function onDraftPersisted(listener: DraftPersistedListener): () => void {
	persistedListeners.add(listener);
	return () => persistedListeners.delete(listener);
}

export function onDraftDeleted(listener: DraftDeletedListener): () => void {
	deletedListeners.add(listener);
	return () => deletedListeners.delete(listener);
}

export function notifyDraftSaved(id: string, updatedAt: number): void {
	for (const listener of persistedListeners) {
		try {
			listener(id, updatedAt);
		} catch (error) {
			console.warn("[drafts] persisted listener failed:", error);
		}
	}
}

export function notifyDraftDeleted(id: string): void {
	for (const listener of deletedListeners) {
		try {
			listener(id);
		} catch (error) {
			console.warn("[drafts] deleted listener failed:", error);
		}
	}
}
