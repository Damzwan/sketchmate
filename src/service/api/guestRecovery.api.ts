import { request } from "./http";

export interface GuestRecoveryRegistration {
	credentialId: string;
	secret: string;
	guestUid: string;
	profileName: string;
}

export interface GuestRecoveryRedemption {
	customToken: string;
	guestUid: string;
	profileName: string;
}

export function registerGuestRecovery(): Promise<GuestRecoveryRegistration> {
	return request<GuestRecoveryRegistration>("/guest-recovery/register", {
		method: "POST",
	});
}

export async function redeemGuestRecovery(params: {
	credentialId: string;
	secret: string;
}): Promise<GuestRecoveryRedemption> {
	const response = await fetch(
		`${import.meta.env.VITE_BACKEND as string}/v2/guest-recovery/redeem`,
		{
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(params),
		},
	);
	if (!response.ok) throw new Error("Guest recovery failed");
	return response.json();
}

export function revokeGuestRecovery(credentialId: string): Promise<void> {
	return request<void>(`/guest-recovery/${encodeURIComponent(credentialId)}`, {
		method: "DELETE",
	});
}
