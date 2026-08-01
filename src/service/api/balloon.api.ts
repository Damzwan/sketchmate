import { request } from "./http";
import type { PresignedUploadBundle } from "@/draw/sharing/shareDrawings";
import type {
	Balloon,
	CreateBalloonPostRes,
	InboxItem,
	Mate,
	Res,
} from "@/types/server.types";

// ─── Create (presigned URL flow) ────────────────────────────────────────

export interface PublishBalloonParams {
	message: string;
	drawing_url: string;
	image_url: string;
	thumbnail_url: string;
	aspect_ratio: number;
}

export async function getBalloonUploadUrls(): Promise<PresignedUploadBundle> {
	return await request<PresignedUploadBundle>("/balloon/upload-urls", {
		method: "POST",
	});
}

export async function publishBalloon(
	params: PublishBalloonParams,
): Promise<Res<CreateBalloonPostRes>> {
	return await request<Res<CreateBalloonPostRes>>("/balloon/", {
		method: "POST",
		body: JSON.stringify(params),
	});
}

// ─── List / Cancel (modal management) ───────────────────────────────────

export async function fetchMyBalloons(): Promise<{ balloons: Balloon[] }> {
	return await request<{ balloons: Balloon[] }>("/balloon/mine");
}

export async function cancelBalloon(
	balloonId: string,
): Promise<{ cancelled: true }> {
	return await request<{ cancelled: true }>(`/balloon/${balloonId}/cancel`, {
		method: "POST",
	});
}

// ─── Accept / Refuse (incoming balloon actions) ─────────────────────────

export interface AcceptBalloonRes {
	mate: Mate;
	acceptorId: string;
	inboxItem: InboxItem;
}

export async function acceptBalloon(params: {
	balloonId: string;
	senderId: string;
}): Promise<AcceptBalloonRes> {
	return await request<AcceptBalloonRes>(
		`/balloon/${params.balloonId}/accept`,
		{
			method: "POST",
			body: JSON.stringify({ sender_id: params.senderId }),
		},
	);
}

export async function refuseBalloon(params: {
	balloonId: string;
	senderId: string;
	disable?: boolean;
}): Promise<{ refused: true }> {
	return await request<{ refused: true }>(
		`/balloon/${params.balloonId}/refuse`,
		{
			method: "POST",
			body: JSON.stringify({
				sender_id: params.senderId,
				disable: !!params.disable,
			}),
		},
	);
}

export async function triageBalloons(): Promise<{ delivered: boolean }> {
	return await request<{ delivered: boolean }>("/balloon/triage", {
		method: "POST",
	});
}
