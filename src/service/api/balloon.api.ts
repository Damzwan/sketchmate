import {
	Balloon,
	CreateBalloonPostParams,
	CreateBalloonPostRes,
	ENDPOINTS,
	Res,
} from "@/types/server.types";
import { request } from "@/service/api/http";

export async function createBalloon(
	params: CreateBalloonPostParams,
): Promise<Res<CreateBalloonPostRes>> {
	const imgFile = new File([params.img], "img.webp", { type: "image/webp" });

	const jsonString = JSON.stringify(params.drawing);
	const stream = new Blob([jsonString])
		.stream()
		.pipeThrough(new CompressionStream("gzip"));
	const compressedBlob = await new Response(stream).blob();
	const compressedFile = new File([compressedBlob], "drawing.gz", {
		type: "application/gzip",
	});

	const data = new FormData();
	data.append("img", imgFile);
	data.append("drawing", compressedFile);
	// data.append("sender", params.sender); <-- REMOVED! The backend handles this securely now.
	data.append("message", params.message);
	data.append("aspect_ratio", String(params.aspect_ratio));

	return request<Res<CreateBalloonPostRes>>(`${ENDPOINTS.balloon}`, {
		method: "POST",
		body: data,
	});
}

export async function getBalloon(params: {
	balloonId: string;
}): Promise<Res<Balloon> | null> {
	try {
		return await request<Res<Balloon>>(
			`${ENDPOINTS.balloon}/${params.balloonId}`,
			{
				method: "GET",
			},
		);
	} catch (e) {
		console.error("Failed to fetch balloon:", e);
		return null;
	}
}

export interface PublishBalloonParams {
	message: string;
	drawing_url: string;
	image_url: string;
	thumbnail_url: string;
	aspect_ratio: number;
}

export async function getBalloonUploadUrls(): Promise<any> {
	return request<any>(`${ENDPOINTS.balloon}/upload-urls`, {
		method: "POST",
	});
}

export async function publishBalloon(
	params: PublishBalloonParams,
): Promise<Res<CreateBalloonPostRes>> {
	return request<Res<CreateBalloonPostRes>>(`${ENDPOINTS.balloon}/`, {
		method: "POST",
		body: JSON.stringify(params),
	});
}

export async function fetchMyBalloons(): Promise<{ balloons: Balloon[] }> {
	return await request<{ balloons: Balloon[] }>("/balloon/mine");
}

export async function cancelBalloon(
	balloonId: string,
): Promise<{ success: boolean }> {
	return await request<{ success: boolean }>(`/balloon/${balloonId}/cancel`, {
		method: "POST",
	});
}
