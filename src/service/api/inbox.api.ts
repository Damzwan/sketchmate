import {
	ENDPOINTS,
	GetInboxRes,
	InboxItem,
	Mate,
	RemoveFromInboxParams,
	Res,
	SeeInboxParams,
} from "@/types/server.types";
import { request } from "@/service/api/http";

export interface PublishInboxItemParams {
	followers: string[];
	drawing_url: string;
	image_url: string;
	thumbnail_url: string;
	aspect_ratio: number;
}

export async function getInbox(params: any): Promise<GetInboxRes> {
	const query: Record<string, string> = {
		user_id: params.user_id,
		limit: params.limit.toString(),
	};

	if (params.lastDate) {
		query.lastDate = new Date(params.lastDate).toISOString();
	}

	const queryString = new URLSearchParams(query).toString();

	return request<GetInboxRes>(`/inbox?${queryString}`, {
		method: "GET",
	});
}

export async function getSingleInboxItem(
	inboxId: string,
): Promise<{ inboxItem: InboxItem; userInfo: Mate[] }> {
	return request<{ inboxItem: InboxItem; userInfo: Mate[] }>(
		`${ENDPOINTS.inbox}/item/${inboxId}`,
		{
			method: "GET",
		},
	);
}

export async function syncInboxItems(sinceDate: string): Promise<GetInboxRes> {
	return request<GetInboxRes>(
		`${ENDPOINTS.inbox}/sync?sinceDate=${sinceDate}`,
		{
			method: "GET",
		},
	);
}

export async function removeFromInbox(
	params: RemoveFromInboxParams,
): Promise<Res<void>> {
	return request<Res<void>>(`${ENDPOINTS.inbox}/${params.inbox_id}`, {
		method: "DELETE",
	});
}

export async function seeInboxItem(params: SeeInboxParams): Promise<void> {
	const query = new URLSearchParams({ user_id: params.user_id });
	return request<void>(
		`${ENDPOINTS.inbox}/see/${params.inbox_id}?${query.toString()}`,
		{
			method: "POST",
		},
	);
}

export async function getInboxUploadUrls(): Promise<any> {
	return request<any>(`${ENDPOINTS.inbox}/upload-urls`, {
		method: "POST",
	});
}

export async function publishInboxItem(
	params: PublishInboxItemParams,
): Promise<{ inbox_item: InboxItem }> {
	return request<{ inbox_item: InboxItem }>(`${ENDPOINTS.inbox}/`, {
		method: "POST",
		body: JSON.stringify(params),
	});
}

export async function commentOnInbox(
	inboxId: string,
	params: { message: string; followers: string[] },
) {
	return request(`${ENDPOINTS.inbox}/${inboxId}/comment`, {
		method: "POST",
		body: JSON.stringify(params),
	});
}

export async function getInboxComments(
	inboxId: string,
	limit: number = 20,
	beforeDate?: string,
): Promise<any> {
	const query = new URLSearchParams({ limit: limit.toString() });

	if (beforeDate) {
		query.append("beforeDate", beforeDate);
	}

	return request<any>(
		`${ENDPOINTS.inbox}/${inboxId}/comments?${query.toString()}`,
		{
			method: "GET",
		},
	);
}
