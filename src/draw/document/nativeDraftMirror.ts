import { Capacitor } from "@capacitor/core";
import { Directory, Encoding, Filesystem } from "@capacitor/filesystem";
import { Preferences } from "@capacitor/preferences";
import {
	isDrawSessionActive,
	onDrawSessionChanged,
} from "@/draw/document/draftEvents";
import { LocalStorage } from "@/types/storage.types";

const ROOT = "SketchMate/drafts";
const VALID_ID = /^[a-zA-Z0-9_-]{1,128}$/;

/**
 * Pacing for the filesystem mirror.
 *
 * The mirror is a crash/eviction backstop behind IndexedDB, not a second
 * primary store. Writing it on every autosave meant that each 1.5 s pause in
 * drawing pushed the whole document — as a UTF-8 STRING, across the Capacitor
 * bridge — to disk again. On a ~10 MB drawing that is a multi-second bridge
 * encode competing with the very frames the autosave debounce exists to
 * protect, and it repeats for as long as the user keeps drawing.
 *
 * The interval therefore scales with document size instead of being flat. A
 * small sketch still mirrors every 30 s; a huge one backs off toward 5 minutes,
 * so the bytes-per-minute this feature costs stays roughly constant no matter
 * how big the drawing gets. That is the property that matters — a flat interval
 * makes the mirror cheap on the drawings nobody worries about and ruinous on
 * exactly the ones people spend hours in.
 *
 * Exit saves pass `force` and are never delayed.
 */
const MIRROR_MIN_INTERVAL_MS = 30_000;
const MIRROR_MAX_INTERVAL_MS = 5 * 60_000;
/** Document size that still earns the fastest interval. */
const MIRROR_CHEAP_BYTES = 512 * 1024;
/** Let canvas teardown and the Ionic route transition paint before disk I/O. */
const MIRROR_POST_SESSION_DELAY_MS = 1_500;
/**
 * Bound each Capacitor bridge message. The bridge serializes plugin arguments;
 * one multi-megabyte UTF-8 string can monopolize a low-end device's main
 * thread long enough to cross Android's ANR threshold.
 */
const MIRROR_BLOB_CHUNK_BYTES = 128 * 1024;
// TextDecoder may carry at most three bytes of a partial UTF-8 code point into
// the next decode. Leave four bytes of headroom so the re-encoded plugin
// argument remains at or below the advertised 128 KiB ceiling.
const MIRROR_BLOB_READ_BYTES = MIRROR_BLOB_CHUNK_BYTES - 4;

function payloadBytes(json: unknown): number {
	if (json instanceof Blob) return json.size;
	if (typeof json === "string") return json.length;
	// A plain object would cost a full stringify to measure, which is the very
	// work being paced. Treat it as cheap: this path is legacy rows only.
	return 0;
}

function mirrorInterval(json: unknown): number {
	const bytes = payloadBytes(json);
	if (bytes <= MIRROR_CHEAP_BYTES) return MIRROR_MIN_INTERVAL_MS;
	return Math.min(
		MIRROR_MAX_INTERVAL_MS,
		MIRROR_MIN_INTERVAL_MS * (bytes / MIRROR_CHEAP_BYTES),
	);
}

export interface NativeDraftMetadata {
	version: 1;
	id: string;
	ownerId: string;
	updatedAt: number;
	thumbnail: string;
}

export interface NativeDraftRecord extends NativeDraftMetadata {
	json: string;
}

interface MirrorInput {
	id: string;
	json: unknown;
	updatedAt: number;
	thumbnail: string;
}

const queues = new Map<string, Promise<void>>();
/** Newest payload per draft, written whenever the throttle next opens. */
const latest = new Map<string, MirrorInput>();
const trailingTimers = new Map<string, ReturnType<typeof setTimeout>>();
const lastMirroredAt = new Map<string, number>();
/**
 * Revision of each draft known to be stored off-device (cloud sync). A copy in
 * the user's account is strictly better redundancy than a second copy on the
 * same disk, so once the cloud confirms a revision the mirror stops paying to
 * duplicate it. Written by the sync engine; this module never imports it.
 */
