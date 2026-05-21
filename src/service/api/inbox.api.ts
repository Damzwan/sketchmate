import {
	ENDPOINTS,
	GetInboxRes,
	RemoveFromInboxParams,
	Res,
	SeeInboxParams,
} from "@/types/server.types";
import { request } from "@/service/api/http";

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
