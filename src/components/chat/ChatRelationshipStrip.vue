<template>
  <!-- One glanceable row. It never asks a question — anything that needs an
       answer is a decision and lives in the banner above the composer. -->
  <!-- Type sizes are the Tailwind scale (xs/sm/base), not arbitrary [9px]
       values, and no text tone goes lighter than black/80. This row carries a
       countdown people are meant to read at a glance while the keyboard is
       up — at 9px and 35% opacity it was decoration, not information. -->
  <button
    v-if="rel && showStrip"
    type="button"
    class="relative z-10 w-full flex items-center gap-2 px-4 py-1.5 border-t text-left cursor-pointer active:opacity-70 transition"
    :class="stripClass"
    :aria-label="`${rel.label}. Tap to learn how connections work.`"
    @click.stop="$emit('open-info')"
  >
    <span
      class="w-2 h-2 rounded-full shrink-0"
      :class="[dark ? 'bg-white/90 shadow-sm' : accent.dot]"
    />

    <span
      class="text-sm font-black uppercase tracking-wide shrink-0 cabin-sketch-regular"
		:class="[themeDark ? 'on-world' : accent.text]"
      :style="dark ? { color: nameColor } : {}"
    >
      {{ rel.label }}
    </span>

    <!-- The countdown is the one number people actually want from a trial, so
         it earns its place inline rather than sitting behind a tap. -->
    <span
      v-if="countdown"
      class="text-sm font-black uppercase tracking-wide shrink-0 cabin-sketch-regular"
		:class="[themeDark ? 'on-world' : 'text-black/80']"
      :style="dark ? { color: nameColor } : {}"
    >
      · {{ countdown }}
    </span>

    <!-- The hint fills whatever room is left and truncates. On a narrow phone
         it's the first thing to go, which is right: label + countdown already
         carry the state. -->
    <span
      class="text-sm truncate min-w-0 hidden sm:inline cabin-sketch-regular"
		:class="[themeDark ? 'on-world' : 'text-black/80']"
      :style="dark ? { color: descColor } : {}"
    >
      {{ rel.hint }}
    </span>

    <span class="ml-auto flex items-center gap-2 shrink-0 cabin-sketch-regular">
      <!-- A non-decision action: offered, never demanded. Becoming Mates during
           a healthy trial belongs here, not in a card that covers the thread. -->
      <span
        v-if="inlineAction"
        class="px-3 py-1.5 rounded-full text-xs cabin-sketch-regular font-black uppercase tracking-wide shadow-sm"
        :class="inlineAction.muted ? 'bg-amber-500 text-white' : 'bg-secondary text-white'"
        @click.stop="inlineAction.run"
      >
        {{ inlineAction.label }}
      </span>

      <!-- Where the button would have been. Saying "ask again in 3 hours" is
           the honest version of hiding a disabled button — the user learns the
           rule instead of wondering why the option vanished. -->
      <span
        v-else-if="showGateReason"
        class="px-3 py-1.5 rounded-full text-xs cabin-sketch-regular font-black uppercase tracking-wide"
        :class="dark ? 'bg-white/15 on-world' : 'bg-black/10 text-black/80'"
        :style="dark ? { color: descColor } : {}"
      >
        {{ shortReason }}
      </span>

      <ion-icon
        :icon="svg(mdiInformationOutline)"
        class="text-lg"
        :class="[dark ? 'text-white/90 on-world-icon' : 'text-black/80']"
      />
    </span>
  </button>
</template>

<script setup lang="ts">
import { computed } from "vue";
import dayjs from "dayjs";
import { IonIcon } from "@ionic/vue";
import { mdiInformationOutline } from "@mdi/js";
import { useNow } from "@vueuse/core";
import { svg } from "@/helper/general.helper";
import {
	hasAmbientStatus,
	needsDecision,
	RELATIONSHIP_ACCENT,
	resolveRelationship,
} from "@/config/relationship.config";
import { useRelationshipActions } from "@/composables/chat/useRelationshipActions";
import { useMateRequestGate } from "@/composables/chat/useMateRequestGate";

