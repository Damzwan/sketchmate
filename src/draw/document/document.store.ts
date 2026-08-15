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
	notifyDraftDeleted,
	notifyDraftSaved,
	notifyDrawSession,
} from "@/draw/document/draftEvents";
import { assertValidDraftStorageId } from "@/draw/document/draftStorageId";
import { renderDraftThumbnailInWorker } from "@/draw/document/draftThumbnailWorker";
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

/**
 * A draft's list preview, in one of three shapes:
 *
 *   • `Blob`   — a WebP produced by this device. The normal case.
 *   • `data:…` — a legacy base64 thumbnail from before Blobs were stored.
 *   • `https:…`— a CDN url for a draft that lives in the cloud and has not been
 *                downloaded here yet.
 *
 * Blobs are what the format is FOR. A base64 data URL is ~33% larger than the
 * bytes it encodes, is held as a JS string in a reactive array (a home screen
 * with 20 drafts carried about a megabyte of them), and costs a FileReader
 * encode on every save and a decode on every render. A Blob costs a reference.
 *
 * The two string shapes are read-compatible on purpose: old rows keep working
 * untouched, and `migrateLegacyThumbnails` converts them in the background.
 */
export type DraftThumbnail = Blob | string;

export interface DrawingDraft {
	id: string;
	json: any;
	updatedAt: number;
	thumbnail: DraftThumbnail;
}

export interface DrawingDraftMetadata extends Omit<DrawingDraft, "json"> {
	/**
	 * The newest revision of this draft is in the cloud and has not been
	 * downloaded to this device yet. The card is still listed — opening it
	 * hydrates first. Cleared by any local save.
	 */
	remote?: boolean;
}

/**
 * Per-draft cloud-sync bookkeeping. Kept in the draft database rather than in
 * the sync store's memory so a cold start knows what it already pushed and does
 * not re-upload every draft on the device.
 */
export interface DraftSyncState {
	id: string;
	/** The local `updatedAt` whose bytes are confirmed in the cloud. */
	pushedUpdatedAt: number;
	/**
	 * Local revision still owed to the cloud. Written atomically with the draft,
	 * so a killed process can reconstruct an interrupted upload on next launch.
	 */
	queuedUpdatedAt?: number;
	/** The server's `updated_at` for this draft. */
	remoteUpdatedAt: number;
	/**
	 * CDN url of the cloud document, kept only while the newest revision has NOT
	 * been downloaded here. Persisting it is what lets a cold start still open a
	 * cloud-only draft: the incremental pull will not re-list a draft that has
	 * not changed since the stored cursor.
	 */
	remoteDrawing?: string;
	remoteThumbnail?: string;
	/** Last refusal the server gave for this draft, if any (e.g. too large). */
	blockedCode?: string;
}

/**
 * A draft whose save is in-flight. Surfaced reactively so the UI can render
 * a pending placeholder and disable interaction until the IDB write lands.
 */
export interface PendingDraft {
	id: string;
	updatedAt: number;
	thumbnail: DraftThumbnail;
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
	thumbnail: DraftThumbnail;
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
	const syncStoreName = "draftSync";

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
	let legacyThumbnailsMigrated = false;
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
				const request = indexedDB.open(dbName, 5);
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
					if (!localDb.objectStoreNames.contains(syncStoreName)) {
						// Cloud-sync watermarks. Empty on first upgrade, which correctly
						// reads as "nothing has been pushed yet".
						localDb.createObjectStore(syncStoreName, { keyPath: "id" });
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
		afterIdle(() => void migrateLegacyThumbnails(), 10_000);
	}

	/**
	 * Convert base64 data-URL thumbnails written before Blobs were stored.
	 *
	 * Reading old rows works without this — the list handles both shapes — but
	 * without a rewrite an archive of old drafts would keep paying the string
	 * cost forever, since only a save produces the new format. This upgrades
	 * them once, at idle, and is then a no-op on every later launch.
	 *
	 * Metadata rows only. The document store's copy of the field is never read
	 * for display, so rewriting it would double the work to fix nothing.
	 */
	async function migrateLegacyThumbnails(): Promise<void> {
		if (legacyThumbnailsMigrated || !db.value) return;
		legacyThumbnailsMigrated = true;
		try {
			const metadata = await getAllDraftMetadata();
			const legacy = metadata.filter(
				(draft) =>
					typeof draft.thumbnail === "string" &&
					draft.thumbnail.startsWith("data:"),
			);
			if (legacy.length === 0) return;

			for (const draft of legacy) {
				// `fetch` decodes base64 in native code. Doing it one draft per idle
				// callback keeps a 40-draft library from becoming one long task.
				const blob = await fetch(draft.thumbnail as string)
					.then((response) => response.blob())
					.catch(() => null);
				if (!blob) continue;
				await putDraftMetadata({ ...draft, thumbnail: blob }).catch((error) =>
					console.warn(
						`[drafts] thumbnail migration failed for ${draft.id}:`,
						error,
					),
				);
				await new Promise((resolve) => afterIdle(() => resolve(null), 250));
			}
			console.info(`[drafts] migrated ${legacy.length} legacy thumbnail(s)`);
		} catch (error) {
			console.warn("[drafts] thumbnail migration failed:", error);
		}
	}

