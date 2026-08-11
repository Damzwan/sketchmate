import { App } from "@capacitor/app";
import type { PluginListenerHandle } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";
import { defineStore, storeToRefs } from "pinia";
import { computed, ref, watch } from "vue";
import {
	type DrawingDraftMetadata,
	useDocumentStore,
} from "@/draw/document/document.store";
import {
	isDrawSessionActive,
	onDraftDeleted,
	onDraftPersisted,
	onDrawSessionChanged,
} from "@/draw/document/draftEvents";
import { noteCloudReplica } from "@/draw/document/nativeDraftMirror";
import {
	CloudDraftRejection,
	type CloudDraftSummary,
	commitCloudDraft,
	createCloudDraftTicket,
	deleteCloudDraft,
	fetchCloudDrafts,
} from "@/service/api/cloudDraft.api";
import {
	fetchDocumentBlob,
	gzipBlob,
	putToPresignedUrl,
	toThumbnailBlob,
} from "@/service/draftSync.service";
import { useAuthStore } from "@/store/auth.store";
import { useNetworkStore } from "@/store/network.store";
import { useSubscriptionStore } from "@/store/subscription.store";
import { LocalStorage } from "@/types/storage.types";

/** Quiet period after the last local save before a draft is pushed. */
const PUSH_DEBOUNCE_MS = 6_000;
/**
 * Safety net for a session that never ends.
 *
 * Pushes are otherwise held until the canvas closes (see `drawingActive`). That
 * is right for cost and wrong for durability on its own: someone who draws for
 * two hours and is then OOM-killed by Android would have nothing in the cloud.
 * One push every five minutes of continuous drawing bounds that loss without
 * being anywhere near often enough to matter to frame rate.
 */
const PUSH_WHILE_DRAWING_MS = 5 * 60_000;
/** Floor between two pulls, so re-entering Home repeatedly costs one request. */
const PULL_MIN_INTERVAL_MS = 60_000;
/** Exponential backoff bounds for a draft whose push keeps failing. */
const RETRY_BASE_MS = 15_000;
const RETRY_MAX_MS = 10 * 60_000;
/** Breathing room between backfilled uploads so a cold sync never hogs the radio. */
const BACKFILL_GAP_MS = 1_500;
/**
 * Grace period after the canvas closes.
 *
 * Leaving the drawing tears down the render engine, disposes the Fabric scene
 * and animates a route transition. Starting an upload into that is exactly the
 * jank the deferral exists to avoid, so let it land first.
 */
const POST_SESSION_DELAY_MS = 1_200;

/** Refusals that will never succeed on retry — recorded, then left alone. */
const TERMINAL_CODES = new Set(["draft_too_large", "draft_limit_reached"]);

export type DraftSyncStatus = "off" | "idle" | "syncing" | "offline" | "error";
export type DraftResyncResult =
	| "synced"
	| "downloaded"
	| "offline"
	| "missing"
	| "failed";

interface QueueEntry {
	attempts: number;
	/** Epoch ms before which this draft must not be retried. */
	notBefore: number;
}

/**
 * Cloud draft sync for Pro accounts.
 *
 * Shape of the thing:
 *   • IndexedDB stays the source of truth for the device. The cloud is a mirror
 *     that other devices can read, never a store this app reads through.
 *   • Pushes upload the EXACT Blob that the local save already produced, gzipped
 *     through a stream and PUT straight to S3. The API server never sees bytes.
 *   • Pulls are metadata-only and incremental (`?since=` cursor). A draft that
 *     lives only in the cloud is listed from its metadata row and its document
 *     is downloaded on open, not on sync.
 *   • Conflicts resolve last-write-wins on the client `updatedAt`, the same
 *     comparison on both sides, so a device can decide locally what will happen
 *     before it uploads anything.
 */
