import {
	CommentRes,
	ENDPOINTS,
	GetInboxCommentsRes,
	GetInboxRes,
} from "@/types/server.types";

export interface GetInboxV2Params {
	user_id: string;
	limit: number;
	lastDate?: string;
}

export interface GetInboxCommentsParams {
	inbox_id: string;
	limit: number;
	beforeDate?: string;
}

const baseUrl = import.meta.env.VITE_BACKEND as string;
const API_URL = `${baseUrl}/v2/inbox/legacy`;

export async function getInboxV2(
	params: GetInboxV2Params,
): Promise<GetInboxRes> {
	const q = new URLSearchParams({
		user_id: params.user_id,
		limit: String(params.limit),
	});
	if (params.lastDate) q.set("lastDate", params.lastDate);

	const res = await fetch(`${API_URL}?${q.toString()}`);
	if (!res.ok) throw new Error("getInboxV2 failed");
	return res.json();
}

export async function getInboxComments(
	params: GetInboxCommentsParams,
): Promise<GetInboxCommentsRes> {
	const q = new URLSearchParams({
		inbox_id: params.inbox_id,
		limit: String(params.limit),
	});
	if (params.beforeDate) q.set("beforeDate", params.beforeDate);

	const res = await fetch(`${API_URL}/comments?${q.toString()}`);
	if (!res.ok) throw new Error("getInboxComments failed");
	return res.json();
}

export interface PutInboxCommentParams {
	inbox_id: string;
	sender: string;
	message: string;
	followers: string[];
	name: string;
	img: string;
}

export async function putInboxComment(
	params: PutInboxCommentParams,
): Promise<CommentRes> {
	const res = await fetch(`${API_URL}/comment`, {
		method: "PUT",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(params),
	});
	if (!res.ok) throw new Error("putInboxComment failed");
	return res.json();
}
