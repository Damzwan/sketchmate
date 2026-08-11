import { Capacitor } from "@capacitor/core";
import { Directory, Encoding, Filesystem } from "@capacitor/filesystem";
import { Preferences } from "@capacitor/preferences";
import { LocalStorage } from "@/types/storage.types";

const ROOT = "SketchMate/drafts";
const VALID_ID = /^[a-zA-Z0-9_-]{1,128}$/;

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
let mirrorQueue: Promise<void> = Promise.resolve();

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

async function jsonText(json: unknown): Promise<string> {
	if (json instanceof Blob) return json.text();
	if (typeof json === "string") return json;
	return JSON.stringify(json);
}

async function writeMirror(input: MirrorInput): Promise<void> {
	const ownerId = await currentOwnerId();
	if (!ownerId) return;

	const base = draftPath(input.id);
	const metadata: NativeDraftMetadata = {
		version: 1,
		id: input.id,
		ownerId,
		updatedAt: input.updatedAt,
		thumbnail: input.thumbnail,
	};

	await Promise.all([
		Filesystem.writeFile({
			path: `${base}/next/drawing.json`,
			directory: Directory.Data,
			data: await jsonText(input.json),
			encoding: Encoding.UTF8,
			recursive: true,
		}),
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
}

export function queueNativeDraftMirror(input: MirrorInput): void {
	if (!isAvailable()) return;
	const next = mirrorQueue
		.catch(() => undefined)
		.then(() => writeMirror(input))
		.catch((error) => console.warn("Native draft mirror failed:", error))
		.finally(() => {
			if (queues.get(input.id) === next) queues.delete(input.id);
		});
	mirrorQueue = next;
	queues.set(input.id, next);
}

export async function awaitNativeDraftMirrors(): Promise<void> {
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
	await queues.get(id)?.catch(() => undefined);
	await ignoreMissing(() =>
		Filesystem.rmdir({
			path: draftPath(id),
			directory: Directory.Data,
			recursive: true,
		}),
	);
}
