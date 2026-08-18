import type { PresignedUploadBundle } from "@/draw/sharing/shareDrawings";
import type {
	BasePostComment,
	FeedPost,
	HydratedPostComment,
	QuotaState,
} from "@/types/server.types";
import { request } from "./http";

export interface PublishPostParams {
	drawing_url: string;
	image_url: string;
	thumbnail_url: string;
	aspect_ratio: number;
	description: string;
	enable_comments?: boolean;
	enable_remix?: boolean;
	/**
	 * The post this drawing was started from. Only the id travels — the server
	 * reads the author off the origin, so this can't be used to credit someone
	 * the drawing didn't actually come from.
	 */
	remix_of_post_id?: string;
	/**
	 * Peers who drew on this canvas in a shared room. The server re-checks every
	 * id against the user collection and caps the list before storing it.
	 */
	collaborator_ids?: string[];
	/** Shoutouts picked in the composer. Verified and capped server-side. */
	mention_ids?: string[];
}

/**
 * Remove your own name from someone else's post. Idempotent — a tag that is
 * already gone reports success.
 */
export async function removeMyMention(
	postId: string,
): Promise<{ removed: boolean }> {
	return await request<{ removed: boolean }>(`/post/${postId}/mention`, {
		method: "DELETE",
	});
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
	return await request<{ comment: BasePostComment }>(
		`/post/${postId}/comment`,
		{
			method: "POST",
			body: JSON.stringify({ message }),
		},
	);
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

	return await request<{ comments: HydratedPostComment[]; hasMore: boolean }>(
		`/post/${postId}/comments?${query.toString()}`,
		{
			method: "GET",
		},
	);
}

export async function deletePost(postId: string) {
	return await request<{ message: string; post_quota?: QuotaState }>(
		`/post/${postId}`,
		{
			method: "DELETE",
		},
	);
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

/**
 * Bookmark a post. Idempotent server-side, so the caller never has to know
 * whether it was already saved.
 */
export async function savePost(postId: string) {
	return await request<{ saved: true; created: boolean }>(
		`/post/${postId}/save`,
		{ method: "POST" },
	);
}

/** Remove a bookmark. Also idempotent. */
export async function unsavePost(postId: string) {
	return await request<{ saved: false; removed: boolean }>(
		`/post/${postId}/save`,
		{ method: "DELETE" },
	);
}

/**
 * A page of your saved posts, newest save first.
 *
 * @param before cursor from the previous page's `nextCursor` — the last
 * BOOKMARK's date. Cursor rather than offset because unsaving is what people do
 * on this page, and a shrinking list makes an offset skip rows.
 */
export async function fetchSavedPosts(limit = 20, before?: string) {
	const query = new URLSearchParams({ limit: limit.toString() });
	if (before) query.append("before", before);

	return await request<{
		posts: FeedPost[];
		nextCursor: string | null;
		hasMore: boolean;
	}>(`/post/saved?${query.toString()}`);
}
