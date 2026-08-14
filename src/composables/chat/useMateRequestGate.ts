import { computed, type Ref } from "vue";
import dayjs from "@/helper/dayjsRelative.helper";

/**
 * Whether the current user may offer to become Mates right now, and if not,
 * what to say instead.
 *
 * The server is authoritative — it enforces the escalating decline ladder in
 * mate-request.policy.ts and answers 429 either way. This exists so the UI can
 * omit the button rather than present one that will be rejected: an affordance
 * that fails is worse than no affordance, and a "Become Mates" button that
 * silently does nothing reads as a broken app rather than as a boundary.
 *
 * `now` is passed in so callers can share one ticking clock instead of each
 * surface starting its own interval.
 */
export function useMateRequestGate(getChat: () => any, now: Ref<Date>) {
	const locked = computed(() => getChat()?.mate_request_locked === true);

	const cooldownUntil = computed(() => {
		const raw = getChat()?.mate_request_cooldown_until;
		return raw ? dayjs(raw) : null;
	});

	const coolingDown = computed(() => {
		const until = cooldownUntil.value;
		return !!until && dayjs(now.value).isBefore(until);
	});

	const canRequest = computed(() => !locked.value && !coolingDown.value);

	/** Short form for a status strip. Empty when there's nothing to say. */
	const shortReason = computed(() => {
		if (locked.value) return "Requests closed";
		if (coolingDown.value)
			return `Ask again ${dayjs(cooldownUntil.value!).from(dayjs(now.value))}`;
		return "";
	});

	/** Full sentence for the info sheet, where there's room to explain. */
	const longReason = computed(() => {
		if (locked.value)
			return "They've declined a few times, so you can't send another Mate request here. If they change their mind, they can send you one.";
		if (coolingDown.value)
			return `You recently sent a request. You can ask again ${dayjs(cooldownUntil.value!).from(dayjs(now.value))}.`;
		return "";
	});

	return { canRequest, locked, coolingDown, shortReason, longReason };
}