const cloudReplicaAt = new Map<string, number>();
let mirrorQueue: Promise<void> = Promise.resolve();
let postSessionTimer: ReturnType<typeof setTimeout> | undefined;

export function noteCloudReplica(id: string, updatedAt: number): void {
	cloudReplicaAt.set(id, updatedAt);
}

function replicatedOffDevice(input: MirrorInput): boolean {
	return (cloudReplicaAt.get(input.id) ?? -1) >= input.updatedAt;
}

function isAvailable(): boolean {
	return Capacitor.isNativePlatform();
}

export function nativeDraftMirrorAvailable(): boolean {
	return isAvailable();
}

function draftPath(id: string): string {
	if (!VALID_ID.test(id)) throw new Error("Invalid local draft id");
	return `${ROOT}/${id}`;
}

async function currentOwnerId(): Promise<string | null> {
	const { value } = await Preferences.get({ key: LocalStorage.user_id });
	return value;
}

export async function nativeDraftMirrorHasOwner(): Promise<boolean> {
	return !!(await currentOwnerId());
}

async function ignoreMissing(action: () => Promise<unknown>): Promise<void> {
	try {
		await action();
	} catch {
		// Rotation/deletion deliberately tolerates files absent on first save.
	}
}

async function writeNativeTextChunk(
	path: string,
	data: string,
	first: boolean,
): Promise<void> {
	if (first) {
		await Filesystem.writeFile({
			path,
			directory: Directory.Data,
			data,
			encoding: Encoding.UTF8,
			recursive: true,
		});
		return;
	}
	await Filesystem.appendFile({
		path,
		directory: Directory.Data,
		data,
		encoding: Encoding.UTF8,
	});
}

async function writeTextInChunks(path: string, text: string): Promise<number> {
	if (text.length === 0) {
		await writeNativeTextChunk(path, "", true);
		return 1;
	}
	// Blob gives the string the same byte-bounded path as the primary Blob
	// payload. A character-count split is not sufficient: non-ASCII text can use
	// up to four UTF-8 bytes per JavaScript character.
	return writeBlobInChunks(path, new Blob([text]));
}

async function writeBlobInChunks(path: string, blob: Blob): Promise<number> {
	if (blob.size === 0) {
		await writeNativeTextChunk(path, "", true);
		return 1;
	}

	const decoder = new TextDecoder();
	let first = true;
	let chunks = 0;
	for (let offset = 0; offset < blob.size; offset += MIRROR_BLOB_READ_BYTES) {
		const bytes = new Uint8Array(
			await blob.slice(offset, offset + MIRROR_BLOB_READ_BYTES).arrayBuffer(),
		);
		const text = decoder.decode(bytes, { stream: true });
		if (!text) continue;
		await writeNativeTextChunk(path, text, first);
		first = false;
		chunks += 1;
	}
	const tail = decoder.decode();
	if (tail || first) {
		await writeNativeTextChunk(path, tail, first);
		chunks += 1;
	}
	return chunks;
}

async function writeJsonInChunks(path: string, json: unknown): Promise<number> {
	if (json instanceof Blob) return writeBlobInChunks(path, json);
	if (typeof json === "string") return writeTextInChunks(path, json);
	const text = JSON.stringify(json);
	if (text === undefined) throw new Error("Draft JSON is not serializable");
	return writeTextInChunks(path, text);
}

async function writeMirror(input: MirrorInput): Promise<void> {
	const ownerId = await currentOwnerId();
	if (!ownerId) return;
	noteMirrorWrite("start", input);
	const startedAt = performance.now();

	const base = draftPath(input.id);
	const metadata: NativeDraftMetadata = {
		version: 1,
		id: input.id,
		ownerId,
		updatedAt: input.updatedAt,
		thumbnail: input.thumbnail,
	};

	const [bridgeChunks] = await Promise.all([
		writeJsonInChunks(`${base}/next/drawing.json`, input.json),
		Filesystem.writeFile({
			path: `${base}/next/metadata.json`,
			directory: Directory.Data,
			data: JSON.stringify(metadata),
			encoding: Encoding.UTF8,
			recursive: true,
		}),
	]);

	await ignoreMissing(() =>
		Filesystem.rmdir({
			path: `${base}/previous`,
			directory: Directory.Data,
			recursive: true,
		}),
	);
	await ignoreMissing(() =>
		Filesystem.rename({
			from: `${base}/current`,
			to: `${base}/previous`,
			directory: Directory.Data,
		}),
	);
	await Filesystem.rename({
		from: `${base}/next`,
		to: `${base}/current`,
		directory: Directory.Data,
	});
	noteMirrorWrite("finish", input, performance.now() - startedAt, bridgeChunks);
}

