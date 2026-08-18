import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
	preferences: new Map<string, string>(),
	register: vi.fn(),
	revoke: vi.fn(),
}));

vi.mock("@/helper/platform.helper", () => ({ isNative: () => false }));
vi.mock("@capacitor/filesystem", () => ({
	Directory: { Data: "DATA" },
	Encoding: { UTF8: "utf8" },
	Filesystem: {},
}));
vi.mock("@capacitor/preferences", () => ({
	Preferences: {
		get: vi.fn(async ({ key }: { key: string }) => ({
			value: state.preferences.get(key) ?? null,
		})),
		set: vi.fn(async ({ key, value }: { key: string; value: string }) => {
			state.preferences.set(key, value);
		}),
		remove: vi.fn(async ({ key }: { key: string }) => {
			state.preferences.delete(key);
		}),
	},
}));
vi.mock("@/service/api/guestRecovery.api", () => ({
	registerGuestRecovery: state.register,
	revokeGuestRecovery: state.revoke,
}));

import {
	ensureGuestRecovery,
	finalizeGuestRecovery,
	readGuestRecovery,
} from "./guestRecovery.service";

describe("guest recovery persistence", () => {
	beforeEach(() => {
		state.preferences.clear();
		state.register.mockReset();
		state.revoke.mockReset();
		state.revoke.mockResolvedValue(undefined);
		state.register.mockResolvedValue({
			credentialId: "credential",
			secret: "secret",
			guestUid: "guest-uid",
			profileName: "Guest",
		});
	});

	it("enrolls once, persists the proof, and reuses it for the same guest", async () => {
		await ensureGuestRecovery({
			guestUid: "guest-uid",
			profileName: "Guest",
			profileImage: "guest.webp",
		});
		await ensureGuestRecovery({
			guestUid: "guest-uid",
			profileName: "Renamed guest",
			profileImage: "renamed.webp",
		});

		expect(state.register).toHaveBeenCalledTimes(1);
		expect(await readGuestRecovery()).toMatchObject({
			credentialId: "credential",
			guestUid: "guest-uid",
			profileName: "Renamed guest",
			profileImage: "renamed.webp",
		});
	});

	it("shares enrollment when startup and logout request it together", async () => {
		let finishRegistration:
			| ((value: {
					credentialId: string;
					secret: string;
					guestUid: string;
					profileName: string;
			  }) => void)
			| undefined;
		state.register.mockImplementationOnce(
			() =>
				new Promise((resolve) => {
					finishRegistration = resolve;
				}),
		);

		const startup = ensureGuestRecovery({
			guestUid: "guest-uid",
			profileName: "Guest",
		});
		const logout = ensureGuestRecovery({
			guestUid: "guest-uid",
			profileName: "Guest",
		});

		await vi.waitFor(() => expect(state.register).toHaveBeenCalledTimes(1));
		finishRegistration?.({
			credentialId: "credential",
			secret: "secret",
			guestUid: "guest-uid",
			profileName: "Guest",
		});
		expect(await startup).toEqual(await logout);
		expect(state.register).toHaveBeenCalledTimes(1);
	});

	it("revokes and removes the local proof after account linking", async () => {
		await ensureGuestRecovery({ guestUid: "guest-uid", profileName: "Guest" });
		await finalizeGuestRecovery();

		expect(state.revoke).toHaveBeenCalledWith("credential");
		expect(await readGuestRecovery()).toBeNull();
	});
});