export const useDraftSyncStore = defineStore("draftSync", () => {
	const status = ref<DraftSyncStatus>("off");
	const lastSyncedAt = ref<number | undefined>();
	/** Changes after a cloud list page has been fully applied to local storage. */
	const remoteListVersion = ref(0);
	const used = ref(0);
	const limit = ref(0);
	/** Drafts the server refused permanently, keyed id → code. */
	const blocked = ref<Map<string, string>>(new Map());
	/** Ids whose newest revision is in the cloud and not yet downloaded here. */
	const remoteOnlyIds = ref<Set<string>>(new Set());
	/** Reactive card metadata for those drafts, so a retained Home view updates. */
	const remoteDraftMetadata = ref<Map<string, DrawingDraftMetadata>>(new Map());
	/** Ids currently queued or uploading. */
	const inFlightIds = ref<Set<string>>(new Set());

	const queue = new Map<string, QueueEntry>();
	const hydrations = new Map<string, Promise<boolean>>();
	/** Remote document urls, kept for the lazy hydrate when a card is opened. */
	const remoteDocuments = new Map<string, CloudDraftSummary>();
	/** Mirrors the live-canvas window. See `pushDeadline`. */
	let drawingActive = isDrawSessionActive();
	let pushTimer: ReturnType<typeof setTimeout> | undefined;
	let draining: Promise<void> | undefined;
	let appStateListener: PluginListenerHandle | null = null;
	let pulling: Promise<void> | undefined;
	let lastPullAt = 0;
	let unsubscribe: Array<() => void> = [];
	let started = false;
	let backfilled = false;
	let appIsActive = true;

	const subscriptions = useSubscriptionStore();
	const auth = useAuthStore();
	const { isPro } = storeToRefs(subscriptions);
	const { user } = storeToRefs(auth);

	/** Sync is a Pro feature and needs an account to attach the drafts to. */
	const enabled = computed(() => isPro.value && !!user.value?._id);

	const isOnline = () => {
		const { networkStatus } = useNetworkStore();
		// Undefined means the listener has not reported yet. Assume connected —
		// a failed request is cheap and self-correcting; refusing to sync until
		// a plugin answers is not.
		return networkStatus?.connected !== false;
	};

	const isMetered = () => {
		const { networkStatus } = useNetworkStore();
		return networkStatus?.connectionType === "cellular";
	};

	function markInFlight(): void {
		inFlightIds.value = new Set(queue.keys());
	}

	// ── Cursor ────────────────────────────────────────────────────────────────
	// Scoped to the account: the draft database is shared by every user of the
	// device (logout deliberately keeps local drafts), so a cursor carried across
	// a login would silently skip the new account's entire history.
	async function readCursor(userId: string): Promise<number> {
		const { value } = await Preferences.get({
			key: LocalStorage.draftSyncCursor,
		});
		if (!value) return 0;
		try {
			const parsed = JSON.parse(value) as { userId?: string; cursor?: number };
			if (parsed.userId !== userId) return 0;
			return typeof parsed.cursor === "number" ? parsed.cursor : 0;
		} catch {
			return 0;
		}
	}

	async function writeCursor(userId: string, cursor: number): Promise<void> {
		await Preferences.set({
			key: LocalStorage.draftSyncCursor,
			value: JSON.stringify({ userId, cursor }),
		});
	}

	// ── Push ──────────────────────────────────────────────────────────────────
	/**
	 * When this draft may be pushed.
	 *
	 * A push is: an IndexedDB read of the whole record, a gzip of the whole
	 * document, and an HTTPS upload — against the same database the autosave is
	 * writing to and the same radio and CPU the renderer needs. None of that is
	 * urgent. So while a canvas is live the deadline stretches to the safety-net
	 * interval, and the work really happens when the session ends, when the app
	 * is backgrounded, or on an explicit "Sync now".
	 */
	function pushDeadline(requested: number): number {
		if (!drawingActive) return requested;
		return Math.max(requested, PUSH_WHILE_DRAWING_MS);
	}

	function enqueue(id: string, delay = PUSH_DEBOUNCE_MS): void {
		if (!enabled.value) return;
		if (blocked.value.has(id)) return;
		const existing = queue.get(id);
		const notBefore = Date.now() + pushDeadline(delay);
		// Never pull a deadline earlier by re-queuing: a draft saved every few
		// seconds during a long session would otherwise reset its way past the
		// while-drawing floor and push constantly, which is the whole problem.
		queue.set(id, {
			attempts: existing?.attempts ?? 0,
			notBefore: existing ? Math.max(existing.notBefore, notBefore) : notBefore,
		});
		markInFlight();
		scheduleDrain();
	}

	/**
	 * Bring every queued draft forward — the canvas closed, the app went to the
	 * background, or the user asked. These are the moments the main thread is
	 * actually free, so they are when the deferred work gets spent.
	 */
	function releaseQueue(delay = 0): void {
		if (!enabled.value || queue.size === 0) return;
		const at = Date.now() + delay;
		for (const [id, entry] of queue) {
			// Only drafts held back for POLITENESS. A draft sitting on a retry
			// backoff was refused by the network or the server, and being on the
			// home screen does not make that refusal any less true — releasing it
			// here would turn every app switch into a retry storm.
			if (entry.attempts > 0) continue;
			queue.set(id, { ...entry, notBefore: Math.min(entry.notBefore, at) });
		}
		if (pushTimer !== undefined) {
			clearTimeout(pushTimer);
			pushTimer = undefined;
		}
		scheduleDrain();
	}

	function scheduleDrain(): void {
		if (pushTimer !== undefined || draining) return;
		const now = Date.now();
		let soonest = Infinity;
		for (const entry of queue.values())
			soonest = Math.min(soonest, entry.notBefore);
		if (soonest === Infinity) return;

		pushTimer = setTimeout(
			() => {
				pushTimer = undefined;
				void drain();
			},
			Math.max(0, soonest - now),
		);
	}

	function nextReady(): string | undefined {
		const now = Date.now();
		for (const [id, entry] of queue) if (entry.notBefore <= now) return id;
		return undefined;
	}

	function drain(): Promise<void> {
		if (draining) return draining;
		draining = (async () => {
			// Strictly one document in flight. Two concurrent uploads would hold two
			// full compressed drawings in memory for no throughput gain on a radio.
			for (let id = nextReady(); id; id = nextReady()) {
				if (!enabled.value) break;
				if (!isOnline()) {
					status.value = "offline";
					break;
				}
				status.value = "syncing";
				await pushDraft(id);
			}
		})()
			.catch((error) => console.warn("[draftSync] push drain failed:", error))
			.finally(() => {
				draining = undefined;
				markInFlight();
				if (queue.size === 0 && status.value === "syncing")
					status.value = "idle";
				scheduleDrain();
			});
		return draining;
	}

	function retryLater(id: string, terminalCode?: string): void {
		const entry = queue.get(id);
		if (terminalCode) {
			queue.delete(id);
			blocked.value.set(id, terminalCode);
			blocked.value = new Map(blocked.value);
			return;
		}
		const attempts = (entry?.attempts ?? 0) + 1;
		queue.set(id, {
			attempts,
			notBefore:
				Date.now() +
				Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** (attempts - 1)),
		});
		status.value = "error";
	}

	async function pushDraft(id: string): Promise<void> {
		const documents = useDocumentStore();
		const payload = await documents.readDraftForUpload(id);
		if (!payload) {
			// Deleted between the save notification and this turn of the queue.
			queue.delete(id);
			return;
		}

		const state = await documents.readDraftSyncState(id);
		if (state && state.pushedUpdatedAt >= payload.updatedAt) {
			queue.delete(id);
			return;
		}

		try {
			const ticket = await createCloudDraftTicket(id);
			const { body } = await gzipBlob(payload.blob);
			const thumbnail = await toThumbnailBlob(payload.thumbnail);

			await putToPresignedUrl(
				ticket.drawingUploadUrl,
				body,
				"application/gzip",
			);
			if (thumbnail) {
				// A missing preview degrades the other device's card to a placeholder;
				// it must never cost the document itself.
				await putToPresignedUrl(
					ticket.thumbnailUploadUrl,
					thumbnail,
					"image/webp",
				).catch((error) =>
					console.warn("[draftSync] thumbnail upload failed:", error),
				);
			}

			const summary = await commitCloudDraft(id, {
				updated_at: payload.updatedAt,
				drawing_key: ticket.drawingKey,
				thumbnail_key: thumbnail ? ticket.thumbnailKey : "",
				bytes: body.size,
			});

			// The account now holds these bytes, so the on-device filesystem mirror
			// can stop duplicating this revision.
			noteCloudReplica(id, payload.updatedAt);
			await documents.markDraftRevisionPushed(
				id,
				payload.updatedAt,
				summary.updated_at,
			);
			queue.delete(id);
			lastSyncedAt.value = Date.now();
		} catch (error) {
			if (error instanceof CloudDraftRejection) {
				if (error.code === "stale_draft") {
					// The cloud already holds a newer revision of this draft. Nothing to
					// push; the next pull brings that revision down.
					queue.delete(id);
					return;
				}
				if (error.code === "pro_required") {
					stop();
					return;
				}
				if (TERMINAL_CODES.has(error.code)) {
					await documents
						.writeDraftSyncState({
							id,
							pushedUpdatedAt: state?.pushedUpdatedAt ?? 0,
							remoteUpdatedAt: state?.remoteUpdatedAt ?? 0,
							blockedCode: error.code,
						})
						.catch(() => undefined);
					retryLater(id, error.code);
					return;
				}
			}
			console.warn(`[draftSync] push failed for ${id}:`, error);
			retryLater(id);
		}
	}

	// ── Pull ──────────────────────────────────────────────────────────────────
	async function applyRemote(
		summary: CloudDraftSummary,
		documents: ReturnType<typeof useDocumentStore>,
	): Promise<void> {
		const id = summary.draft_id;
		const [localRevision, state] = await Promise.all([
			documents.getDraftRevision(id),
			documents.readDraftSyncState(id),
		]);

		if (localRevision !== undefined && localRevision >= summary.updated_at) {
			// This device already holds this revision or better. Drop any stored
			// remote url so a stale one can never be hydrated over newer local work.
			remoteOnlyIds.value.delete(id);
			remoteDraftMetadata.value.delete(id);
			remoteDocuments.delete(id);
			await documents.writeDraftSyncState({
				id,
				pushedUpdatedAt: state?.pushedUpdatedAt ?? 0,
				remoteUpdatedAt: summary.updated_at,
			});
			return;
		}

		await documents.writeDraftSyncState({
			id,
			pushedUpdatedAt: state?.pushedUpdatedAt ?? 0,
			remoteUpdatedAt: summary.updated_at,
			remoteDrawing: summary.drawing,
			remoteThumbnail: summary.thumbnail,
		});
		// List the card now, download the document on open. A pull that fetched
		// every remote drawing would move megabytes the user may never look at.
		await documents.putRemoteDraftPlaceholder({
			id,
			updatedAt: summary.updated_at,
			thumbnail: summary.thumbnail,
		});
		remoteOnlyIds.value.add(id);
		remoteDraftMetadata.value.set(id, {
			id,
			updatedAt: summary.updated_at,
			thumbnail: summary.thumbnail,
			remote: true,
		});
		remoteDocuments.set(id, summary);
	}

	/**
	 * Restore the cloud-only set from disk. The pull is incremental, so a draft
	 * that has not changed since the last run is never re-listed — without this,
	 * a cold start would show its placeholder card and open an empty canvas.
	 */
	async function restoreRemoteOnly(): Promise<void> {
		const documents = useDocumentStore();
		const states = await documents.getAllDraftSyncStates();
		for (const state of states) {
			if (state.blockedCode) {
				blocked.value.set(state.id, state.blockedCode);
			}
			if (!state.remoteDrawing) continue;
			const localRevision = await documents.getDraftRevision(state.id);
			if (
				localRevision !== undefined &&
				localRevision >= state.remoteUpdatedAt
			) {
				continue;
			}
			remoteOnlyIds.value.add(state.id);
			remoteDraftMetadata.value.set(state.id, {
				id: state.id,
				updatedAt: state.remoteUpdatedAt,
				thumbnail: state.remoteThumbnail ?? "",
				remote: true,
			});
			remoteDocuments.set(state.id, {
				draft_id: state.id,
				updated_at: state.remoteUpdatedAt,
				bytes: 0,
				thumbnail: state.remoteThumbnail ?? "",
				drawing: state.remoteDrawing,
			});
		}
		blocked.value = new Map(blocked.value);
		remoteOnlyIds.value = new Set(remoteOnlyIds.value);
		remoteDraftMetadata.value = new Map(remoteDraftMetadata.value);
	}

	function pull(force = false): Promise<void> {
		if (!enabled.value) return Promise.resolve();
		if (pulling) {
			if (!force) return pulling;
			// A user refresh must mean a check made after their tap. Joining a startup
			// pull that may have begun before another device committed its draft can
			// otherwise report success without ever asking the server again.
			const currentPull = pulling;
			return currentPull.then(() => pull(true));
		}
		if (!force && Date.now() - lastPullAt < PULL_MIN_INTERVAL_MS) {
			return Promise.resolve();
		}
		if (!isOnline()) {
			status.value = "offline";
			return Promise.resolve();
		}

		pulling = (async () => {
			const userId = user.value?._id;
			if (!userId) return;
			const documents = useDocumentStore();
			status.value = "syncing";

			const since = await readCursor(userId);
			const page = await fetchCloudDrafts(since);

			for (const summary of page.drafts) await applyRemote(summary, documents);
			for (const id of page.deleted) {
				remoteDocuments.delete(id);
				remoteOnlyIds.value.delete(id);
				remoteDraftMetadata.value.delete(id);
				// `remote: true` stops this from being echoed back as a fresh
				// tombstone — the server is already the one telling us.
				await documents
					.removeDraft(id, { remote: true })
					.catch(() => undefined);
			}

			remoteOnlyIds.value = new Set(remoteOnlyIds.value);
			remoteDraftMetadata.value = new Map(remoteDraftMetadata.value);
			used.value = page.used;
			limit.value = page.limit;
			await writeCursor(userId, page.cursor);
			lastPullAt = Date.now();
			lastSyncedAt.value = Date.now();
			remoteListVersion.value += 1;
			status.value = queue.size ? "syncing" : "idle";
		})()
			.catch((error) => {
				if (
					error instanceof CloudDraftRejection &&
					error.code === "pro_required"
				) {
					stop();
					return;
				}
				console.warn("[draftSync] pull failed:", error);
				status.value = "error";
			})
			.finally(() => {
				pulling = undefined;
			});
		return pulling;
	}

	/**
	 * Download a cloud-only draft so it can be opened. Idempotent and shared:
	 * a double tap on the card produces one download.
	 */
	function hydrate(id: string): Promise<boolean> {
		const existing = hydrations.get(id);
		if (existing) return existing;
		if (!remoteOnlyIds.value.has(id)) return Promise.resolve(true);

		const run = (async () => {
			const summary = remoteDocuments.get(id);
			if (!summary?.drawing) return false;
			const documents = useDocumentStore();
			// Preview alongside the document. Storing the CDN url instead would
			// leave the card blank the moment the device goes offline, and it is a
			// ~50 KB request next to a download that is already happening.
			const [blob, preview] = await Promise.all([
				fetchDocumentBlob(summary.drawing),
				summary.thumbnail
					? fetch(summary.thumbnail)
							.then((response) => (response.ok ? response.blob() : null))
							.catch(() => null)
					: Promise.resolve(null),
			]);
			const written = await documents.putRemoteDraft({
				id,
				json: blob,
				updatedAt: summary.updated_at,
				thumbnail: preview ?? summary.thumbnail,
			});
			remoteOnlyIds.value.delete(id);
			remoteOnlyIds.value = new Set(remoteOnlyIds.value);
			remoteDraftMetadata.value.delete(id);
			remoteDraftMetadata.value = new Map(remoteDraftMetadata.value);
			remoteDocuments.delete(id);
			// The bytes came FROM the cloud at this exact revision, so record it as
			// pushed. Without this the device immediately uploads what it just
			// downloaded, on every device, forever.
			await documents.writeDraftSyncState({
				id,
				pushedUpdatedAt: summary.updated_at,
				remoteUpdatedAt: summary.updated_at,
			});
			return written;
		})()
			.catch((error) => {
				console.warn(`[draftSync] hydrate failed for ${id}:`, error);
				return false;
			})
			.finally(() => hydrations.delete(id));

		hydrations.set(id, run);
		return run;
	}

	/** Awaited by the home list before opening a card. */
	async function ensureLocalCopy(id: string): Promise<boolean> {
		if (!remoteOnlyIds.value.has(id)) return true;
		if (!isOnline()) return false;
		return hydrate(id);
	}

	/**
	 * Repair one draft without disturbing the rest of the queue.
	 *
	 * Pull first so a newer cloud revision wins. Otherwise persist a fresh upload
	 * intent and retry this exact local revision even when its old watermark said
	 * it was already backed up.
	 */
	async function resyncDraft(id: string): Promise<DraftResyncResult> {
		if (!enabled.value) return "failed";
		if (!isOnline()) {
			status.value = "offline";
			return "offline";
		}

		await pull(true);
		if (status.value === "error") return "failed";
		if (remoteOnlyIds.value.has(id)) {
			return (await hydrate(id)) ? "downloaded" : "failed";
		}

		const documents = useDocumentStore();
		const payload = await documents.readDraftForUpload(id);
		if (!payload) return "missing";

		const state = await documents.readDraftSyncState(id);
		await documents.writeDraftSyncState({
			...state,
			id,
			// Make the retry durable. If the app closes during this PUT, startup
			// backfill sees this revision as still owed and resumes it.
			pushedUpdatedAt: Math.min(
				state?.pushedUpdatedAt ?? 0,
				payload.updatedAt - 1,
			),
			remoteUpdatedAt: state?.remoteUpdatedAt ?? 0,
			queuedUpdatedAt: payload.updatedAt,
			blockedCode: undefined,
		});
		blocked.value.delete(id);
		blocked.value = new Map(blocked.value);
		queue.set(id, { attempts: 0, notBefore: 0 });
		markInFlight();
		if (pushTimer !== undefined) {
			clearTimeout(pushTimer);
			pushTimer = undefined;
		}
		await drain();

		const updatedState = await documents.readDraftSyncState(id);
		return (updatedState?.pushedUpdatedAt ?? 0) >= payload.updatedAt
			? "synced"
			: "failed";
	}

	/**
	 * User-triggered "Sync now".
	 *
	 * Does the two things the automatic paths deliberately hold back on: pulls
	 * past the throttle, and re-queues everything the device owes the cloud —
	 * including drafts a backoff is still sitting on and the backfill that a
	 * cellular connection skipped. Asking explicitly overrides those, because
	 * the reason they exist is to avoid spending data the user did not ask for.
	 */
	async function syncNow(): Promise<void> {
		if (!enabled.value) return;
		if (!isOnline()) {
			status.value = "offline";
			return;
		}
		// Clear the backoff: a manual retry that still waits ten minutes is not a
		// retry.
		for (const [id, entry] of queue) queue.set(id, { ...entry, notBefore: 0 });

		// Terminal refusals are cleared too, in memory AND on disk. "Over the
		// limit" stops being true the moment the user deletes something, and a
		// block that only a reinstall could lift would be a trap.
		if (blocked.value.size) {
			const documents = useDocumentStore();
			blocked.value = new Map();
			const states = await documents.getAllDraftSyncStates().catch(() => []);
			for (const state of states.filter((s) => s.blockedCode)) {
				await documents
					.writeDraftSyncState({ ...state, blockedCode: undefined })
					.catch(() => undefined);
				enqueue(state.id, 0);
			}
		}

		backfilled = false;
		await pull(true);
		await backfill(true);
		await drain();
	}

	// ── Backfill ──────────────────────────────────────────────────────────────
	/**
	 * First sync on an account: upload the drafts already on the device.
	 *
	 * A cold bulk library is held back on cellular. Revisions carrying a durable
	 * `queuedUpdatedAt` marker are different: this device already attempted to
	 * sync them, so they resume after interruption on any connection.
	 */
	async function backfill(force = false): Promise<void> {
		if (backfilled || !enabled.value) return;
		backfilled = true;

		const documents = useDocumentStore();
		const [metadata, states] = await Promise.all([
			documents.getAllDraftMetadata(),
			documents.getAllDraftSyncStates(),
		]);
		const pushed = new Map(states.map((s) => [s.id, s]));

		// Newest first: the drafts a returning user cares about arrive on their
		// other devices before the archive does.
		const stale = metadata
			.filter((draft) => !draft.remote)
			.filter((draft) => {
				const state = pushed.get(draft.id);
				if (state?.blockedCode) return false;
				if (
					isMetered() &&
					!force &&
					state?.queuedUpdatedAt !== draft.updatedAt
				) {
					return false;
				}
				return (state?.pushedUpdatedAt ?? 0) < draft.updatedAt;
			})
			.sort((a, b) => b.updatedAt - a.updatedAt);

		// Spaced, and — through `enqueue` — floored to the while-drawing interval
		// if a canvas happens to be live. A cold Pro login with 40 local drafts
		// must never turn into 40 gzip-and-upload cycles behind someone's stroke.
		stale.forEach((draft, index) => enqueue(draft.id, index * BACKFILL_GAP_MS));
	}

	// ── Lifecycle ─────────────────────────────────────────────────────────────
	async function start(): Promise<void> {
		if (started || !enabled.value) return;
		started = true;
		status.value = "idle";

		unsubscribe.push(
			onDraftPersisted((id) => enqueue(id, appIsActive ? PUSH_DEBOUNCE_MS : 0)),
			onDraftDeleted((id) => void tombstone(id)),
			onDrawSessionChanged(handleDrawSession),
		);
		void watchAppState();

		await restoreRemoteOnly().catch((error) =>
			console.warn("[draftSync] could not restore cloud-only drafts:", error),
		);
		await pull(true);
		await backfill();
	}

	function handleDrawSession(active: boolean): void {
		drawingActive = active;

		if (active) {
			// A draft saved on the home screen leaves a push due in six seconds. Open
			// the canvas within those six seconds and it lands squarely on top of
			// enlivening the scene and baking the first tiles — the most expensive
			// moment in the app. Anything already waiting gets pushed out to the
			// while-drawing floor instead.
			const floor = Date.now() + PUSH_WHILE_DRAWING_MS;
			for (const [id, entry] of queue) {
				if (entry.attempts > 0) continue;
				queue.set(id, {
					...entry,
					notBefore: Math.max(entry.notBefore, floor),
				});
			}
			if (pushTimer !== undefined) {
				clearTimeout(pushTimer);
				pushTimer = undefined;
			}
			scheduleDrain();
			return;
		}

		// Canvas closed. Everything deferred during the session is owed now — but
		// after the teardown and route transition have had their frames.
		releaseQueue(POST_SESSION_DELAY_MS);
	}

	async function watchAppState(): Promise<void> {
		if (appStateListener) return;
		try {
			const handle = await App.addListener("appStateChange", ({ isActive }) => {
				appIsActive = isActive;
				if (isActive) {
					// The OS may have cancelled a PUT while the WebView was suspended.
					// Rebuild the queue from the watermark written with the local save.
					backfilled = false;
					void backfill().then(() => releaseQueue(0));
					return;
				}
				// Backgrounded: nothing is rendering, so this is the cheapest CPU in
				// the app's life — and the last moment before Android may kill the
				// process, which makes it the most valuable one too. Released with no
				// delay; whatever does not finish is still queued for next launch.
				releaseQueue(0);
			});
			if (started) appStateListener = handle;
			else void handle.remove();
		} catch (error) {
			// Web has no app lifecycle. Session end and "Sync now" still cover it.
			console.warn("[draftSync] app state listener unavailable:", error);
		}
	}

	async function tombstone(id: string): Promise<void> {
		queue.delete(id);
		markInFlight();
		blocked.value.delete(id);
		remoteOnlyIds.value.delete(id);
		remoteDraftMetadata.value.delete(id);
		remoteDraftMetadata.value = new Map(remoteDraftMetadata.value);
		remoteDocuments.delete(id);
		if (!enabled.value) return;
		await deleteCloudDraft(id, Date.now()).catch((error) => {
			// A lost tombstone resurrects the draft on the next pull rather than
			// losing data, so this is a warning and not a retry queue.
			console.warn(`[draftSync] could not tombstone ${id}:`, error);
		});
	}

	function stop(): void {
		started = false;
		backfilled = false;
		appIsActive = true;
		for (const off of unsubscribe) off();
		unsubscribe = [];
		void appStateListener?.remove();
		appStateListener = null;
		if (pushTimer !== undefined) clearTimeout(pushTimer);
		pushTimer = undefined;
		queue.clear();
		remoteDocuments.clear();
		hydrations.clear();
		inFlightIds.value = new Set();
		remoteOnlyIds.value = new Set();
		remoteDraftMetadata.value = new Map();
		blocked.value = new Map();
		status.value = "off";
	}

	// Pro can arrive well after boot (RevenueCat round-trip) and can be revoked
	// mid-session by a refund, so the engine follows the flag rather than being
	// started once from a boot sequence.
	watch(
		enabled,
		(on) => {
			if (on) void start();
			else stop();
		},
		{ immediate: true },
	);

	// Regaining connectivity is the one moment a retry is guaranteed useful.
	watch(
		() => useNetworkStore().networkStatus?.connected,
		(connected, wasConnected) => {
			if (!connected || wasConnected !== false || !enabled.value) return;
			status.value = "idle";
			void pull(true);
			scheduleDrain();
		},
	);

	function resetRuntimeState(): void {
		stop();
		lastSyncedAt.value = undefined;
		remoteListVersion.value = 0;
		lastPullAt = 0;
		used.value = 0;
		limit.value = 0;
	}

	return {
		enabled,
		status,
		lastSyncedAt,
		remoteListVersion,
		used,
		limit,
		blocked,
		remoteOnlyIds,
		remoteDraftMetadata,
		inFlightIds,
		pull,
		syncNow,
		resyncDraft,
		ensureLocalCopy,
		resetRuntimeState,
	};
});
