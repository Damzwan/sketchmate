import { ActiveSelection, type Canvas } from "fabric";
import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { useDrawEventManager } from "@/draw/canvas/drawEventManager";
import { useDrawObjectManager } from "@/draw/canvas/drawObjectManager";
import {
	centerObjectInViewport,
	precalculateAndSetViewport,
} from "@/draw/canvas/viewport";
import {
	listNativeDraftMetadata,
	nativeDraftMirrorAvailable,
	nativeDraftMirrorHasOwner,
	queueNativeDraftMirror,
	readNativeDraft,
	removeNativeDraft,
} from "@/draw/document/nativeDraftMirror";
import {
	documentJsonToBlob,
	enlivenObjectsTimeSlivered,
	generateChunkedJSON,
	migrateLegacyOrigin,
} from "@/draw/document/serialization";
import { useLayersStore } from "@/draw/layers/layers.store";
import { recordPhase } from "@/draw/rendering/renderMetrics";
import { useDrawSyncer } from "@/draw/sync/session.store";
import { EventBus } from "@/main";
import { uuidv4 } from "@/utils/uuid";

/**
 * Local idle helper.
 *
 * Deliberately NOT `whenIdle` from general.helper: that module transitively
 * pulls the router, firebase and the auth store, and the draw module keeps them
 * out of its import graph (see renderQuality.config for the same reasoning).
 * The timeout guarantees it still runs on a device that never reports idle.
 */
function afterIdle(run: () => void, timeout: number): void {
	const requestIdle = (globalThis as any).requestIdleCallback;
	if (typeof requestIdle === "function") requestIdle(() => run(), { timeout });
	else setTimeout(run, Math.min(timeout, 1_500));
}

export interface DrawingDraft {
	id: string;
	json: any;
	updatedAt: number;
	thumbnail: string;
}

export type DrawingDraftMetadata = Omit<DrawingDraft, "json">;

/**
 * A draft whose save is in-flight. Surfaced reactively so the UI can render
 * a pending placeholder and disable interaction until the IDB write lands.
 */
export interface PendingDraft {
	id: string;
	updatedAt: number;
	thumbnail: string;
	promise: Promise<void>;
}

/**
 * Detached JSON snapshot. Serializing directly avoids keeping a second Fabric
 * scene alive while IndexedDB finishes writing the draft.
 */
interface CanvasSnapshot {
	draftId: string;
	json: any;
	jsonBlob?: Blob;
	thumbnail: string;
}

const DRAFT_THUMBNAIL_MAX_SIZE = 640;
const DRAFT_THUMBNAIL_QUALITY = 0.72;

