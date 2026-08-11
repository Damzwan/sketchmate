import { request } from "./http";

const BASE_URL = "/drafts";

export interface CloudDraftSummary {
	draft_id: string;
	updated_at: number;
	bytes: number;
	/** CDN url of the 640px WebP preview. Empty when the push had no thumbnail. */
	thumbnail: string;
	/** CDN url of the gzipped document. */
	drawing: string;
}

export interface CloudDraftPage {
	drafts: CloudDraftSummary[];
	deleted: string[];
	cursor: number;
	limit: number;
	used: number;
}

export interface CloudDraftUploadTicket {
	drawingUploadUrl: string;
	drawingKey: string;
	thumbnailUploadUrl: string;
	thumbnailKey: string;
}

/** Thrown for the specific server refusals the engine reacts to differently. */
export class CloudDraftRejection extends Error {
	constructor(public code: string) {
		super(code);
	}
}

const REJECTIONS = new Set([
	"pro_required",
	"stale_draft",
	"draft_limit_reached",
	"draft_too_large",
]);

async function rejectable<T>(run: () => Promise<T>): Promise<T> {
	try {
		return await run();
	} catch (error) {
		// `request` throws with the server's `error` code as the message, so the
		// deliberate refusals are recognisable without a second response shape.
		const message = error instanceof Error ? error.message : String(error);
		if (REJECTIONS.has(message)) throw new CloudDraftRejection(message);
		throw error;
	}
}

export function fetchCloudDrafts(since: number): Promise<CloudDraftPage> {
	return rejectable(() =>
		request<CloudDraftPage>(`${BASE_URL}?since=${since}`, {
			method: "GET",
			// This is an authenticated, incremental synchronization endpoint. A
			// cached empty page makes subsequent checks miss drafts until the WebView
			// reloads and revalidates its HTTP cache.
			cache: "no-store",
		}),
	);
}

export function createCloudDraftTicket(
	draftId: string,
): Promise<CloudDraftUploadTicket> {
	return rejectable(() =>
		request<CloudDraftUploadTicket>(`${BASE_URL}/${draftId}/upload-url`, {
			method: "POST",
		}),
	);
}

export function commitCloudDraft(
	draftId: string,
	body: {
		updated_at: number;
		drawing_key: string;
		thumbnail_key: string;
		bytes: number;
	},
): Promise<CloudDraftSummary> {
	return rejectable(() =>
		request<CloudDraftSummary>(`${BASE_URL}/${draftId}`, {
			method: "PUT",
			body: JSON.stringify(body),
		}),
	);
}

export function deleteCloudDraft(
	draftId: string,
	deletedAt: number,
): Promise<void> {
	return rejectable(() =>
		request<void>(`${BASE_URL}/${draftId}?deleted_at=${deletedAt}`, {
			method: "DELETE",
		}),
	);
}
