import type { PublicLobby } from "@/draw/sync/session.store";
import {
	type ChangeUserNameParams,
	type ChatStatus,
	type CreateEmblemParams,
	type CreateSavedParams,
	type CreateStickerParams,
	type DeleteEmblemParams,
	type DeleteProfileImgParams,
	type DeleteSavedParams,
	type DeleteStickerParams,
	ENDPOINTS,
	type FeedPost,
	type GetUserParams,
	type GetUserRes,
	type Mate,
	type NetworkUser,
	type OnLoginEventParams,
	type PresenceStatus,
	type PublicUser,
	type RegisterNotificationParams,
	type Res,
	type Saved,
	type SearchMateParams,
	type UnRegisterNotificationParams,
	type UpdateProfilePayload,
	type UpdateUserParams,
	type UserRelationship,
} from "@/types/server.types";
import { request } from "./http";

// --- PROFILE MANAGEMENT ---
export async function updateProfile(payload: UpdateProfilePayload) {
	return await request("/user/profile", {
		method: "PUT",
		body: JSON.stringify(payload),
	});
}

export async function prepareChatBackground(
	sourceType: "inbox" | "post",
	sourceId: string,
) {
	return await request<{ url: string }>("/user/chat-background", {
		method: "PUT",
		body: JSON.stringify({ source_type: sourceType, source_id: sourceId }),
	});
}

export async function confirmChatBackground(
	sourceType: "inbox" | "post",
	sourceId: string,
) {
	return await request<{ url: string }>("/user/chat-background/confirm", {
		method: "POST",
		body: JSON.stringify({ source_type: sourceType, source_id: sourceId }),
	});
}

export async function clearChatBackground() {
	return await request<{ success: boolean }>("/user/chat-background", {
		method: "DELETE",
	});
}

export async function uploadProfileImg(
	blob: Blob,
	previousImageUrl?: string,
	mimeType = "image/webp",
) {
	const formData = new FormData();
	const extension = mimeType === "image/gif" ? "gif" : "webp";

	formData.append("img", blob, `profile.${extension}`);
	if (previousImageUrl) {
		formData.append("previousImage", previousImageUrl);
	}

	return await request<{ url: string }>("/user/upload-image", {
		method: "POST",
		body: formData,
	});
}

// --- TITLES (engagement unlocks) ---

/** Submit feedback; the backend grants the Contributor title on receipt. */
export async function submitFeedback(payload: { message: string }) {
	return await request<{ granted: string[] }>("/user/titles/feedback", {
		method: "POST",
		body: JSON.stringify(payload),
	});
}

// --- GLOBAL ACTIONS ---

export async function searchUsers(query: string) {
	return await request<Mate[]>(`/user/search?q=${encodeURIComponent(query)}`);
}

/**
 * Ids of mates currently connected, for the "Online Now" bar. Bare id strings,
 * not hydrated users — the endpoint returns `onlineIds` directly. This was
 * declared as `NetworkUser[]` and the caller cast it away with `as any`; the
 * ids are resolved through `userCache` on the client instead.
 */
export async function fetchOnlineFriends(): Promise<string[]> {
	return await request<string[]>("/user/online-friends");
}

export async function updatePresenceStatus(status: PresenceStatus): Promise<{
	presence_status: PresenceStatus;
	presence_invisible: boolean;
}> {
	return await request<{
		presence_status: PresenceStatus;
		presence_invisible: boolean;
	}>("/user/presence", {
		method: "PUT",
		body: JSON.stringify({ status }),
	});
}

export async function fetchUserPosts(userId: string, page = 1, limit = 20) {
	return await request<{ posts: FeedPost[] }>(
		`/user/${userId}/posts?page=${page}&limit=${limit}`,
	);
}

export async function getPartialUsers(ids: string[]): Promise<PublicUser[]> {
	if (!ids.length) return [];

	const queryParams = new URLSearchParams({ _ids: ids.join(",") });

	return await request<PublicUser[]>(
		`/user/public_users?${queryParams.toString()}`,
		{
			method: "GET",
		},
	);
}

export interface FullProfileRes {
	profile: PublicUser & {
		relationship?: UserRelationship;
		chat_status?: ChatStatus;
	};
	posts: FeedPost[];
}

export async function getFullProfile(userId: string): Promise<FullProfileRes> {
	return await request<FullProfileRes>(`/user/${userId}/profile`);
}

export async function createSaved(
	params: CreateSavedParams,
): Promise<Res<Saved>> {
	const jsonBlob = new Blob([params.drawing], { type: "application/json" });
	const jsonFile = new File([jsonBlob], "drawing.json", {
		type: "application/json",
	});
	const imgFile = new File([params.img], "img.webp", { type: "image/webp" });

	const data = new FormData();
	data.append("img", imgFile);
	data.append("drawing", jsonFile);

	return request<Res<Saved>>(`${ENDPOINTS.saved}/${params._id}`, {
		method: "POST",
		body: data,
	});
}