export const useDocumentStore = defineStore("drawDocument", () => {
	const { actionWithoutEvents } = useDrawEventManager();

	// --- Database Config ---
	const db = ref<IDBDatabase | undefined>();
	const dbName = "canvasDB";
	const objectStoreName = "canvasHistory";
	const metadataStoreName = "canvasMetadata";
	const recoveryStoreName = "canvasRecovery";

	// --- Reactive State ---
	const currentDraftId = ref<string | undefined>();
	const isSaving = ref(false);
	const isDirty = ref(false);

	// Reactive "this session has drawable content", so the autosave chip can stay
	// visible from the first stroke onward. hasContent() reads the live canvas and
	// is not reactive, so the UI can't watch it directly.
	const sessionHasContent = ref(false);

	// Timestamp of the last successful persist — surfaced so the UI can show
	// "saved N seconds ago" and reason about manual-save throttling.
	const lastSavedAt = ref<number | undefined>();

	// Anti-spam floor for the user-triggered "Save now" button.
	let lastManualSaveAt = 0;
	const MANUAL_SAVE_COOLDOWN_MS = 3000;

	// FIX: Track if the current session was loaded from a pre-existing local draft
	const isPreExistingDraft = ref(false);

	const pendingDrafts = ref<Map<string, PendingDraft>>(new Map());

	// Ids hidden from draft lists the moment they're sent/discarded, so the UI
	// (home MyDrafts) drops them instantly instead of waiting for the async IDB
	// delete + a re-fetch. The actual delete still happens in removeDraft.
	const removedDraftIds = ref<Set<string>>(new Set());

	function markDraftRemoved(id: string) {
		if (removedDraftIds.value.has(id)) return;
		removedDraftIds.value.add(id);
		removedDraftIds.value = new Set(removedDraftIds.value);
	}

	// --- Internal non-reactive refs ---
	let activeCanvas: Canvas | undefined;
	let saveInterval: ReturnType<typeof setInterval> | undefined;
	let autosaveQuietTimer: ReturnType<typeof setTimeout> | undefined;
	let liveAbortController: AbortController | undefined;
	let lastDirtyAt = 0;
	let dirtyRevision = 0;
	let storagePersistenceRequested = false;
	let nativeReconciliationDone = false;
	let dbInitPromise: Promise<void> | undefined;

	const SAVE_INTERVAL_MS = 20000;
	const AUTOSAVE_QUIET_MS = 1500;
	const saveEvents = ["undo", "redo", "add_to_undo_stack"];

	// ==========================================
	// 💾 DATABASE
	// ==========================================
	async function initDB() {
		if (db.value) {
			await reconcileNativeDrafts();
			return;
		}
		if (!dbInitPromise) {
			dbInitPromise = initializeDB().finally(() => {
				dbInitPromise = undefined;
			});
		}
		await dbInitPromise;
	}

	async function initializeDB() {
		requestPersistentStorage();

		const open = () =>
			new Promise<IDBDatabase>((resolve, reject) => {
				const request = indexedDB.open(dbName, 4);
				request.onupgradeneeded = (event) => {
					const localDb = (event.target as IDBOpenDBRequest).result;
					const transaction = (event.target as IDBOpenDBRequest).transaction!;
					const drafts = localDb.objectStoreNames.contains(objectStoreName)
						? transaction.objectStore(objectStoreName)
						: localDb.createObjectStore(objectStoreName, { keyPath: "id" });
					const metadata = localDb.objectStoreNames.contains(metadataStoreName)
						? transaction.objectStore(metadataStoreName)
						: localDb.createObjectStore(metadataStoreName, { keyPath: "id" });
					if (!localDb.objectStoreNames.contains(recoveryStoreName)) {
						// One previous committed revision per draft. This is intentionally a
						// separate store so a bad/partial new snapshot never overwrites the
						// only readable copy.
						localDb.createObjectStore(recoveryStoreName, { keyPath: "id" });
					}

					// Version 2 stored list metadata beside the potentially huge JSON blob.
					// Backfill the new lightweight store inside the upgrade transaction; the
					// original draft store is deliberately preserved.
					if ((event as IDBVersionChangeEvent).oldVersion < 3) {
						const cursor = drafts.openCursor();
						cursor.onsuccess = () => {
							const row = cursor.result;
							if (!row) return;
							const draft = row.value as DrawingDraft;
							metadata.put({
								id: draft.id,
								updatedAt: draft.updatedAt,
								thumbnail: draft.thumbnail || "",
							} satisfies DrawingDraftMetadata);
							row.continue();
						};
					}
				};
				request.onsuccess = (e) => {
					const opened = (e.target as IDBOpenDBRequest).result;
					opened.onversionchange = () => opened.close();
					resolve(opened);
				};
				request.onerror = () =>
					reject(request.error ?? new Error("Error opening IndexedDB"));
				request.onblocked = () =>
					reject(new Error("Draft storage upgrade is blocked by another tab"));
			});

		const database = await open();
		validateSchema(database);
		db.value = database;
		await reconcileNativeDrafts();
	}

	function validateSchema(db: IDBDatabase): void {
		const tx = db.transaction(
			[objectStoreName, metadataStoreName, recoveryStoreName],
			"readonly",
		);
		const store = tx.objectStore(objectStoreName);
		const metadata = tx.objectStore(metadataStoreName);
		const recovery = tx.objectStore(recoveryStoreName);
		if (
			store.keyPath !== "id" ||
			metadata.keyPath !== "id" ||
			recovery.keyPath !== "id"
		) {
			// Never delete a database merely because its shape is unexpected. The
			// old behaviour tried to rebuild it here, permanently erasing every
			// draft. Preserve the bytes so a later migration/support export can
			// recover them and fail this save explicitly.
			db.close();
			throw new Error(
				"Unsupported draft storage schema; existing data preserved",
			);
		}
	}

	function requestPersistentStorage(): void {
		if (storagePersistenceRequested) return;
		storagePersistenceRequested = true;
		const persist = navigator.storage?.persist;
		if (typeof persist !== "function") return;
		void persist
			.call(navigator.storage)
			.catch((error) =>
				console.warn("Could not request persistent draft storage:", error),
			);
	}

	async function reconcileNativeDrafts(): Promise<void> {
		if (nativeReconciliationDone) return;
		if (!nativeDraftMirrorAvailable()) {
			nativeReconciliationDone = true;
			return;
		}
		if (!(await nativeDraftMirrorHasOwner())) return;
		nativeReconciliationDone = true;
		try {
			const metadata = await listNativeDraftMetadata();
			const nativeUpdatedAt = new Map(
				metadata.map((item) => [item.id, item.updatedAt]),
			);
			for (const item of metadata) {
				const existing = await readStoredDraft(objectStoreName, item.id);
				if (existing) continue;
				const native = await readNativeDraft(item.id);
				if (!native) continue;
				await putRecoveredDraft({
					id: native.id,
					json: native.json,
					updatedAt: native.updatedAt,
					thumbnail: native.thumbnail,
				});
			}
			afterIdle(() => void backfillNativeDrafts(nativeUpdatedAt), 5_000);
		} catch (error) {
			console.warn("Native draft reconciliation failed:", error);
		}
	}

	async function backfillNativeDrafts(
		nativeUpdatedAt: Map<string, number>,
	): Promise<void> {
		if (!db.value) return;
		try {
			const drafts = await new Promise<DrawingDraft[]>((resolve, reject) => {
				const request = db
					.value!.transaction([objectStoreName], "readonly")
					.objectStore(objectStoreName)
					.getAll();
				request.onsuccess = () => resolve(request.result ?? []);
				request.onerror = () => reject(request.error);
			});
			for (const draft of drafts) {
				if ((nativeUpdatedAt.get(draft.id) ?? 0) >= draft.updatedAt) continue;
				queueNativeDraftMirror(draft);
			}
		} catch (error) {
			console.warn("Native draft backfill failed:", error);
		}
	}

	async function putRecoveredDraft(draft: DrawingDraft): Promise<void> {
		if (!db.value) return;
		const tx = db.value.transaction(
			[objectStoreName, metadataStoreName],
			"readwrite",
		);
		tx.objectStore(objectStoreName).put(draft);
		tx.objectStore(metadataStoreName).put({
			id: draft.id,
			updatedAt: draft.updatedAt,
			thumbnail: draft.thumbnail,
		} satisfies DrawingDraftMetadata);
		await new Promise<void>((resolve, reject) => {
			tx.oncomplete = () => resolve();
			tx.onerror = () => reject(tx.error);
			tx.onabort = () => reject(tx.error ?? new Error("Draft restore aborted"));
		});
	}

	// ==========================================
	// 📥 LOAD
	// ==========================================
	async function loadCanvas(
		c: Canvas,
		options: {
			isLobby: boolean;
			draftId?: string;
			canvasUrl?: string;
			json?: any;
			signal?: AbortSignal;
		},
	) {
		const { signal } = options;
		const throwIfAborted = () => {
			if (signal?.aborted)
				throw new DOMException("Canvas load aborted", "AbortError");
		};
		throwIfAborted();
		const finalId = options.draftId || currentDraftId.value || uuidv4();
		currentDraftId.value = finalId;

		// Reset draft lineage tracking flag for the new workspace lifecycle
		isPreExistingDraft.value = false;

		let json: any = null;
		let isExternalLoad = false;

		try {
			if (options.json) {
				json = options.json;
				isExternalLoad = true;
			} else if (options.canvasUrl) {
				const response = await fetch(options.canvasUrl, { signal });
				if (!response.ok) throw new Error("Failed to fetch remote canvas");
				const isGzipped =
					options.canvasUrl.endsWith(".gz") ||
					options.canvasUrl.endsWith(".gzip");
				if (isGzipped) {
					const ds = new DecompressionStream("gzip");
					const decompressedStream = response.body?.pipeThrough(ds);
					json = await new Response(decompressedStream).json();
				} else {
					json = await response.json();
				}
				throwIfAborted();
				isExternalLoad = true;
			} else if (!options.isLobby && options.draftId) {
				await initDB();
				throwIfAborted();
				const draft = await getDraft(options.draftId);
				throwIfAborted();
				if (draft) {
					json =
						draft.json instanceof Blob
							? JSON.parse(await draft.json.text())
							: typeof draft.json === "string"
								? JSON.parse(draft.json)
								: draft.json;
					// FIX: Flag that this draft exists in IndexedDB storage
					isPreExistingDraft.value = true;
				}
			}

			// BEFORE any object reaches the canvas: `injectMetadata` stamps the
			// active layer onto anything arriving without a `layerId` (every
			// pre-layers drawing), and the spatial index resolves layer ranks
			// through the registry. Both must already reflect this document.
			useLayersStore().init({
				isLobby: options.isLobby,
				isPublicLobby: useDrawSyncer().isPublicLobby,
				persisted: json?.layers ?? null,
			});

			if (json) {
				if (json.objects && json.objects.length > 0) {
					json.objects = json.objects.map(migrateLegacyOrigin);
					precalculateAndSetViewport(c, json.objects);
					sessionHasContent.value = true;
				}

				if (json.version === "5.5.2") {
					delete json.width;
					delete json.height;
					json.objects = json.objects?.filter(
						(obj: any) => obj.id !== "boundary",
					);
				}

				await actionWithoutEvents(async () => {
					c.clear();
					if (json.objects && json.objects.length > 0) {
						await enlivenObjectsTimeSlivered(
							json.objects,
							(obj) => {
								c.add(obj);
							},
							signal,
						);
						throwIfAborted();
					}

					if (json.version === "5.5.2" && c.getObjects().length > 0) {
						const selection = new ActiveSelection(c.getObjects(), {
							canvas: c,
						});
						centerObjectInViewport(c, selection);
						selection.removeAll();
						selection.dispose();
					}
				});
				c.backgroundColor = json.background;
			}

			if (!options.isLobby) {
				startAutosave(c, finalId);
				if (isExternalLoad && hasContent()) {
					markAsDirty();
					// DEFERRED, not inline. An external load has just enlivened the whole
					// scene, rebuilt the spatial index and warmed the overview; kicking a
					// full snapshot off in the same breath means re-serializing every
					// object while the first bake is still trying to run. On a 7,000-object
					// drawing that is the difference between "opens, then settles" and
					// "opens, then fights itself for several seconds".
					//
					// The draft is already marked dirty, so the autosave interval is a
					// correct backstop if this idle callback never fires.
					afterIdle(() => {
						if (currentDraftId.value === finalId) void performLiveSave();
					}, 5_000);
				}
			}
		} catch (error) {
			if (!(error instanceof DOMException && error.name === "AbortError"))
				console.error("❌ loadCanvas Failed:", error);
			throw error;
		} finally {
			if (!isExternalLoad) isDirty.value = false;
		}
	}

	async function detachCanvasSnapshot(
		draftId: string,
		signal?: AbortSignal,
	): Promise<CanvasSnapshot | null> {
		if (!activeCanvas) return null;
		const liveObjects = activeCanvas.getObjects();
		if (liveObjects.length === 0) return null;

		// Persistence is detached incrementally. Thumbnail generation uses the
		// engine's existing low-resolution overview and never consumes this JSON.
		const json = await generateChunkedJSON(activeCanvas, signal);
		if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
		return { draftId, json, thumbnail: "" };
	}

	function overviewThumbnail(signal?: AbortSignal): Promise<string> {
		if (signal?.aborted)
			return Promise.reject(new DOMException("Aborted", "AbortError"));
		// createDraftThumbnailBlob copies the overview before returning its promise.
		// That matters on exit: the render engine may be destroyed while WebP
		// encoding continues against the private 640px canvas.
		return useDrawObjectManager()
			.createDraftThumbnailBlob(
				DRAFT_THUMBNAIL_MAX_SIZE,
				DRAFT_THUMBNAIL_QUALITY,
			)
			.then((blob) => (blob ? blobToDataUrl(blob, signal) : ""));
	}

	function blobToDataUrl(blob: Blob, signal?: AbortSignal): Promise<string> {
		return new Promise((resolve, reject) => {
			const reader = new FileReader();
			const abort = () => {
				reader.abort();
				reject(new DOMException("Aborted", "AbortError"));
			};
			if (signal?.aborted) return abort();
			signal?.addEventListener("abort", abort, { once: true });
			reader.onerror = () => {
				signal?.removeEventListener("abort", abort);
				reject(reader.error ?? new Error("Could not read thumbnail"));
			};
			reader.onloadend = () => {
				signal?.removeEventListener("abort", abort);
				resolve(typeof reader.result === "string" ? reader.result : "");
			};
			reader.readAsDataURL(blob);
		});
	}

	async function snapshotCanvas(
		draftId: string,
		signal?: AbortSignal,
	): Promise<CanvasSnapshot | null> {
		// Start with the lightweight overview copy. Its pixels are captured
		// synchronously, before JSON serialization yields back to the app.
		const thumbnailPromise = overviewThumbnail(signal).catch((error) => {
			// Serialization owns cancellation for the save as a whole. Swallowing a
			// thumbnail-only abort here also prevents an unhandled rejection if JSON
			// detachment notices the same abort first and exits before Promise.all.
			if (!(error instanceof DOMException && error.name === "AbortError"))
				console.warn("Draft thumbnail generation failed:", error);
			return "";
		});
		const detached = await detachCanvasSnapshot(draftId, signal);
		if (!detached || !activeCanvas) return null;

		const [thumbnail, jsonBlob] = await Promise.all([
			thumbnailPromise,
			documentJsonToBlob(detached.json, signal),
		]);
		if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

		return {
			draftId,
			json: detached.json,
			jsonBlob,
			thumbnail,
		};
	}

	async function runSave(
		snapshot: CanvasSnapshot,
		signal: AbortSignal,
	): Promise<void> {
		await initDB();
		if (!db.value) throw new Error("DB not available");
		if (signal.aborted) throw new DOMException("Aborted", "AbortError");

		const draft: DrawingDraft = {
			id: snapshot.draftId,
			// ALWAYS the Blob. `put` structured-clones its value synchronously, and
			// a Blob is cloned by reference while a plain document object is cloned
			// field by field — the difference between a free write and a multi-second
			// main-thread stall on a large drawing. `snapshotCanvas` guarantees this
			// is set; the fallback is kept only so a future caller building a
			// snapshot by hand degrades in behaviour rather than crashing.
			json: snapshot.jsonBlob ?? snapshot.json,
			thumbnail: snapshot.thumbnail,
			updatedAt: Date.now(),
		};
		const transaction = db.value.transaction(
			[objectStoreName, metadataStoreName, recoveryStoreName],
			"readwrite",
		);
		await new Promise<void>((resolve, reject) => {
			const dispatchStartedAt = performance.now();
			const drafts = transaction.objectStore(objectStoreName);
			const previousRequest = drafts.get(draft.id);
			previousRequest.onsuccess = () => {
				const previous = previousRequest.result as DrawingDraft | undefined;
				if (previous) {
					transaction.objectStore(recoveryStoreName).put(previous);
				}
				drafts.put(draft);
				transaction.objectStore(metadataStoreName).put({
					id: draft.id,
					updatedAt: draft.updatedAt,
					thumbnail: draft.thumbnail,
				} satisfies DrawingDraftMetadata);
			};
			recordPhase(
				"draftPersistDispatch",
				performance.now() - dispatchStartedAt,
			);
			transaction.oncomplete = () => resolve();
			transaction.onerror = () =>
				reject(transaction.error ?? previousRequest.error);
			transaction.onabort = () =>
				reject(transaction.error ?? new Error("Draft save aborted"));
		});
		queueNativeDraftMirror(draft);
	}

	async function performLiveSave() {
		if (
			!activeCanvas ||
			!currentDraftId.value ||
			!isDirty.value ||
			!hasContent()
		) {
			return;
		}
		if (liveAbortController) liveAbortController.abort();
		liveAbortController = new AbortController();
		const signal = liveAbortController.signal;
		const revisionAtStart = dirtyRevision;

		try {
			isSaving.value = true;
			const snapshot = await snapshotCanvas(currentDraftId.value, signal); // Added signal
			if (!snapshot || signal.aborted) return;
			await runSave(snapshot, signal);
			if (signal.aborted) return;
			// Edits can land while JSON/thumbnail/IDB work is in flight. Only mark
			// clean if this save includes the latest dirty revision; otherwise the
			// next quiet save must persist those newer edits.
			if (dirtyRevision === revisionAtStart) isDirty.value = false;
			lastSavedAt.value = Date.now();
		} catch (error: any) {
			if (error.name !== "AbortError") console.error("🔥 Save Error:", error);
		} finally {
			// Only the save that still owns the controller clears the flag. If this
			// save was superseded (e.g. a manual "Save now" tapped while autosave was
			// mid-flight, or vice-versa), the newer save now owns the controller and
			// is still running — flipping isSaving off here would flicker the UI to
			// "saved" while a write is in progress.
			if (liveAbortController?.signal === signal) isSaving.value = false;
		}
	}

	/**
	 * User-triggered immediate save. Returns a status so the UI can give
	 * feedback. Throttled so mashing the button can't spam IndexedDB writes;
	 * no-ops when already saving or when there's nothing new to persist.
	 */
	async function saveNow(): Promise<"saved" | "clean" | "busy" | "cooldown"> {
		if (isSaving.value) return "busy";
		if (!isDirty.value) return "clean";
		const now = Date.now();
		if (now - lastManualSaveAt < MANUAL_SAVE_COOLDOWN_MS) return "cooldown";
		lastManualSaveAt = now;
		await performLiveSave();
		return "saved";
	}

	function init(c: Canvas) {
		activeCanvas = c;
		EventBus.off("room:joining", stopAutosave);
		EventBus.on("room:joining", stopAutosave);
	}

	function startAutosave(_canvas: Canvas, drawingId: string) {
		currentDraftId.value = drawingId;
		saveEvents.forEach((event) => EventBus.off(event, markAsDirty));
		saveEvents.forEach((e) => EventBus.on(e, markAsDirty));
		if (saveInterval) clearInterval(saveInterval);
		saveInterval = setInterval(() => {
			if (isDirty.value) saveWhenQuiet();
		}, SAVE_INTERVAL_MS);
	}

	function stopAutosave() {
		saveEvents.forEach((e) => EventBus.off(e, markAsDirty));
		if (saveInterval) clearInterval(saveInterval);
		if (autosaveQuietTimer) clearTimeout(autosaveQuietTimer);
		saveInterval = undefined;
		autosaveQuietTimer = undefined;
		if (liveAbortController) liveAbortController.abort();
	}

	const markAsDirty = () => {
		isDirty.value = true;
		sessionHasContent.value = true;
		lastDirtyAt = Date.now();
		dirtyRevision += 1;
		// Start the debounce on the first edit instead of waiting up to 20 seconds
		// for the safety interval. Continuous drawing keeps pushing lastDirtyAt;
		// the snapshot begins once the canvas has actually been quiet.
		saveWhenQuiet();
	};

	function saveWhenQuiet() {
		if (!isDirty.value || autosaveQuietTimer) return;
		const wait = Math.max(0, lastDirtyAt + AUTOSAVE_QUIET_MS - Date.now());
		if (wait > 0) {
			autosaveQuietTimer = setTimeout(() => {
				autosaveQuietTimer = undefined;
				saveWhenQuiet();
			}, wait);
			return;
		}
		void performLiveSave();
	}

	async function queueBackgroundSave(
		draftId: string,
		detachBeforeThumbnail = false,
	): Promise<PendingDraft | null> {
		if (!hasContent()) return null;

		if (liveAbortController) liveAbortController.abort();

		const ctrl = new AbortController();
		// Capture overview pixels before detaching/disposing the draw engine. The
		// returned promise encodes a private 640px copy, so navigation can continue
		// without keeping either the engine or a second Fabric scene alive.
		const exitThumbnailPromise = detachBeforeThumbnail
			? overviewThumbnail(ctrl.signal).catch((error) => {
					if (!(error instanceof DOMException && error.name === "AbortError")) {
						console.warn("Draft thumbnail generation failed:", error);
					}
					return "";
				})
			: undefined;

		const snapshot = detachBeforeThumbnail
			? await detachCanvasSnapshot(draftId, ctrl.signal)
			: await snapshotCanvas(draftId, ctrl.signal);
		if (!snapshot) return null;

		const thumbnailPromise =
			exitThumbnailPromise ?? Promise.resolve(snapshot.thumbnail);

		// On exit, build the Blob in the yielded background chain before touching
		// IndexedDB. Passing the raw document object to put() would synchronously
		// structured-clone all objects on the WebView main thread.
		const promise = Promise.all([
			detachBeforeThumbnail
				? documentJsonToBlob(snapshot.json, ctrl.signal)
				: Promise.resolve(snapshot.jsonBlob),
			thumbnailPromise,
		])
			.then(([jsonBlob, thumbnail]) =>
				runSave({ ...snapshot, jsonBlob, thumbnail }, ctrl.signal),
			)
			.catch((e) => {
				if (e.name !== "AbortError")
					console.error("🔥 Background save failed:", e);
			})
			.finally(() => {
				pendingDrafts.value.delete(draftId);
				pendingDrafts.value = new Map(pendingDrafts.value);
			});

		const pending: PendingDraft = {
			id: draftId,
			updatedAt: Date.now(),
			thumbnail: snapshot.thumbnail,
			promise,
		};
		pendingDrafts.value.set(draftId, pending);
		pendingDrafts.value = new Map(pendingDrafts.value);
		return pending;
	}

	const exitWithBackgroundSave = async (): Promise<PendingDraft | null> => {
		if (!currentDraftId.value) currentDraftId.value = uuidv4();
		if (!hasContent()) return null;
		// queueBackgroundSave resolves after detaching an immutable JSON snapshot.
		// Blob conversion and IndexedDB persistence continue independently, so the
		// UI can navigate immediately without the live canvas being disposed early.
		return await queueBackgroundSave(currentDraftId.value, true);
	};

	async function awaitPendingSaves(): Promise<void> {
		const promises = Array.from(pendingDrafts.value.values()).map(
			(p) => p.promise,
		);
		if (promises.length === 0) return;
		await Promise.allSettled(promises);
	}

	async function getDraft(id: string): Promise<DrawingDraft | undefined> {
		await initDB();
		const primary = await readStoredDraft(objectStoreName, id);
		const readablePrimary = await makeDraftReadable(primary);
		if (readablePrimary) return readablePrimary;

		const recovery = await readStoredDraft(recoveryStoreName, id);
		const readableRecovery = await makeDraftReadable(recovery);
		if (readableRecovery) {
			console.warn(`[drafts] Restored previous local revision for ${id}`);
			return readableRecovery;
		}

		const native = await readNativeDraft(id);
		const readableNative = await makeDraftReadable(
			native
				? {
						id: native.id,
						json: native.json,
						updatedAt: native.updatedAt,
						thumbnail: native.thumbnail,
					}
				: undefined,
		);
		if (readableNative) {
			await putRecoveredDraft(readableNative);
			console.warn(`[drafts] Restored native filesystem copy for ${id}`);
			return readableNative;
		}
		return undefined;
	}

	function readStoredDraft(
		storeName: string,
		id: string,
	): Promise<DrawingDraft | undefined> {
		return new Promise((resolve, reject) => {
			const req = db
				.value!.transaction([storeName], "readonly")
				.objectStore(storeName)
				.get(id);
			req.onsuccess = () => resolve(req.result as DrawingDraft | undefined);
			req.onerror = () => reject(req.error);
		});
	}

	async function makeDraftReadable(
		draft: DrawingDraft | undefined,
	): Promise<DrawingDraft | undefined> {
		if (!draft) return undefined;
		try {
			const json =
				draft.json instanceof Blob
					? JSON.parse(await draft.json.text())
					: typeof draft.json === "string"
						? JSON.parse(draft.json)
						: draft.json;
			if (!json || typeof json !== "object") return undefined;
			return { ...draft, json };
		} catch (error) {
			console.warn(`[drafts] Unreadable local revision ${draft.id}:`, error);
			return undefined;
		}
	}

	async function removeDraft(id?: string): Promise<void> {
		const targetId = id || currentDraftId.value;
		if (!targetId) return;

		markDraftRemoved(targetId);

		const pending = pendingDrafts.value.get(targetId);
		if (pending) {
			pendingDrafts.value.delete(targetId);
			pendingDrafts.value = new Map(pendingDrafts.value);
			try {
				await pending.promise;
			} catch {
				/* ignore */
			}
		}

		await initDB();
		const tx = db.value!.transaction(
			[objectStoreName, metadataStoreName, recoveryStoreName],
			"readwrite",
		);
		tx.objectStore(objectStoreName).delete(targetId);
		tx.objectStore(metadataStoreName).delete(targetId);
		tx.objectStore(recoveryStoreName).delete(targetId);
		await new Promise((resolve, reject) => {
			tx.oncomplete = () => resolve(null);
			tx.onerror = () => reject(tx.error);
		});
		await removeNativeDraft(targetId);
	}

	async function getAllDrafts(): Promise<DrawingDraft[]> {
		await initDB();
		return new Promise((resolve) => {
			const req = db
				.value!.transaction([objectStoreName], "readonly")
				.objectStore(objectStoreName)
				.getAll();
			req.onsuccess = (e) => resolve((e.target as IDBRequest).result || []);
		});
	}

	async function getAllDraftMetadata(): Promise<DrawingDraftMetadata[]> {
		await initDB();
		return new Promise((resolve, reject) => {
			const req = db
				.value!.transaction([metadataStoreName], "readonly")
				.objectStore(metadataStoreName)
				.getAll();
			req.onsuccess = (e) => resolve((e.target as IDBRequest).result || []);
			req.onerror = () => reject(req.error);
		});
	}

	function disposeSession(): void {
		stopAutosave();
		activeCanvas = undefined;
		currentDraftId.value = undefined;
		isSaving.value = false;
		isDirty.value = false;
		sessionHasContent.value = false;
		isPreExistingDraft.value = false;
		lastSavedAt.value = undefined;
		lastManualSaveAt = 0;
		lastDirtyAt = 0;
		dirtyRevision = 0;
		liveAbortController = undefined;
	}

	function hasContent(): boolean {
		if (!activeCanvas) return false;
		return activeCanvas.getObjects().length > 0;
	}

	function resetToNewDraft() {
		currentDraftId.value = uuidv4();
		isDirty.value = false;
		isSaving.value = false;
		isPreExistingDraft.value = false;
		sessionHasContent.value = false;
		dirtyRevision = 0;
	}

	const pendingDraftsList = computed<DrawingDraftMetadata[]>(() => {
		return Array.from(pendingDrafts.value.values()).map((p) => ({
			id: p.id,
			thumbnail: p.thumbnail,
			updatedAt: p.updatedAt,
		}));
	});

	return {
		currentDraftId,
		isSaving,
		isDirty,
		sessionHasContent,
		lastSavedAt,
		saveNow,
		isPreExistingDraft, // Exported to be consumed by DrawExitGuard.vue
		pendingDrafts,
		pendingDraftsList,
		removedDraftIds,
		markDraftRemoved,
		loadCanvas,
		startAutosave,
		stopAutosave,
		exitWithBackgroundSave,
		awaitPendingSaves,
		getDraft,
		removeDraft,
		getAllDrafts,
		getAllDraftMetadata,
		hasContent,
		init,
		resetToNewDraft,
		disposeSession,
	};
});
