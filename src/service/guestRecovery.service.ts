import { Directory, Encoding, Filesystem } from "@capacitor/filesystem";
import { Preferences } from "@capacitor/preferences";
import { isNative } from "@/helper/platform.helper";
import {
	registerGuestRecovery,
	revokeGuestRecovery,
} from "@/service/api/guestRecovery.api";
import { LocalStorage } from "@/types/storage.types";

const RECOVERY_PATH = "SketchMate/recovery.json";

let ensureInFlight:
	| { guestUid: string; request: Promise<StoredGuestRecovery> }
	| undefined;

export interface StoredGuestRecovery {
	version: 1;
	credentialId: string;
	secret: string;
	guestUid: string;
	profileName: string;
	profileImage?: string;
	updatedAt: number;
}

function parseRecovery(value: string | null): StoredGuestRecovery | null {
	if (!value) return null;
	try {
		const parsed = JSON.parse(value) as Partial<StoredGuestRecovery>;
		if (
			parsed.version !== 1 ||
			!parsed.credentialId ||
			!parsed.secret ||
			!parsed.guestUid
		) {
			return null;
		}
		return parsed as StoredGuestRecovery;
	} catch {
		return null;
	}
}

export async function readGuestRecovery(): Promise<StoredGuestRecovery | null> {
	if (isNative()) {
		try {
			const result = await Filesystem.readFile({
				path: RECOVERY_PATH,
				directory: Directory.Data,
				encoding: Encoding.UTF8,
			});
			const fromFile = parseRecovery(String(result.data));
			if (fromFile) return fromFile;
		} catch {
			// First launch or a filesystem implementation without a prior record.
		}
	}

	const { value } = await Preferences.get({ key: LocalStorage.guestRecovery });
	return parseRecovery(value);
}

export async function writeGuestRecovery(
	recovery: StoredGuestRecovery,
): Promise<void> {
	const data = JSON.stringify(recovery);
	await Preferences.set({ key: LocalStorage.guestRecovery, value: data });
	if (!isNative()) return;

	await Filesystem.writeFile({
		path: RECOVERY_PATH,
		directory: Directory.Data,
		data,
		encoding: Encoding.UTF8,
		recursive: true,
	});
}

export async function clearGuestRecovery(): Promise<void> {
	await Preferences.remove({ key: LocalStorage.guestRecovery });
	if (!isNative()) return;
	try {
		await Filesystem.deleteFile({
			path: RECOVERY_PATH,
			directory: Directory.Data,
		});
	} catch {
		// Already absent.
	}
}

async function createOrRefreshGuestRecovery(params: {
	guestUid: string;
	profileName: string;
	profileImage?: string;
}): Promise<StoredGuestRecovery> {
	const existing = await readGuestRecovery();
	if (existing?.guestUid === params.guestUid) {
		if (
			existing.profileName !== params.profileName ||
			existing.profileImage !== params.profileImage
		) {
			existing.profileName = params.profileName;
			existing.profileImage = params.profileImage;
			existing.updatedAt = Date.now();
			await writeGuestRecovery(existing);
		}
		return existing;
	}

	const registration = await registerGuestRecovery();
	const recovery: StoredGuestRecovery = {
		version: 1,
		...registration,
		profileName: params.profileName || registration.profileName,
		profileImage: params.profileImage,
		updatedAt: Date.now(),
	};
	await writeGuestRecovery(recovery);
	return recovery;
}

export function ensureGuestRecovery(params: {
	guestUid: string;
	profileName: string;
	profileImage?: string;
}): Promise<StoredGuestRecovery> {
	// Auth bootstrap and an immediate logout can request enrollment together.
	// Sharing the request prevents two registrations from rotating each other and
	// leaving the device with a stale credential.
	if (ensureInFlight?.guestUid === params.guestUid) {
		return ensureInFlight.request;
	}

	const previousRequest = ensureInFlight?.request.catch(() => undefined);
	const request = (
		previousRequest
			? previousRequest.then(() => createOrRefreshGuestRecovery(params))
			: createOrRefreshGuestRecovery(params)
	).finally(() => {
		if (ensureInFlight?.request === request) ensureInFlight = undefined;
	});
	ensureInFlight = { guestUid: params.guestUid, request };
	return request;
}

export async function finalizeGuestRecovery(): Promise<void> {
	// Do not let an enrollment that started just before account linking recreate
	// the local recovery proof after it has been cleared.
	await ensureInFlight?.request.catch(() => undefined);
	const recovery = await readGuestRecovery();
	await clearGuestRecovery();
	if (recovery) {
		void revokeGuestRecovery(recovery.credentialId).catch((error) =>
			console.warn("Could not revoke guest recovery credential:", error),
		);
	}
}
