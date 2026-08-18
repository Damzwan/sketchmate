import type {
	ReportReason,
	SubmitReportParams,
	SubmitReportRes,
	UserStandingData,
} from "@/types/server.types";
import { request } from "./http";

export async function submitReport(payload: SubmitReportParams) {
	return await request<SubmitReportRes>("/moderation", {
		method: "POST",
		body: JSON.stringify(payload),
	});
}

export async function getStanding() {
	return await request<UserStandingData>("/moderation/standing");
}

export function reportPost(
	post_id: string,
	reason: ReportReason,
	details?: string,
) {
	return submitReport({
		target_id: post_id,
		target_type: "post",
		reason,
		details,
	});
}

export function reportComment(
	comment_id: string,
	reason: ReportReason,
	details?: string,
) {
	return submitReport({
		target_id: comment_id,
		target_type: "comment",
		reason,
		details,
	});
}

export function reportBalloon(
	balloon_id: string,
	reason: ReportReason,
	details?: string,
) {
	return submitReport({
		target_id: balloon_id,
		target_type: "balloon",
		reason,
		details,
	});
}

export function reportUser(
	user_id: string,
	reason: ReportReason,
	details?: string,
	context_room_id?: string,
) {
	return submitReport({
		target_id: user_id,
		target_type: "user",
		reason,
		details,
		context_room_id,
	});
}

export function reportDmMessage(
	message_id: string,
	reason: ReportReason,
	details?: string,
) {
	return submitReport({
		target_id: message_id,
		target_type: "dm_message",
		reason,
		details,
	});
}

export function reportInboxDrawing(
	inbox_id: string,
	reason: ReportReason,
	details?: string,
) {
	return submitReport({
		target_id: inbox_id,
		target_type: "inbox_drawing",
		reason,
		details,
	});
}

/**
 * A shared reference is identified by the uuid its owner's client made, and it
 * exists nowhere but the live room — so the room id is mandatory. The server
 * reads the image and its real author out of that room's state; both would be
 * unverifiable coming from here.
 */
export function reportLobbyReference(
	reference_id: string,
	room_id: string,
	reason: ReportReason,
	details?: string,
) {
	return submitReport({
		target_id: reference_id,
		target_type: "lobby_reference",
		reason,
		details,
		context_room_id: room_id,
	});
}

export function reportInboxComment(
	comment_id: string,
	reason: ReportReason,
	details?: string,
) {
	return submitReport({
		target_id: comment_id,
		target_type: "inbox_comment",
		reason,
		details,
	});
}
