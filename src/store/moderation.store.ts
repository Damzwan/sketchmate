import { defineStore } from "pinia";
import { computed, ref } from "vue";
import type {
	UserRestriction,
	UserStrikeSummary,
	ModerationStrikePayload,
	UserStandingData,
	Capability,
} from "@/types/server.types";
import { getStanding } from "@/service/api/moderation.api";

export const useModerationStore = defineStore("moderation", () => {
	const restriction = ref<UserRestriction | null>(null);
	const strikeSummary = ref<UserStrikeSummary>({
		active_strikes: 0,
		total_strikes: 0,
	});

	const standing = ref<UserStandingData | null>(null);
	const standingLoadedAt = ref<number>(0);

	const pendingStrikeNotice = ref<ModerationStrikePayload | null>(null);

	const level = computed(() => restriction.value?.level ?? 0);
	const isRestricted = computed(() => level.value > 0);

	function isBlocked(capability: Capability): boolean {
		return (
			restriction.value?.blocked_capabilities?.includes(capability) ?? false
		);
	}

	// --- ACTIONS ---

	function initFromUser(user: {
		restriction?: UserRestriction;
		strike_summary?: UserStrikeSummary;
	}) {
		restriction.value =
			user.restriction && user.restriction.level > 0 ? user.restriction : null;
		strikeSummary.value = user.strike_summary ?? {
			active_strikes: 0,
			total_strikes: 0,
		};
	}

	function handleStrike(payload: ModerationStrikePayload) {
		restriction.value = {
			level: payload.level,
			reason: payload.reason,
			applied_at: new Date().toISOString(),
			expires_at: payload.expires_at,
			blocked_capabilities: payload.blocked_capabilities,
		};
		strikeSummary.value = {
			...strikeSummary.value,
			active_strikes: payload.level,
			last_strike_at: new Date().toISOString(),
		};
		standing.value = null; // invalidate cache
		pendingStrikeNotice.value = payload;
	}

	function handleRestrictionLifted() {
		restriction.value = null;
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
				// Also reconcile local restriction from authoritative source
				restriction.value =
					data.restriction && data.restriction.level > 0
						? data.restriction
						: null;
				strikeSummary.value = data.summary;
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
		};
	}) {
		pendingStrikeNotice.value = {
			level: payload.restriction.level,
			name: payload.restriction.name,
			description: payload.restriction.description,
			reason: payload.restriction.reason as any,
			expires_at: payload.restriction.expires_at,
			blocked_capabilities: restriction.value?.blocked_capabilities ?? [
				payload.capability,
			],
		};
	}

	function reset() {
		restriction.value = null;
		strikeSummary.value = { active_strikes: 0, total_strikes: 0 };
		standing.value = null;
		standingLoadedAt.value = 0;
		pendingStrikeNotice.value = null;
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
		reset,
	};
});
