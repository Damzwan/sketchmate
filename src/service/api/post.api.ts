import { request } from "./http";
import { FeedPost } from "@/types/server.types";

export interface PostUploadUrls {
	drawing: { signedUrl: string; publicUrl: string };
	image: { signedUrl: string; publicUrl: string };
	thumbnail: { signedUrl: string; publicUrl: string };
}

export async function createPost(params: {
	drawingBlob: Blob;
	imageBlob: Blob;
	thumbnailBlob: Blob;
	aspect_ratio: number;
	description: string;
}) {
	const tickets = await request<PostUploadUrls>("/post/upload-urls", {
		method: "POST",
	});

	await Promise.all([
		fetch(tickets.drawing.signedUrl, {
			method: "PUT",
			body: params.drawingBlob,
		}),
		fetch(tickets.image.signedUrl, { method: "PUT", body: params.imageBlob }),
		fetch(tickets.thumbnail.signedUrl, {
			method: "PUT",
			body: params.thumbnailBlob,
		}),
	]);

	return await request<{ post: FeedPost }>("/post/publish", {
		method: "POST",
		body: JSON.stringify({
			drawing_url: tickets.drawing.publicUrl,
			image_url: tickets.image.publicUrl,
			thumbnail_url: tickets.thumbnail.publicUrl,
			aspect_ratio: params.aspect_ratio,
			description: params.description,
		}),
	});
}

export async function fetchFeed(limit = 20) {
	return await request<{ feed: FeedPost[] }>(`/post/feed?limit=${limit}`);
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

export async function fetchPostComments(postId: string, page = 1, limit = 20) {
	return await request<{ comments: any[] }>(
		`/post/${postId}/comments?page=${page}&limit=${limit}`,
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
