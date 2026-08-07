// service/api/notification.api.ts

import type { Notification } from "@/types/server.types";
import { request } from "./http";

// ─── Feed ───────────────────────────────────────────────────────────────

export interface FetchNotificationsParams {
	before?: string; // ISO date for pagination
	limit?: number;
}

export interface FetchNotificationsRes {
	data: Notification[];
	hasMore: boolean;
}

export async function fetchNotifications(
	params: FetchNotificationsParams = {},
): Promise<FetchNotificationsRes> {
	const query = new URLSearchParams();
	if (params.before) query.set("before", params.before);
	if (params.limit) query.set("limit", String(params.limit));
	const suffix = query.toString() ? `?${query.toString()}` : "";

	return await request<FetchNotificationsRes>(`/notification${suffix}`);
}

// ─── Counts ─────────────────────────────────────────────────────────────

export interface NotificationCounts {
	unseen: number;
	unread: number;
}

export async function fetchNotificationCounts(): Promise<NotificationCounts> {
	return await request<NotificationCounts>("/notification/counts");
}

// ─── Read state ─────────────────────────────────────────────────────────

export async function markAllSeen(): Promise<void> {
	await request<void>("/notification/seen", { method: "POST" });
}

export async function markRead(notificationId: string): Promise<void> {
	await request<void>(`/notification/${notificationId}/read`, {
		method: "POST",
	});
}

export async function deleteNotification(
	notificationId: string,
): Promise<void> {
	await request<void>(`/notification/${notificationId}`, {
		method: "DELETE",
	});
}

export async function markAllRead(): Promise<void> {
	await request<void>("/notification/read-all", { method: "POST" });
}
