<template>
  <!-- DECISIONS ONLY.
       This card interrupts the conversation, so it may only appear when the
       conversation genuinely can't continue until the user answers something.
       Running trials, sent invites and pending mate requests are status, not
       questions — they live in ChatRelationshipStrip up in the header, where
       they cost one line instead of a third of the panel. That split is what
       removed the need for a minimize button (and the state that remembered
       it): there is no longer anything to dismiss.

       Surface is tertiary (#FFF2E4), not white. The panel behind this is
       `background` (#F5E6D3, warm sand) and every other card surface in the app
       is tertiary — a pure-white card was the one cold rectangle in a warm
       palette, which is what made it read as pasted on rather than part of the
       chat. tertiary is still lighter than the panel, so it keeps its lift. -->
  <div
    v-if="show"
    class="w-full rounded-2xl border bg-tertiary shadow-sm overflow-hidden animate-fade-in"
    :class="containerClass"
  >
    <div class="px-4 py-4 flex flex-col items-center text-center">

      <!-- Every INCOMING request is a person asking for something, so all of
           them lead with that person — UserAvatar (their frame, theme ring and
           decoration, tappable through to their profile), badged with the glyph
           for what's being asked. The mate request used to lead with a bare
           heart icon instead, which made two requests from the same person look
           like they came from different places.
           The ENDED states below deliberately keep their icon: nobody is asking
           anything there, so there is no one to put a face to. -->
      <button
        v-if="rel.kind === 'incoming_invite' || rel.kind === 'incoming_mate'"
        type="button"
        class="relative mb-3 cursor-pointer active:scale-95 transition-transform"
        @click="openPartner"
      >
        <UserAvatar
          :user="partner"
          :customization="partner?.customization"
          size="md"
          static
          class="pointer-events-none"
        />
        <!-- This ring separates the badge from the surface it sits on, so it
             tracks that surface — tertiary, not white, or it'd draw a cold
             outline on a warm card. The glyph inside the badge stays white:
             that one is contrast against the fill, not a surface match.
             At the mate limit the badge goes muted, matching the old outlined
             heart — the request is still real, but not currently actionable. -->
        <div
          class="absolute -bottom-1.5 -right-1.5 rounded-full p-1.5 border border-tertiary shadow-sm flex items-center justify-center"
          :class="badgeMuted ? 'bg-black/40' : 'bg-secondary'"
        >
          <ion-icon :icon="svg(badgeIcon)" class="text-xs text-white" />
        </div>
      </button>

      <template v-if="rel.kind === 'incoming_invite'">
        <h3 class="cabin-sketch-regular text-xl font-black text-black leading-tight">
          Sketch with {{ partner?.name }}?
        </h3>
        <p class="mt-1.5 text-sm text-black/80 uppercase tracking-wide">
          Starts a 24-hour trial
        </p>
        <div class="grid grid-cols-2 gap-3 mt-3.5 w-full max-w-[280px]">
          <ion-button fill="clear" color="dark" shape="round" class="cursor-pointer" @click="actions.respondToInvite('decline')">
            Ignore
          </ion-button>
          <ion-button color="secondary" shape="round" class="cursor-pointer" @click="actions.respondToInvite('accept')">
            Accept
          </ion-button>
        </div>
      </template>

      <template v-else-if="rel.kind === 'incoming_mate'">
        <h3 class="cabin-sketch-regular text-xl font-black text-black leading-tight">
          {{ partner?.name }} wants to be Mates!
        </h3>

        <p v-if="atMateLimit" class="mt-1.5 text-sm font-black uppercase tracking-wide"
           :class="canUpgrade ? 'text-secondary' : 'text-black/80'">
          {{ canUpgrade ? `Slots full (${quotaStore.mates.used}/${quotaStore.mates.limit})` : 'Max limit reached' }}
        </p>

        <div class="grid gap-3 mt-3.5 w-full max-w-[280px]"
             :class="secondaryChoice ? 'grid-cols-2' : 'grid-cols-1'">
          <ion-button fill="clear" color="dark" shape="round" class="cursor-pointer" @click="actions.declineMate()">
            Decline
          </ion-button>
          <ion-button v-if="secondaryChoice" color="secondary" shape="round" class="cursor-pointer" @click="secondaryChoice.run">
            <ion-icon v-if="secondaryChoice.icon" :icon="svg(secondaryChoice.icon)" slot="start" class="text-sm mr-1" />
            {{ secondaryChoice.label }}
          </ion-button>
        </div>
      </template>

      <template v-else-if="rel.kind === 'trial_expired'">
        <ion-icon :icon="svg(mdiHeartPlusOutline)" class="text-4xl text-secondary mb-2.5" />
        <h3 class="cabin-sketch-regular text-xl font-black text-black leading-tight">
          Trial with {{ firstName }} ended
        </h3>
        <p class="mt-1.5 text-sm uppercase tracking-wide"
           :class="atMateLimit && canUpgrade ? 'text-secondary font-black' : 'text-black/80'">
          <template v-if="atMateLimit && canUpgrade">
            Slots full ({{ quotaStore.mates.used }}/{{ quotaStore.mates.limit }})
          </template>
          <template v-else-if="atMateLimit">Maximum limit reached</template>
          <template v-else>Become Mates to stay connected</template>
        </p>
        <ion-button v-if="secondaryChoice" color="secondary" shape="round" class="cursor-pointer mt-3.5" @click="secondaryChoice.run">
          <ion-icon v-if="secondaryChoice.icon" :icon="svg(secondaryChoice.icon)" slot="start" class="text-sm mr-1" />
          {{ secondaryChoice.label }}
        </ion-button>
      </template>

      <template v-else-if="rel.kind === 'expired'">
        <template v-if="isUnderCooldown">
          <ion-icon :icon="svg(mdiClockOutline)" class="text-3xl text-black/50 mb-2" />
          <h3 class="cabin-sketch-regular text-xl font-black text-black">Cooling down…</h3>
          <p class="mt-1.5 text-sm font-black text-secondary uppercase tracking-wide">
            Available {{ formattedCooldown }}
          </p>
        </template>
        <template v-else>
          <ion-icon :icon="svg(mdiHeartBroken)" class="text-3xl text-black/50 mb-2" />
          <h3 class="cabin-sketch-regular text-xl font-black text-black">Connection ended</h3>
          <p class="mt-1.5 text-sm uppercase tracking-wide"
             :class="atMateLimit && canUpgrade ? 'text-secondary font-black' : 'text-black/80'">
            <template v-if="atMateLimit && canUpgrade">
              Slots full ({{ quotaStore.mates.used }}/{{ quotaStore.mates.limit }})
            </template>
            <template v-else-if="atMateLimit">Maximum limit reached</template>
            <template v-else>Start fresh with a new invite?</template>
          </p>
          <ion-button v-if="secondaryChoice" color="secondary" shape="round" class="cursor-pointer mt-3.5" @click="secondaryChoice.run">
            <ion-icon v-if="secondaryChoice.icon" :icon="svg(secondaryChoice.icon)" slot="start" class="text-sm mr-1" />
            {{ secondaryChoice.label }}
          </ion-button>
        </template>
      </template>

      <!-- When the action was withheld, say why. A card that states a problem
           and then offers nothing reads as broken; one sentence turns it into a
           boundary the user understands. -->
      <p
        v-if="!canRequest && longReason && (rel.kind === 'trial_expired' || rel.kind === 'expired')"
        class="mt-3 text-sm text-black/80 leading-snug max-w-[280px]"
      >
        {{ longReason }}
      </p>

      <!-- One consistent way out to the explainer, from every decision. The
           long-form copy and the journey rail live there, not in here — that's
           what used to make this card tall enough to fight the keyboard. -->
      <button
        type="button"
        class="mt-3.5 text-sm font-black uppercase tracking-wide text-black/80 underline decoration-black/20 underline-offset-4 md:hover:text-black cursor-pointer transition"
        @click="$emit('open-info')"
      >
        How connections work
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { IonButton, IonIcon } from "@ionic/vue";
import {
	mdiHeart,
	mdiHeartBroken,
	mdiHeartOutline,
	mdiHeartPlusOutline,
	mdiClockOutline,
	mdiPalette,
	mdiStar,
} from "@mdi/js";
import { svg } from "@/helper/general.helper";
import { useQuotaStore } from "@/store/quota.store";
import { useNow } from "@vueuse/core";
import { needsDecision, resolveRelationship } from "@/config/relationship.config";
import { useRelationshipActions } from "@/composables/chat/useRelationshipActions";
import { useMateRequestGate } from "@/composables/chat/useMateRequestGate";
import { useUserContextSheet } from "@/composables/profile/useUserContextSheet";
import UserAvatar from "@/components/profile/customization/UserAvatar.vue";

dayjs.extend(relativeTime);

const props = defineProps<{ chat: any; partner: any; currentUserId?: string }>();
defineEmits(["open-info"]);

const quotaStore = useQuotaStore();
const actions = useRelationshipActions(() => props.chat);
const { openUserActions } = useUserContextSheet();

const openPartner = () => {
	if (props.partner?._id) openUserActions(props.partner);
};

// The glyph badged onto the partner's avatar says WHAT is being asked: a
// palette for a draw invite, a heart for a mate request. Outlined + muted when
// the request can't currently be accepted.
const badgeIcon = computed(() =>
	rel.value.kind === "incoming_invite"
		? mdiPalette
		: atMateLimit.value
			? mdiHeartOutline
			: mdiHeart,
);
const badgeMuted = computed(
	() => rel.value.kind === "incoming_mate" && atMateLimit.value,
);

const rel = computed(() =>
	resolveRelationship({
		status: props.chat?.status,
		initiatorId: props.chat?.initiator_id,
		currentUserId: props.currentUserId,
		trialExpiresAt: props.chat?.trial_expires_at,
	}),
);

const show = computed(() => !!props.chat && needsDecision(rel.value.kind));

const firstName = computed(() => props.partner?.name?.split(" ")[0] || "them");

const containerClass = computed(() =>
	rel.value.accent === "amber" ? "border-amber-400/40" : "border-secondary/30",
);

const isUnderCooldown = computed(() =>
	props.chat?.cooldown_until
		? dayjs().isBefore(dayjs(props.chat.cooldown_until))
		: false,
);
const formattedCooldown = computed(() =>
	dayjs(props.chat?.cooldown_until).fromNow(),
);

const atMateLimit = computed(() => !quotaStore.canAddMate);
const canUpgrade = computed(() => !quotaStore.isPro);

const now = useNow({ interval: 60_000 });
const { canRequest, longReason } = useMateRequestGate(() => props.chat, now);

/**
 * The affirmative half of every decision, resolved once instead of being
 * re-branched in three near-identical template blocks. Null means there is
 * genuinely no way forward right now (a Pro user who is simply full), and the
 * template collapses to a single Decline / message.
 */
const secondaryChoice = computed<
	{ label: string; run: () => void; icon?: string } | null
>(() => {
	if (atMateLimit.value) {
		return canUpgrade.value
			? { label: "Upgrade", run: actions.openPaywall, icon: mdiStar }
			: null;
	}

	switch (rel.value.kind) {
		// Accepting is always allowed — the ladder gates ASKING, never answering.
		case "incoming_mate":
			return { label: "Accept", run: actions.acceptMate };
		// Both of these send a fresh request, so both are subject to the
		// anti-pestering ladder. Without this check the banner still offered the
		// button and the tap just 429'd.
		case "trial_expired":
			return canRequest.value
				? { label: "Become Mates", run: actions.requestMate, icon: mdiHeart }
				: null;
		case "expired":
			return canRequest.value
				? { label: "Send New Invite", run: actions.requestMate }
				: null;
		default:
			return null;
	}
});
</script>

<style scoped>
.animate-fade-in {
  animation: fadeIn 0.25s cubic-bezier(0.21, 1.02, 0.43, 1.01) forwards;
}

@keyframes fadeIn {
  from { opacity: 0; transform: scale(0.98) translateY(2px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}
</style>
