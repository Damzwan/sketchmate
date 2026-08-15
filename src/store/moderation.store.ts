import { defineStore } from "pinia";
import { computed, ref } from "vue";
import {
	getStanding,
	reportBalloon,
	reportComment,
	reportDmMessage,
	reportInboxComment,
	reportInboxDrawing,
	reportPost,
	reportUser,
} from "@/service/api/moderation.api";
import { blockUser } from "@/service/api/relationship.api";
import { useToast } from "@/service/toast.service";
import { useFriendStore } from "@/store/friend.store";
import { useMenuStore } from "@/store/menu.store";
import { Menu } from "@/types/menu.types";
import type {
	Capability,
	ModerationStrikePayload,
	ReportableType,
	ReportReason,
	UserRestriction,
	UserStandingData,
	UserStrikeSummary,
} from "@/types/server.types";

export interface ReportTarget {
	type: ReportableType;
	id: string;
	label?: string;
	/**
	 * The author/owner to optionally block alongside the report. For a
	 * `type: 'user'` report this is implicitly `id`; for content reports
	 * (post/comment/message) pass the author's user id so the "also block"
	 * option can be offered.
	 */
	blockUserId?: string;
	/**
	 * Set when the report is raised inside a lobby. Lobby chat lives only in the
	 * room's server-side buffer, so this is what lets the report carry the
	 * exchange it was about — without it the moderator sees an account flag with
	 * nothing behind it.
	 */
	contextRoomId?: string;
}
export const useModerationStore = defineStore("moderation", () => {
	const restriction = ref<UserRestriction | null>(null);
	const strikeSummary = ref<UserStrikeSummary>({
		active_strikes: 0,
		total_strikes: 0,
	});

	const standing = ref<UserStandingData | null>(null);
	const standingLoadedAt = ref<number>(0);
	const pendingStrikeNotice = ref<ModerationStrikePayload | null>(null);

	// Dynamic Cache Tracker: keeps structural operations performant and decoupled
	const cachedCapabilities = ref<Capability[]>([]);

	const level = computed(() => restriction.value?.level ?? 0);
	const isRestricted = computed(() => level.value > 0);

	const targetToReport = ref<ReportTarget | null>(null);
	const isSubmittingReport = ref(false);

	function isBlocked(capability: Capability): boolean {
		return cachedCapabilities.value.includes(capability);
	}

	// --- ACTIONS ---

	function initFromUser(user: {
		restriction?: UserRestriction & { blocked_capabilities?: Capability[] };
		strike_summary?: UserStrikeSummary;
	}) {
		restriction.value =
			user.restriction && user.restriction.level > 0 ? user.restriction : null;

		strikeSummary.value = user.strike_summary ?? {
			active_strikes: 0,
			total_strikes: 0,
		};

		// Hydrate the local client evaluation cache safely if present on login metadata
		if (user.restriction?.blocked_capabilities) {
			cachedCapabilities.value = user.restriction.blocked_capabilities;
		} else {
			cachedCapabilities.value = [];
		}
	}

	function handleStrike(payload: ModerationStrikePayload) {
		restriction.value = {
			level: payload.level,
			reason: payload.reason,
			applied_at: new Date().toISOString(),
			expires_at: payload.expires_at,
		};

		strikeSummary.value = {
			...strikeSummary.value,
			active_strikes: payload.level,
			last_strike_at: new Date().toISOString(),
		};

		// Keep dynamic blocks completely synchronized across reactive client context runtimes
		cachedCapabilities.value = payload.blocked_capabilities || [];
		standing.value = null; // Invalidate lookup age metrics cache
		pendingStrikeNotice.value = payload;
	}

	function handleRestrictionLifted() {
		restriction.value = null;
		cachedCapabilities.value = [];
		standing.value = null;
	}

	function dismissStrikeNotice() {
		pendingStrikeNotice.value = null;
	}

	async function fetchStanding(
		force = false,
	): Promise<UserStandingData | null> {
		const cacheAge = Date.now() - standingLoadedAt.value;
		if (!force && standing.value && cacheAge < 60_000) {
			return standing.value;
		}
		try {
			const data = await getStanding();
			if (data) {
				standing.value = data;
				standingLoadedAt.value = Date.now();

				restriction.value =
					data.restriction && data.restriction.level > 0
						? data.restriction
						: null;

				strikeSummary.value = data.summary;

				// Dynamic extraction: matches what the server populates dynamically on getStanding reads
				cachedCapabilities.value = data.restriction?.blocked_capabilities || [];
			}
			return data ?? null;
		} catch (e) {
			console.error("fetchStanding failed:", e);
			return null;
		}
	}

	function notifyCapabilityBlocked(payload: {
		capability: Capability;
		restriction: {
			level: number;
			name: string;
			description: string;
			reason?: string;
			expires_at?: string;
			blocked_capabilities?: Capability[];
		};
	}) {
		// If the error response provides an authoritative list of blocks, update the capability cache immediately
		if (payload.restriction.blocked_capabilities) {
			cachedCapabilities.value = payload.restriction.blocked_capabilities;
		} else if (!cachedCapabilities.value.includes(payload.capability)) {
			cachedCapabilities.value.push(payload.capability);
		}

		pendingStrikeNotice.value = {
			level: payload.restriction.level,
			name: payload.restriction.name,
			description: payload.restriction.description,
			reason: payload.restriction.reason as any,
			expires_at: payload.restriction.expires_at,
			blocked_capabilities: cachedCapabilities.value,
		};
	}

	function resetRuntimeState() {
		restriction.value = null;
		cachedCapabilities.value = [];
		strikeSummary.value = { active_strikes: 0, total_strikes: 0 };
		standing.value = null;
		standingLoadedAt.value = 0;
		pendingStrikeNotice.value = null;
	}

	function openReport(target: ReportTarget) {
		targetToReport.value = target;
		useMenuStore().openMenu(Menu.ReportMenu);
	}

	function clearReportTarget() {
		targetToReport.value = null;
	}

	/** The user that "also block" would act on, or null if none is known. */
	const blockableUserId = computed(() => {
		const t = targetToReport.value;
		if (!t) return null;
		return t.type === "user" ? t.id : (t.blockUserId ?? null);
	});

	async function submitReport(
		reason: ReportReason,
		details?: string,
		alsoBlock = false,
	) {
		if (!targetToReport.value) return false;
		if (isSubmittingReport.value) return false;

		isSubmittingReport.value = true;
		const { toast } = useToast();
		const { id, type, contextRoomId } = targetToReport.value;
		const userToBlock = alsoBlock ? blockableUserId.value : null;

		try {
			switch (type) {
				case "post":
					await reportPost(id, reason, details);
					break;
				case "comment":
					await reportComment(id, reason, details);
					break;
				case "balloon":
					await reportBalloon(id, reason, details);
					break;
				case "user":
					await reportUser(id, reason, details, contextRoomId);
					break;
				case "dm_message":
					await reportDmMessage(id, reason, details);
					break;
				case "inbox_drawing":
					await reportInboxDrawing(id, reason, details);
					break;
				case "inbox_comment":
					await reportInboxComment(id, reason, details);
					break;
				case "lobby_message":
				case "lobby_drawing":
					console.warn(`Reporting ${type} not yet wired up`);
					return false;
				default:
					console.warn("Unknown report target type:", type);
					return false;
			}
			if (userToBlock) {
				try {
					await blockUser(userToBlock);
					useFriendStore().blockUserLocally(userToBlock);
				} catch (e) {
					console.error("block after report failed:", e);
				}
			}

			toast(
				userToBlock
					? "Report submitted and user blocked."
					: "Report submitted. Thanks for keeping the community safe.",
				{ color: "success" },
			);
			targetToReport.value = null;
			return true;
		} catch (e) {
			console.error("submitReport failed:", e);
			toast("Could not submit report. Please try again.", { color: "danger" });
			return false;
		} finally {
			isSubmittingReport.value = false;
		}
	}

	return {
		restriction,
		strikeSummary,
		standing,
		pendingStrikeNotice,
		level,
		isRestricted,
		isBlocked,
		initFromUser,
		handleStrike,
		handleRestrictionLifted,
		dismissStrikeNotice,
		fetchStanding,
		notifyCapabilityBlocked,
		resetRuntimeState,
		targetToReport,
		isSubmittingReport,
		blockableUserId,
		openReport,
		clearReportTarget,
		submitReport,
	};
});
