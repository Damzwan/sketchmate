import { request } from "./http";
import { QuotaSummary } from "@/types/server.types";

export async function fetchQuotaSummary(): Promise<QuotaSummary> {
	return await request<QuotaSummary>("/quota/me");
}