const props = defineProps<{
	chat: any;
	currentUserId?: string;
	/**
	 * Is the surface under this row dark? That is the partner's THEME
	 * (`theme.isDark`) — Noir and Midnight — not their world. The world in the
	 * toolbar is a masked vignette on one side and never sits under this text.
	 *
	 * Resolved by ChatToolbar and passed down rather than re-derived here: it
	 * already hydrates the partner's customization and theme, and a second copy
	 * of that chain is a second thing to keep in sync.
	 */
	dark?: boolean;
	/** Whether the theme itself uses light text; independent of a dark world. */
	themeDark?: boolean;
	/** theme.nameColor / descColor — already light on a dark theme. */
	nameColor?: string;
	descColor?: string;
}>();
defineEmits(["open-info"]);

const { requestMate } = useRelationshipActions(() => props.chat);

// One minute is plenty for a 24-hour countdown and keeps this off the frame
// budget — a per-second tick would re-render the header 86,400 times a day to
// change a number nobody is watching that closely.
const now = useNow({ interval: 60_000 });

const rel = computed(() =>
	props.chat
		? resolveRelationship({
				status: props.chat.status,
				initiatorId: props.chat.initiator_id,
				currentUserId: props.currentUserId,
				trialExpiresAt: props.chat.trial_expires_at,
			})
		: null,
);

// Decisions get the banner instead. Showing both would state the same thing
// twice, six pixels apart.
const showStrip = computed(
	() =>
		!!rel.value &&
		hasAmbientStatus(rel.value.kind) &&
		!needsDecision(rel.value.kind),
);

const accent = computed(
	() => RELATIONSHIP_ACCENT[rel.value?.accent ?? "neutral"],
);

// Whisper-thin on every surface, dark included.
//
// The dark branch started as `bg-black/35` — a real scrim so text had
// something to sit on. It worked and it looked wrong: on a light theme the
// strip is 2% black, so the theme's cardBg and the world flow straight through
// and the row reads as part of the header. A 35% plate cut a hard band across
// exactly that continuity, which is why space felt bolted on while every other
// world felt integrated.
//
// The theme's *Dark colour variants already exist for this job — ProfileCard
// renders over the same dark worlds with nothing but a colour swap. Match that:
// keep the tint symmetric (a touch of white instead of a touch of black) and
// let the near-white text plus a soft shadow carry legibility.
const stripClass = computed(() => {
	if (props.dark) return "border-white/10 bg-white/[0.04]";
	return rel.value?.accent === "amber"
		? "border-amber-400/25 bg-amber-400/[0.06]"
		: "border-black/5 bg-black/[0.02]";
});

const countdown = computed(() => {
	const expiry = props.chat?.trial_expires_at;
	if (rel.value?.kind !== "trial" || !expiry) return "";

	const diffMinutes = dayjs(expiry).diff(dayjs(now.value), "minute");
	if (diffMinutes <= 0) return "";
	// Hours while there's a day's worth left, minutes once it's down to the
	// wire — "0h left" is useless exactly when the number matters most.
	if (diffMinutes < 60) return `${diffMinutes}m left`;
	return `${Math.floor(diffMinutes / 60)}h left`;
});

const { canRequest, shortReason } = useMateRequestGate(() => props.chat, now);

// Only worth saying during a trial, where "Become Mates" is the thing they'd
// otherwise be reaching for. Elsewhere it's noise about a button that was
// never on screen.
const showGateReason = computed(
	() => rel.value?.kind === "trial" && !!shortReason.value,
);

const inlineAction = computed(() => {
	if (rel.value?.kind !== "trial") return null;
	// Cooling down or locked out after declines — the strip says so instead
	// (see the pill below), rather than offering a button that 429s.
	if (!canRequest.value) return null;
	return { label: "Become Mates", run: requestMate, muted: false };
});
</script>

<style scoped>
/* Legibility over a dark world comes from the theme's own *Dark text colours
   plus this shadow — NOT from a plate behind the row. A starfield is busy but
   low-contrast, so a soft dark halo is enough to hold the glyph edges, and it
   leaves the world visible through the strip the way it is through the rest of
   the header. Matches the `drop-shadow-sm` the header name already carries. */
.on-world {
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.55);
}

/* ion-icon renders an SVG, which text-shadow does not touch — the equivalent
   there is a drop-shadow filter on the element itself. */
.on-world-icon {
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.55));
}
</style>
