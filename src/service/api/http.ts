import { FirebaseAuthentication } from "@capacitor-firebase/authentication";
import { useModerationStore } from "@/store/moderation.store";
import { useMenuStore } from "@/store/menu.store";
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

		try {
			const errorData = JSON.parse(errorText);

			if (errorData.error === "capability_blocked") {
				const modStore = useModerationStore();
				const menuStore = useMenuStore();

				modStore.notifyCapabilityBlocked({
					capability: errorData.capability,
					restriction: errorData.restriction,
				});

				menuStore.moderationMenuOpen = true;
			}
		} catch (e) {
			throw e;
		}

		throw new Error(
			errorText || `Request failed with status ${response.status}`,
		);
	}

	if (response.status === 204) return {} as T;

	return response.json();
}
