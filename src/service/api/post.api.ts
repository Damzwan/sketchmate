import { request } from "./http";
import { FeedPost } from "@/types/server.types";
import type { PresignedUploadBundle } from "@/draw/sharing/shareDrawings";

export interface PublishPostParams {
	drawing_url: string;
	image_url: string;
	thumbnail_url: string;
	aspect_ratio: number;
	description: string;
	enable_comments?: boolean;
	enable_remix?: boolean;
}

export async function getPostUploadUrls(): Promise<PresignedUploadBundle> {
	return await request<PresignedUploadBundle>("/post/upload-urls", {
		method: "POST",
	});
}

export async function publishPost(
	params: PublishPostParams,
): Promise<{ post: FeedPost }> {
	return await request<{ post: FeedPost }>("/post/publish", {
		method: "POST",
		body: JSON.stringify(params),
	});
}

export type FeedTab = "for_you" | "mates" | "latest";

export async function fetchFeed(tab: FeedTab = "for_you", limit = 20) {
	return await request<{ feed: FeedPost[]; tab: FeedTab }>(
		`/post/feed?tab=${tab}&limit=${limit}`,
	);
}

export async function toggleReaction(
	postId: string,
	reactionType: string | null,
) {
	return await request<{ current_reaction: string | null }>(
		`/post/${postId}/react`,
		{
			method: "POST",
			body: JSON.stringify({ reaction_type: reactionType }),
		},
	);
}

export async function postComment(postId: string, message: string) {
	return await request<{ comment: any }>(`/post/${postId}/comment`, {
		method: "POST",
		body: JSON.stringify({ message }),
	});
}

export async function fetchPostComments(
	postId: string,
	limit = 20,
	beforeDate?: string,
) {
	const query = new URLSearchParams({ limit: limit.toString() });

	if (beforeDate) {
		query.append("beforeDate", beforeDate);
	}

	return await request<{ comments: any[]; hasMore: boolean }>(
		`/post/${postId}/comments?${query.toString()}`,
		{
			method: "GET",
		},
	);
}

export async function deletePost(postId: string) {
	return await request<{ message: string }>(`/post/${postId}`, {
		method: "DELETE",
	});
}

export async function logPostViews(postIds: string[]) {
	return await request<{ success: boolean }>("/post/views", {
		method: "POST",
		body: JSON.stringify({ post_ids: postIds }),
	});
}

export async function deleteComment(postId: string, commentId: string) {
	return await request<{ message: string }>(
		`/post/${postId}/comment/${commentId}`,
		{
			method: "DELETE",
		},
	);
}

export async function fetchPost(postId: string) {
	return await request<{ post: FeedPost }>(`/post/${postId}`);
}
