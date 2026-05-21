import { request } from "./http";
import {
	Mate,
	FeedPost,
	UserProfileData,
	UpdateProfilePayload,
	NetworkUser,
	PublicUser,
	FullUser,
} from "@/types/server.types";

// --- PROFILE MANAGEMENT ---

export async function fetchUserProfile(userId: string) {
	return await request<UserProfileData>(`/user/${userId}/profile`);
}

export async function updateProfile(payload: UpdateProfilePayload) {
	return await request("/user/profile", {
		method: "PUT",
		body: JSON.stringify(payload),
	});
}

export async function uploadProfileImg(blob: Blob, previousImageUrl?: string) {
	const formData = new FormData();
	formData.append("img", blob, "profile.webp");
	if (previousImageUrl) {
		formData.append("previousImage", previousImageUrl);
	}

	return await request<{ url: string }>("/user/upload-image", {
		method: "POST",
		body: formData,
	});
}

// --- GLOBAL ACTIONS ---

export async function searchUsers(query: string) {
	return await request<Mate[]>(`/user/search?q=${encodeURIComponent(query)}`);
}

export async function fetchOnlineFriends() {
	// Returns hydrated NetworkUser objects for the "Online Now" bar
	return await request<NetworkUser[]>("/user/online-friends");
}

export async function fetchUserPosts(userId: string, page = 1, limit = 20) {
	return await request<{ posts: FeedPost[] }>(
		`/user/${userId}/posts?page=${page}&limit=${limit}`,
	);
}

export async function reportUserContent(
	targetId: string,
	type: "post" | "comment" | "user",
	reason: string,
) {
	return await request("/report", {
		method: "POST",
		body: JSON.stringify({ target_id: targetId, target_type: type, reason }),
	});
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

export async function getFullProfile(userId: string): Promise<{
	profile: FullUser & { relationship?: any; chat_status?: string };
	posts: any[];
}> {
	return await request<{
		profile: FullUser & { relationship?: any; chat_status?: string };
		posts: any[];
	}>(`/user/${userId}/profile`);
}