/**
 * Leave a content-free breadcrumb around the native bridge call. Historical
 * ANRs have no live JS stack, so byte size + start/finish is what distinguishes
 * a bridge stall from a draw-engine stall on the next report.
 */
function noteMirrorWrite(
	state: "start" | "finish",
	input: MirrorInput,
	durationMs?: number,
	bridgeChunks?: number,
): void {
	void import("@sentry/capacitor")
		.then((Sentry) =>
			Sentry.addBreadcrumb({
				category: "draft.mirror",
				level: "info",
				message: `Native draft mirror ${state}`,
				data: {
					bytes: payloadBytes(input.json),
					bridgeChunks,
					durationMs:
						durationMs === undefined ? undefined : Math.round(durationMs),
				},
			}),
		)
		.catch(() => {
			/* diagnostics must never affect recovery persistence */
		});
}

function clearTrailing(id: string): void {
	const timer = trailingTimers.get(id);
	if (timer === undefined) return;
	clearTimeout(timer);
	trailingTimers.delete(id);
}

/** Drains whatever payload is currently newest for `id` onto the write queue. */
function flushMirror(id: string, options: { force?: boolean } = {}): void {
	clearTrailing(id);
	const input = latest.get(id);
	if (!input) return;

	// Re-checked HERE, not only when the write was scheduled. Cloud sync
	// confirms a push seconds after the local save, so by the time a trailing
	// flush comes due the copy it was going to make is usually already
	// redundant — this is where most of the mirror's cost disappears for a
	// signed-in Pro user, without weakening anyone else's backstop.
	if (!options.force && replicatedOffDevice(input)) {
		latest.delete(id);
		return;
	}

	latest.delete(id);
	lastMirroredAt.set(id, Date.now());

	const next = mirrorQueue
		.catch(() => undefined)
		.then(() => writeMirror(input))
		.catch((error) => console.warn("Native draft mirror failed:", error))
		.finally(() => {
			if (queues.get(id) === next) queues.delete(id);
		});
	mirrorQueue = next;
	queues.set(id, next);
}

export function queueNativeDraftMirror(
	input: MirrorInput,
	options: { force?: boolean } = {},
): void {
	if (!isAvailable()) return;
	// Always record the newest bytes first: a write that is already scheduled
	// should land the latest revision rather than the one that scheduled it.
	latest.set(input.id, input);

	if (options.force) {
		flushMirror(input.id, { force: true });
		return;
	}
	// Converting a multi-megabyte Blob to text and crossing the Capacitor bridge
	// used to be indivisible native work. A size-based timer could fire this in the
	// middle of long drawing sessions; a ~4 MB document landed roughly four
	// minutes later, matching the otherwise unexplained ANR window. IndexedDB is
	// already durable at this point, so retain only the newest mirror payload and
	// spend the redundant filesystem write after the canvas is gone.
	if (isDrawSessionActive()) {
		clearTrailing(input.id);
		return;
	}
	if (trailingTimers.has(input.id)) return;

	const wait = Math.max(
		0,
		(lastMirroredAt.get(input.id) ?? 0) +
			mirrorInterval(input.json) -
			Date.now(),
	);
	if (wait === 0) {
		flushMirror(input.id);
		return;
	}
	trailingTimers.set(
		input.id,
		setTimeout(() => flushMirror(input.id), wait),
	);
}

