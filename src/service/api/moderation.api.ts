import { request } from "./http";
import type {
	ReportReason,
	SubmitReportParams,
	SubmitReportRes,
	UserStandingData,
} from "@/types/server.types";

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
) {
	return submitReport({
		target_id: user_id,
		target_type: "user",
		reason,
		details,
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
