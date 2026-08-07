import type { QuotaSummary } from "@/types/server.types";
import { request } from "./http";

export async function fetchQuotaSummary(): Promise<QuotaSummary> {
	return await request<QuotaSummary>("/quota/me");
}