onDrawSessionChanged((active) => {
	if (postSessionTimer !== undefined) {
		clearTimeout(postSessionTimer);
		postSessionTimer = undefined;
	}
	if (active) {
		// A timer scheduled on Home must not mature after a drawing opens.
		for (const id of [...trailingTimers.keys()]) clearTrailing(id);
		return;
	}

	if (latest.size === 0) return;
	postSessionTimer = setTimeout(() => {
		postSessionTimer = undefined;
		if (isDrawSessionActive()) return;
		for (const id of [...latest.keys()]) flushMirror(id, { force: true });
	}, MIRROR_POST_SESSION_DELAY_MS);
});

export async function awaitNativeDraftMirrors(): Promise<void> {
	// Anything still sitting behind the throttle is owed to disk before the
	// caller can treat the mirror as consistent (exit paths, tests).
	for (const id of [...latest.keys()]) flushMirror(id, { force: true });
	await mirrorQueue;
}

async function readText(path: string): Promise<string> {
	const result = await Filesystem.readFile({
		path,
		directory: Directory.Data,
		encoding: Encoding.UTF8,
	});
	return String(result.data);
}

function parseMetadata(value: string): NativeDraftMetadata | null {
	try {
		const metadata = JSON.parse(value) as Partial<NativeDraftMetadata>;
		if (
			metadata.version !== 1 ||
			!metadata.id ||
			!metadata.ownerId ||
			typeof metadata.updatedAt !== "number"
		) {
			return null;
		}
		return metadata as NativeDraftMetadata;
	} catch {
		return null;
	}
}

async function readVersion(
	id: string,
	version: "current" | "previous",
	ownerId: string,
): Promise<NativeDraftRecord | null> {
	try {
		const base = draftPath(id);
		const [metadataText, json] = await Promise.all([
			readText(`${base}/${version}/metadata.json`),
			readText(`${base}/${version}/drawing.json`),
		]);
		const metadata = parseMetadata(metadataText);
		if (!metadata || metadata.id !== id || metadata.ownerId !== ownerId) {
			return null;
		}
		JSON.parse(json);
		return { ...metadata, json };
	} catch {
		return null;
	}
}

export async function readNativeDraft(
	id: string,
): Promise<NativeDraftRecord | null> {
	if (!isAvailable() || !VALID_ID.test(id)) return null;
	const ownerId = await currentOwnerId();
	if (!ownerId) return null;
	return (
		(await readVersion(id, "current", ownerId)) ??
		(await readVersion(id, "previous", ownerId))
	);
}

export async function listNativeDraftMetadata(): Promise<
	NativeDraftMetadata[]
> {
	if (!isAvailable()) return [];
	const ownerId = await currentOwnerId();
	if (!ownerId) return [];

	let directories: Awaited<ReturnType<typeof Filesystem.readdir>>["files"];
	try {
		directories = (
			await Filesystem.readdir({ path: ROOT, directory: Directory.Data })
		).files;
	} catch {
		return [];
	}

	const metadata = await Promise.all(
		directories
			.filter(
				(entry) => entry.type === "directory" && VALID_ID.test(entry.name),
			)
			.map(async (entry) => {
				const base = draftPath(entry.name);
				for (const version of ["current", "previous"] as const) {
					try {
						const parsed = parseMetadata(
							await readText(`${base}/${version}/metadata.json`),
						);
						if (parsed?.ownerId === ownerId) return parsed;
					} catch {
						// Try the prior revision.
					}
				}
				return null;
			}),
	);
	return metadata.filter((item): item is NativeDraftMetadata => !!item);
}

export async function removeNativeDraft(id: string): Promise<void> {
	if (!isAvailable() || !VALID_ID.test(id)) return;
	// Drop the throttled payload before awaiting anything: a trailing flush that
	// fired between the discard and the rmdir would rebuild the folder.
	clearTrailing(id);
	latest.delete(id);
	lastMirroredAt.delete(id);
	cloudReplicaAt.delete(id);
	await queues.get(id)?.catch(() => undefined);
	await ignoreMissing(() =>
		Filesystem.rmdir({
			path: draftPath(id),
			directory: Directory.Data,
			recursive: true,
		}),
	);
}
