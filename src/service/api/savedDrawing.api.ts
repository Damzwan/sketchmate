// api/savedDrawing.api.ts

import type { CreateSavedParams, Res, Saved } from "@/types/server.types";
import { request } from "./http";

const BASE_URL = "/saved";

export interface DeleteSavedParams {
	user_id: string;
	img_url: string;
	drawing_url: string;
}

export async function fetchSavedDrawings(userId: string): Promise<Saved[]> {
	return request<Saved[]>(`${BASE_URL}/${userId}`, {
		method: "GET",
	});
}

interface PresignedUrls {
	imgUploadUrl: string;
	imgPublicUrl: string;
	jsonUploadUrl: string;
	jsonPublicUrl: string;
}

export async function createSavedDrawing(
	params: CreateSavedParams,
): Promise<Res<Saved>> {
	const tickets = await request<PresignedUrls>(`${BASE_URL}/presigned/urls`, {
		method: "GET",
	});

	const jsonBlob = new Blob([params.drawing], { type: "application/json" });
	const imgBlob = new Blob([params.img], { type: "image/webp" });

	await Promise.all([
		fetch(tickets.imgUploadUrl, {
			method: "PUT",
			body: imgBlob,
			headers: { "Content-Type": "image/webp" },
		}),
		fetch(tickets.jsonUploadUrl, {
			method: "PUT",
			body: jsonBlob,
			headers: { "Content-Type": "application/json" },
		}),
	]);

	return request<Res<Saved>>(`${BASE_URL}/${params._id}`, {
		method: "POST",
		body: JSON.stringify({
			img: tickets.imgPublicUrl,
			drawing: tickets.jsonPublicUrl,
		}),
	});
}

// v3 deletion — DELETE /saved/:id
export async function deleteSavedDrawing(
	savedId: string,
	userId: string,
): Promise<void> {
	const query = new URLSearchParams({ user_id: userId });
	return request<void>(`${BASE_URL}/${savedId}?${query.toString()}`, {
		method: "DELETE",
	});
}

export async function deleteLegacySavedDrawing(
	params: DeleteSavedParams,
): Promise<void> {
	const LEGACY_BASE_URL = import.meta.env.VITE_BACKEND as string;

	const query = new URLSearchParams({
		user_id: params.user_id,
		img_url: params.img_url,
		drawing_url: params.drawing_url,
	});

	const response = await fetch(`${LEGACY_BASE_URL}/saved?${query.toString()}`, {
		method: "DELETE",
	});

	if (!response.ok) {
		throw new Error(
			`Failed to delete legacy saved drawing: ${response.statusText}`,
		);
	}
}
