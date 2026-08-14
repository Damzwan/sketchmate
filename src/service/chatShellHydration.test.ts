import { beforeEach, describe, expect, it, vi } from "vitest";

const {
	socketConnect,
	socketLogin,
	getChatShell,
	applySocialShell,
	applyActiveChats,
	initializeSocialGraph,
	loadActiveChats,
} = vi.hoisted(() => ({
	socketConnect: vi.fn(),
	socketLogin: vi.fn(),
	getChatShell: vi.fn(),
	applySocialShell: vi.fn(),
	applyActiveChats: vi.fn(),
	initializeSocialGraph: vi.fn(),
	loadActiveChats: vi.fn(),
}));

vi.mock("@/service/api/socket/socket.service", () => ({
	socketConnect,
	socketLogin,
}));
vi.mock("@/service/api/chat.api", () => ({ getChatShell }));
vi.mock("@/store/friend.store", () => ({
	useFriendStore: () => ({ applySocialShell, initializeSocialGraph }),
}));
vi.mock("@/store/chat.store", () => ({
	useChatStore: () => ({ applyActiveChats, loadActiveChats }),
}));

import { hydrateChatShell, refreshChatShell } from "./chatShellHydration";

describe("chat shell hydration", () => {
	const shell = {
		activeChats: [{ _id: "chat-1" }],
		pendingRequests: [{ _id: "request-1" }],
		onlineFriendIds: ["friend-1"],
		blockedUserIds: ["blocked-1"],
	};

	beforeEach(() => {
		vi.clearAllMocks();
		getChatShell.mockResolvedValue(shell);
	});

	it("starts presence, unread metadata and the live socket without message history", async () => {
		await hydrateChatShell({ _id: "user-1" } as never);

		expect(socketConnect).toHaveBeenCalledOnce();
		expect(socketLogin).toHaveBeenCalledWith({ _id: "user-1" });
		expect(getChatShell).toHaveBeenCalledOnce();
		expect(applySocialShell).toHaveBeenCalledWith(shell);
		expect(applyActiveChats).toHaveBeenCalledWith(shell.activeChats);
		expect(initializeSocialGraph).not.toHaveBeenCalled();
		expect(loadActiveChats).not.toHaveBeenCalled();
	});

	it("refreshes both header counter sources", async () => {
		await refreshChatShell();

		expect(getChatShell).toHaveBeenCalledOnce();
		expect(applySocialShell).toHaveBeenCalledWith(shell);
		expect(applyActiveChats).toHaveBeenCalledWith(shell.activeChats);
		expect(socketConnect).not.toHaveBeenCalled();
	});

	it("falls back to the legacy requests during a rolling server deploy", async () => {
		getChatShell.mockRejectedValueOnce(new Error("not found"));

		await refreshChatShell();

		expect(initializeSocialGraph).toHaveBeenCalledOnce();
		expect(loadActiveChats).toHaveBeenCalledOnce();
		expect(applySocialShell).not.toHaveBeenCalled();
		expect(applyActiveChats).not.toHaveBeenCalled();
	});
});