export async function deleteSaved(params: DeleteSavedParams): Promise<void> {
	const query = new URLSearchParams({
		user_id: params.user_id,
		drawing_url: params.drawing_url,
		img_url: params.img_url,
	});
	return request<void>(`${ENDPOINTS.saved}?${query.toString()}`, {
		method: "DELETE",
	});
}

export async function createSticker(
	params: CreateStickerParams,
): Promise<Res<string>> {
	const data = new FormData();
	data.append("file", params.img);

	return request<Res<string>>(`${ENDPOINTS.sticker}/${params._id}`, {
		method: "POST",
		body: data,
	});
}

export async function deleteSticker(
	params: DeleteStickerParams,
): Promise<void> {
	const query = new URLSearchParams({
		user_id: params.user_id,
		sticker_url: params.sticker_url,
	});
	return request<void>(`${ENDPOINTS.sticker}?${query.toString()}`, {
		method: "DELETE",
	});
}

export async function createEmblem(
	params: CreateEmblemParams,
): Promise<Res<string>> {
	const data = new FormData();
	data.append("file", params.img);

	return request<Res<string>>(`${ENDPOINTS.emblem}/${params._id}`, {
		method: "POST",
		body: data,
	});
}

export async function deleteEmblem(params: DeleteEmblemParams): Promise<void> {
	const query = new URLSearchParams({
		user_id: params.user_id,
		emblem_url: params.emblem_url,
	});
	return request<void>(`${ENDPOINTS.emblem}?${query.toString()}`, {
		method: "DELETE",
	});
}

export async function getUser(params: GetUserParams): Promise<Res<GetUserRes>> {
	const query = new URLSearchParams({ auth_id: params.auth_id });
	if (params._id) query.append("_id", params._id);

	return request<Res<GetUserRes>>(`${ENDPOINTS.user}?${query.toString()}`, {
		method: "GET",
	});
}

export async function subscribe(
	params: RegisterNotificationParams,
): Promise<Res<void>> {
	return request<Res<void>>(`${ENDPOINTS.user}/subscribe`, {
		method: "PUT",
		body: JSON.stringify(params),
	});
}

export async function unsubscribe(
	params: UnRegisterNotificationParams,
): Promise<Res<void>> {
	return request<Res<void>>(`${ENDPOINTS.user}/unsubscribe`, {
		method: "PUT",
		body: JSON.stringify(params),
	});
}

export async function changeUserName(
	params: ChangeUserNameParams,
): Promise<Res<void>> {
	return request<Res<void>>(ENDPOINTS.user, {
		method: "PUT",
		body: JSON.stringify(params),
	});
}

export async function onLoginEvent(params: OnLoginEventParams): Promise<void> {
	return request<void>(`${ENDPOINTS.user}/login`, {
		method: "PUT",
		body: JSON.stringify(params),
	});
}

/**
 * Report this device to the ban-evasion check. Fire-and-forget by design: the
 * server answers `recalled` only so we stop retrying, and any resulting
 * restriction arrives over the normal moderation:strike socket event.
 */
export async function registerDevice(params: {
	device_id: string;
	platform: "android" | "ios";
}): Promise<{ recorded: boolean; recalled: boolean }> {
	return request<{ recorded: boolean; recalled: boolean }>(
		`${ENDPOINTS.user}/device`,
		{
			method: "POST",
			body: JSON.stringify(params),
		},
	);
}

export async function updateUser(params: UpdateUserParams): Promise<Res<void>> {
	return request<Res<void>>(`${ENDPOINTS.user}/update`, {
		method: "PUT",
		body: JSON.stringify(params),
	});
}

export async function updateUserTimezone(
	timezone: string,
): Promise<{ timezone: string }> {
	return request<{ timezone: string }>(`${ENDPOINTS.user}/timezone`, {
		method: "PUT",
		body: JSON.stringify({ timezone }),
	});
}

export async function searchMate(
	params: SearchMateParams,
): Promise<Res<Mate[]>> {
	const query = new URLSearchParams({
		mateName: params.mateName,
		user_id: params.user_id,
	});
	return request<Res<Mate[]>>(
		`${ENDPOINTS.user}/search_mate?${query.toString()}`,
		{
			method: "GET",
		},
	);
}

export async function deleteProfileImg(
	params: DeleteProfileImgParams,
): Promise<void> {
	return request<void>(
		`${ENDPOINTS.user}/img/${params._id}?stockImage=${params.stock_img}`,
		{
			method: "DELETE",
		},
	);
}

export async function fetchPublicLobbies(): Promise<PublicLobby[]> {
	return request<PublicLobby[]>(`${ENDPOINTS.user}/lobbies`, {
		method: "GET",
	});
}

export interface RecordEngagementActionResponse {
	should_prompt: boolean;
}

export async function recordEngagementAction(): Promise<RecordEngagementActionResponse> {
	return request<RecordEngagementActionResponse>(
		`${ENDPOINTS.user}/engagement/action`,
		{
			method: "POST",
		},
	);
}

export async function setFeedbackOptOut(opted_out: boolean): Promise<void> {
	return request<void>(`${ENDPOINTS.user}/engagement/opt-out`, {
		method: "PUT",
		body: JSON.stringify({ opted_out }),
	});
}