	async function putDraftMetadata(
		metadata: DrawingDraftMetadata,
	): Promise<void> {
		assertValidDraftStorageId(metadata.id);
		if (!db.value) return;
		const tx = db.value.transaction([metadataStoreName], "readwrite");
		tx.objectStore(metadataStoreName).put(metadata);
		await new Promise<void>((resolve, reject) => {
			tx.oncomplete = () => resolve();
			tx.onerror = () => reject(tx.error);
		});
	}

	function validateSchema(db: IDBDatabase): void {
		const tx = db.transaction(
			[objectStoreName, metadataStoreName, recoveryStoreName, syncStoreName],
			"readonly",
		);
		const store = tx.objectStore(objectStoreName);
		const metadata = tx.objectStore(metadataStoreName);
		const recovery = tx.objectStore(recoveryStoreName);
		const sync = tx.objectStore(syncStoreName);
		if (
			store.keyPath !== "id" ||
			metadata.keyPath !== "id" ||
			recovery.keyPath !== "id" ||
			sync.keyPath !== "id"
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
				queueNativeDraftMirror({
					...draft,
					thumbnail: mirrorThumbnail(draft.thumbnail),
				});
			}
		} catch (error) {
			console.warn("Native draft backfill failed:", error);
		}
	}

	async function putRecoveredDraft(draft: DrawingDraft): Promise<void> {
		assertValidDraftStorageId(draft.id);
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

	/**
	 * The preview, as the Blob the encoder produced.
	 *
	 * This used to run the Blob back through a FileReader to make a base64 data
	 * URL — an extra encode on every single save, producing a string a third
	 * larger than the image, purely so an `<img src>` could take it directly.
	 * The list now makes an object URL instead, which copies nothing.
	 */
	function overviewThumbnail(signal?: AbortSignal): Promise<DraftThumbnail> {
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
			.then((blob) => blob ?? "");
	}

	/**
	 * Preview of last resort, rendered from the DOCUMENT rather than copied out of
	 * the overview bitmap.
	 *
	 * The overview declines (returns nothing) whenever it does not physically hold
	 * enough pixels for the requested size — a small sketch covers little world,
	 * and the overview is a fixed px-per-world-unit bitmap. Re-rendering the
	 * vectors in the preview worker gives a genuinely sharp preview at any content
	 * size, off the main thread, and it needs no live canvas: the exit path calls
	 * it after the engine is already gone.
	 */
	async function renderThumbnailFromDocument(
		json: any,
		signal?: AbortSignal,
	): Promise<DraftThumbnail> {
		if (!json) return "";
		try {
			const blob = await renderDraftThumbnailInWorker(json, {
				maxSize: DRAFT_THUMBNAIL_MAX_SIZE,
				quality: DRAFT_THUMBNAIL_QUALITY,
				signal,
			});
			return blob ?? "";
		} catch (error) {
			if (!(error instanceof DOMException && error.name === "AbortError"))
				console.warn("Draft thumbnail re-render failed:", error);
			return "";
		}
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

		const [overview, jsonBlob] = await Promise.all([
			thumbnailPromise,
			documentJsonToBlob(detached.json, signal),
		]);
		if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

		const thumbnail =
			overview || (await renderThumbnailFromDocument(detached.json, signal));

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
		options: { forceMirror?: boolean } = {},
	): Promise<void> {
		assertValidDraftStorageId(snapshot.draftId);
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
			[objectStoreName, metadataStoreName, recoveryStoreName, syncStoreName],
			"readwrite",
		);
		await new Promise<void>((resolve, reject) => {
			const drafts = transaction.objectStore(objectStoreName);
			const syncStates = transaction.objectStore(syncStoreName);
			const previousRequest = drafts.get(draft.id);
			const syncStateRequest = syncStates.get(draft.id);
			previousRequest.onsuccess = () => {
				// The stall this metric exists to catch is the SYNCHRONOUS structured
				// clone inside put(), so it has to be measured around put() itself.
				// Timing the surrounding transaction setup (as this did before)
				// reported a fraction of a millisecond no matter how large the draft.
				const dispatchStartedAt = performance.now();
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
				recordPhase(
					"draftPersistDispatch",
					performance.now() - dispatchStartedAt,
				);
			};
			syncStateRequest.onsuccess = () => {
				const previous = syncStateRequest.result as DraftSyncState | undefined;
				syncStates.put({
					...previous,
					id: draft.id,
					pushedUpdatedAt: previous?.pushedUpdatedAt ?? 0,
					remoteUpdatedAt: previous?.remoteUpdatedAt ?? 0,
					queuedUpdatedAt: draft.updatedAt,
				} satisfies DraftSyncState);
			};
			transaction.oncomplete = () => resolve();
			transaction.onerror = () =>
				reject(transaction.error ?? previousRequest.error);
			transaction.onabort = () =>
				reject(transaction.error ?? new Error("Draft save aborted"));
		});
		queueNativeDraftMirror(
			{ ...draft, thumbnail: mirrorThumbnail(draft.thumbnail) },
			{ force: options.forceMirror },
		);
		notifyDraftSaved(draft.id, draft.updatedAt);
	}

	/**
	 * The mirror's metadata is a JSON file, which cannot hold a Blob. Base64ing
	 * the preview into it would put ~70 KB of string back through the Capacitor
	 * bridge on every mirror write — the exact cost this format change removes.
	 *
	 * So the mirror carries no preview for new saves. It exists to recover the
	 * DRAWING after IndexedDB is lost or evicted; a card that shows a placeholder
	 * until its next save is a fair price, and legacy string thumbnails already
	 * written are still read back.
	 */
	function mirrorThumbnail(thumbnail: DraftThumbnail): string {
		return typeof thumbnail === "string" ? thumbnail : "";
	}

	/**
	 * True from the first byte of `loadCanvas` until the first paint is ready
	 * (overview built, visible tiles baked). A save started inside that window
	 * serializes every object of a document that is still being enlivened and
	 * baked — the two most expensive things in the app, competing for the same
	 * main thread — and it snapshots a scene that is not fully assembled yet.
	 */
	const isLoadingDocument = () => useDrawSyncer().isLoadingCanvas;

	async function performLiveSave() {
		if (
			!activeCanvas ||
			!currentDraftId.value ||
			!isDirty.value ||
			!hasContent()
		) {
			return;
		}
		if (isLoadingDocument()) {
			// Re-arm rather than drop it: the draft stays dirty and this is the only
			// thing keeping the quiet-timer chain alive between the 20s intervals.
			if (!autosaveQuietTimer) {
				autosaveQuietTimer = setTimeout(() => {
					autosaveQuietTimer = undefined;
					saveWhenQuiet();
				}, AUTOSAVE_QUIET_MS);
			}
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
		if (isSaving.value || isLoadingDocument()) return "busy";
		if (!isDirty.value) return "clean";
		const now = Date.now();
		if (now - lastManualSaveAt < MANUAL_SAVE_COOLDOWN_MS) return "cooldown";
		lastManualSaveAt = now;
		await performLiveSave();
		return "saved";
	}

	function init(c: Canvas) {
		activeCanvas = c;
		// Opens the window in which deferrable background work (cloud pushes)
		// must stay off the main thread. Closed again by disposeSession.
		notifyDrawSession(true);
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

		const thumbnailPromise = exitThumbnailPromise
			? exitThumbnailPromise.then(
					(thumbnail) =>
						thumbnail ||
						renderThumbnailFromDocument(snapshot.json, ctrl.signal),
				)
			: Promise.resolve(snapshot.thumbnail);

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
				// Exit is the one save that must reach the filesystem immediately: the
				// process may not exist by the time the throttle would next open.
				runSave({ ...snapshot, jsonBlob, thumbnail }, ctrl.signal, {
					forceMirror: detachBeforeThumbnail,
				}),
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

	/**
	 * `options.remote` marks a delete that ORIGINATED in the cloud (another
	 * device discarded this draft). Those must not be echoed back as a new
	 * tombstone — the server already has one.
	 */
	async function removeDraft(
		id?: string,
		options: { remote?: boolean } = {},
	): Promise<void> {
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
			[objectStoreName, metadataStoreName, recoveryStoreName, syncStoreName],
			"readwrite",
		);
		tx.objectStore(objectStoreName).delete(targetId);
		tx.objectStore(metadataStoreName).delete(targetId);
		tx.objectStore(recoveryStoreName).delete(targetId);
		tx.objectStore(syncStoreName).delete(targetId);
		await new Promise((resolve, reject) => {
			tx.oncomplete = () => resolve(null);
			tx.onerror = () => reject(tx.error);
		});
		await removeNativeDraft(targetId);
		// AFTER the local delete has committed: cloud sync turns this into a
		// tombstone, and a tombstone that outlives a failed local delete would
		// erase the draft on every other device while this one still shows it.
		if (!options.remote) notifyDraftDeleted(targetId);
	}

	/**
	 * Destroy every local draft: documents, metadata, recovery revisions, sync
	 * watermarks and the filesystem mirror. Returns the ids removed so callers
	 * can propagate the deletion (cloud tombstones) or report a count.
	 *
	 * Development affordance. There is no undo, and nothing in the shipping UI
	 * calls it — resetting draft state by hand otherwise means clearing app data
	 * and losing the signed-in session with it.
	 */
	async function removeAllDrafts(): Promise<string[]> {
		await initDB();
		await awaitPendingSaves();

		const metadata = await getAllDraftMetadata();
		const ids = metadata.map((draft) => draft.id);
		for (const id of ids) markDraftRemoved(id);

		const tx = db.value!.transaction(
			[objectStoreName, metadataStoreName, recoveryStoreName, syncStoreName],
			"readwrite",
		);
		for (const name of [
			objectStoreName,
			metadataStoreName,
			recoveryStoreName,
			syncStoreName,
		]) {
			tx.objectStore(name).clear();
		}
		await new Promise<void>((resolve, reject) => {
			tx.oncomplete = () => resolve();
			tx.onerror = () => reject(tx.error);
			tx.onabort = () => reject(tx.error ?? new Error("Draft wipe aborted"));
		});

		await Promise.all(ids.map((id) => removeNativeDraft(id)));
		return ids;
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

	// ==========================================
	// ☁️ CLOUD SYNC SUPPORT
	// ==========================================
	/**
	 * The stored document EXACTLY as persisted, with no parsing.
	 *
	 * Cloud sync uploads the very Blob that `runSave` wrote, so a push costs no
	 * re-serialization and never materializes the document as a JS string. Older
	 * rows (and hand-built snapshots) may hold a plain object; those are encoded
	 * once, here, rather than making every caller handle both shapes.
	 *
	 * `updatedAt` comes from the same row as the bytes. Reading it separately
	 * from the metadata store would let a save land in between and stamp the
	 * upload with a revision its payload does not contain.
	 */
	async function readDraftForUpload(id: string): Promise<
		| {
				blob: Blob;
				updatedAt: number;
				thumbnail: DraftThumbnail;
		  }
		| undefined
	> {
		await initDB();
		const draft = await readStoredDraft(objectStoreName, id);
		if (!draft) return undefined;
		const blob =
			draft.json instanceof Blob
				? draft.json
				: typeof draft.json === "string"
					? new Blob([draft.json], { type: "application/json" })
					: await documentJsonToBlob(draft.json);
		return {
			blob,
			updatedAt: draft.updatedAt,
			thumbnail: draft.thumbnail ?? "",
		};
	}

	/** Local revision of a draft's DOCUMENT, ignoring any cloud placeholder row. */
	async function getDraftRevision(id: string): Promise<number | undefined> {
		await initDB();
		return (await readStoredDraft(objectStoreName, id))?.updatedAt;
	}

	/**
	 * Record that the newest revision of a draft lives in the cloud. Writes a
	 * metadata row only, so the home list can show the card (and its remote
	 * preview) without the device having downloaded the document yet.
	 */
	async function putRemoteDraftPlaceholder(
		metadata: DrawingDraftMetadata,
	): Promise<void> {
		assertValidDraftStorageId(metadata.id);
		await initDB();
		const tx = db.value!.transaction([metadataStoreName], "readwrite");
		tx.objectStore(metadataStoreName).put({
			...metadata,
			remote: true,
		} satisfies DrawingDraftMetadata);
		await new Promise<void>((resolve, reject) => {
			tx.oncomplete = () => resolve();
			tx.onerror = () => reject(tx.error);
		});
	}

	/**
	 * Write a document pulled from the cloud. Refuses to overwrite a local copy
	 * that is newer, so a slow download can never undo edits made while it ran.
	 */
	async function putRemoteDraft(draft: DrawingDraft): Promise<boolean> {
		assertValidDraftStorageId(draft.id);
		await initDB();
		const existing = await readStoredDraft(objectStoreName, draft.id);
		if (existing && existing.updatedAt >= draft.updatedAt) return false;
		await putRecoveredDraft(draft);
		removedDraftIds.value.delete(draft.id);
		removedDraftIds.value = new Set(removedDraftIds.value);
		return true;
	}

	async function readDraftSyncState(
		id: string,
	): Promise<DraftSyncState | undefined> {
		await initDB();
		return new Promise((resolve, reject) => {
			const req = db
				.value!.transaction([syncStoreName], "readonly")
				.objectStore(syncStoreName)
				.get(id);
			req.onsuccess = () => resolve(req.result as DraftSyncState | undefined);
			req.onerror = () => reject(req.error);
		});
	}

	async function getAllDraftSyncStates(): Promise<DraftSyncState[]> {
		await initDB();
		return new Promise((resolve, reject) => {
			const req = db
				.value!.transaction([syncStoreName], "readonly")
				.objectStore(syncStoreName)
				.getAll();
			req.onsuccess = () => resolve((req.result as DraftSyncState[]) ?? []);
			req.onerror = () => reject(req.error);
		});
	}

	async function writeDraftSyncState(state: DraftSyncState): Promise<void> {
		assertValidDraftStorageId(state.id);
		await initDB();
		const tx = db.value!.transaction([syncStoreName], "readwrite");
		tx.objectStore(syncStoreName).put(state);
		await new Promise<void>((resolve, reject) => {
			tx.oncomplete = () => resolve();
			tx.onerror = () => reject(tx.error);
		});
	}

	/**
	 * Advance the cloud watermark without erasing a newer local upload intent.
	 * A save can land while an older revision is in flight; merging in one IDB
	 * transaction prevents that older upload from clearing the newer marker.
	 */
	async function markDraftRevisionPushed(
		id: string,
		pushedUpdatedAt: number,
		remoteUpdatedAt: number,
	): Promise<void> {
		assertValidDraftStorageId(id);
		await initDB();
		const tx = db.value!.transaction([syncStoreName], "readwrite");
		const store = tx.objectStore(syncStoreName);
		const request = store.get(id);
		request.onsuccess = () => {
			const latest = request.result as DraftSyncState | undefined;
			const queuedUpdatedAt = latest?.queuedUpdatedAt;
			store.put({
				...latest,
				id,
				pushedUpdatedAt: Math.max(
					latest?.pushedUpdatedAt ?? 0,
					pushedUpdatedAt,
				),
				remoteUpdatedAt: Math.max(
					latest?.remoteUpdatedAt ?? 0,
					remoteUpdatedAt,
				),
				queuedUpdatedAt:
					queuedUpdatedAt !== undefined && queuedUpdatedAt > pushedUpdatedAt
						? queuedUpdatedAt
						: undefined,
			} satisfies DraftSyncState);
		};
		await new Promise<void>((resolve, reject) => {
			tx.oncomplete = () => resolve();
			tx.onerror = () => reject(tx.error ?? request.error);
			tx.onabort = () =>
				reject(tx.error ?? new Error("Draft sync watermark update aborted"));
		});
	}

	async function clearDraftSyncStates(): Promise<void> {
		await initDB();
		const tx = db.value!.transaction([syncStoreName], "readwrite");
		tx.objectStore(syncStoreName).clear();
		await new Promise<void>((resolve, reject) => {
			tx.oncomplete = () => resolve();
			tx.onerror = () => reject(tx.error);
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
		// The canvas is gone, so the main thread is free. This is the signal the
		// sync engine waits for before spending anything on a push.
		notifyDrawSession(false);
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
		removeAllDrafts,
		getAllDrafts,
		getAllDraftMetadata,
		readDraftForUpload,
		getDraftRevision,
		putRemoteDraft,
		putRemoteDraftPlaceholder,
		readDraftSyncState,
		getAllDraftSyncStates,
		writeDraftSyncState,
		markDraftRevisionPushed,
		clearDraftSyncStates,
		hasContent,
		init,
		resetToNewDraft,
		disposeSession,
	};
});
