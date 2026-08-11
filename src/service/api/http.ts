import { FirebaseAuthentication } from "@capacitor-firebase/authentication";
import { useMenuStore } from "@/store/menu.store";
import { useModerationStore } from "@/store/moderation.store";
import type { Capability } from "@/types/server.types";

interface ApiErrorPayload {
	error?: string;
	message?: string;
	capability?: Capability;
	restriction?: {
		level: number;
		name: string;
		description: string;
		reason?: string;
		expires_at?: string;
		blocked_capabilities?: Capability[];
	};
}

const BASE_URL = import.meta.env.VITE_BACKEND as string;

export async function request<T>(
	path: string,
	options: RequestInit = {},
): Promise<T> {
	const result = await FirebaseAuthentication.getIdToken();
	const token = result.token;

	const headers = new Headers(options.headers);
	if (token) {
		headers.set("Authorization", `Bearer ${token}`);
	}

	if (!(options.body instanceof FormData)) {
		headers.set("Content-Type", "application/json");
	}

	// Ensure path starts with a slash so it resolves cleanly
	const normalizedPath = path.startsWith("/") ? path : `/${path}`;

	const response = await fetch(`${BASE_URL}/v2${normalizedPath}`, {
		...options,
		headers,
	});

	if (!response.ok) {
		const errorText = await response.text();
		let errorData: ApiErrorPayload = {};
		try {
			errorData = JSON.parse(errorText);
		} catch {
			// Koa can return plain-text validation errors. Preserve the useful
			// server message instead of masking it with a JSON parse exception.
		}

		if (
			errorData.error === "capability_blocked" &&
			errorData.capability &&
			errorData.restriction
		) {
			const modStore = useModerationStore();
			const menuStore = useMenuStore();

			modStore.notifyCapabilityBlocked({
				capability: errorData.capability,
				restriction: errorData.restriction,
			});

			menuStore.moderationMenuOpen = true;
		}

		throw new Error(
			errorData.message ||
				errorData.error ||
				errorText ||
				`Request failed with status ${response.status}`,
		);
	}

	if (response.status === 204) return {} as T;

	return response.json();
}
