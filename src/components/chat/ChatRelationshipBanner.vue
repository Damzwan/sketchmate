<template>
  <!-- DECISIONS ONLY.
       This card interrupts the conversation, so it may only appear when the
       conversation genuinely can't continue until the user answers something.
       Running trials, sent invites and pending mate requests are status, not
       questions — they live in ChatRelationshipStrip up in the header, where
       they cost one line instead of a third of the panel. That split is what
       removed the need for a minimize button (and the state that remembered
       it): there is no longer anything to dismiss.

       The surface comes from the owner's resolved chat palette, just like the
       toolbar and composer chrome. -->
  <div
    v-if="show"
    class="w-full rounded-2xl border shadow-sm overflow-hidden animate-fade-in"
    :style="containerStyle"
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
             tracks the resolved chat control surface. The glyph stays white:
             that one is contrast against the fill, not a surface match.
             The badge stays consistent across every incoming request. -->
        <div
          class="absolute -bottom-1.5 -right-1.5 rounded-full p-1.5 border shadow-sm flex items-center justify-center"
          :style="badgeStyle"
        >
          <ion-icon :icon="svg(badgeIcon)" class="text-xs text-white" />
        </div>
      </button>

      <template v-if="rel.kind === 'incoming_invite'">
        <h3 class="cabin-sketch-regular text-xl font-black leading-tight" :style="nameStyle">
          Sketch with {{ partner?.name }}?
        </h3>
        <p class="mt-1.5 text-sm uppercase tracking-wide" :style="descStyle">
          Starts a 24-hour trial
        </p>
        <div class="grid grid-cols-2 gap-3 mt-3.5 w-full max-w-[280px]">
          <ion-button fill="clear" shape="round" class="cursor-pointer" :style="clearButtonStyle" @click="actions.respondToInvite('decline')">
            Ignore
          </ion-button>
          <ion-button shape="round" class="cursor-pointer" :style="primaryButtonStyle" @click="actions.respondToInvite('accept')">
            Accept
          </ion-button>
        </div>
      </template>

      <template v-else-if="rel.kind === 'incoming_mate'">
        <h3 class="cabin-sketch-regular text-xl font-black leading-tight" :style="nameStyle">
          {{ partner?.name }} wants to be Mates!
        </h3>
        <div class="grid gap-3 mt-3.5 w-full max-w-[280px]"
             :class="secondaryChoice ? 'grid-cols-2' : 'grid-cols-1'">
          <ion-button fill="clear" shape="round" class="cursor-pointer" :style="clearButtonStyle" @click="actions.declineMate()">
            Decline
          </ion-button>
          <ion-button v-if="secondaryChoice" shape="round" class="cursor-pointer" :style="primaryButtonStyle" @click="secondaryChoice.run">
            <ion-icon v-if="secondaryChoice.icon" :icon="svg(secondaryChoice.icon)" slot="start" class="text-sm mr-1" />
            {{ secondaryChoice.label }}
          </ion-button>
        </div>
      </template>

      <template v-else-if="rel.kind === 'trial_expired'">
        <ion-icon :icon="svg(mdiHeartPlusOutline)" class="text-4xl mb-2.5" :style="accentStyle" />
        <h3 class="cabin-sketch-regular text-xl font-black leading-tight" :style="nameStyle">
          Trial with {{ firstName }} ended
        </h3>
		<p class="mt-1.5 text-sm uppercase tracking-wide" :style="descStyle">
		  Become Mates to stay connected
        </p>
        <ion-button v-if="secondaryChoice" shape="round" class="cursor-pointer mt-3.5" :style="primaryButtonStyle" @click="secondaryChoice.run">
          <ion-icon v-if="secondaryChoice.icon" :icon="svg(secondaryChoice.icon)" slot="start" class="text-sm mr-1" />
          {{ secondaryChoice.label }}
        </ion-button>
      </template>

      <!-- No "Cooling down…" state any more: the 48h re-invite lock it reported
           was never enforced on the server, so it stopped only the people who
           read it. Ending a connection and changing your mind an hour later is
           the common case, not the abuse case. -->
      <template v-else-if="rel.kind === 'expired'">
        <ion-icon :icon="svg(mdiHeartBroken)" class="text-3xl mb-2" :style="utilityStyle" />
        <h3 class="cabin-sketch-regular text-xl font-black" :style="nameStyle">Connection ended</h3>
		<p class="mt-1.5 text-sm uppercase tracking-wide" :style="descStyle">
		  Start fresh with a new invite?
        </p>
        <ion-button v-if="secondaryChoice" shape="round" class="cursor-pointer mt-3.5" :style="primaryButtonStyle" @click="secondaryChoice.run">
          <ion-icon v-if="secondaryChoice.icon" :icon="svg(secondaryChoice.icon)" slot="start" class="text-sm mr-1" />
          {{ secondaryChoice.label }}
        </ion-button>
      </template>

      <!-- When the action was withheld, say why. A card that states a problem
           and then offers nothing reads as broken; one sentence turns it into a
           boundary the user understands. -->
      <p
        v-if="!canRequest && longReason && (rel.kind === 'trial_expired' || rel.kind === 'expired')"
        class="mt-3 text-sm leading-snug max-w-[280px]"
        :style="descStyle"
      >
        {{ longReason }}
      </p>

      <!-- One consistent way out to the explainer, from every decision. The
           long-form copy and the journey rail live there, not in here — that's
           what used to make this card tall enough to fight the keyboard. -->
      <button
        type="button"
        class="mt-3.5 text-sm font-black uppercase tracking-wide underline underline-offset-4 cursor-pointer transition"
        :style="utilityStyle"
        @click="$emit('open-info')"
      >
        How connections work
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { IonButton, IonIcon } from "@ionic/vue";
import {
	mdiHeart,
	mdiHeartBroken,
	mdiHeartPlusOutline,
	mdiPalette,
} from "@mdi/js";
import { useNow } from "@vueuse/core";
import { computed } from "vue";
import UserAvatar from "@/components/profile/customization/UserAvatar.vue";
import { useMateRequestGate } from "@/composables/chat/useMateRequestGate";
import { useRelationshipActions } from "@/composables/chat/useRelationshipActions";
import { useUserContextSheet } from "@/composables/profile/useUserContextSheet";
import {
	needsDecision,
	resolveRelationship,
} from "@/config/relationship.config";
import { svg } from "@/helper/general.helper";

const props = defineProps<{
	chat: any;
	partner: any;
	currentUserId?: string;
}>();
defineEmits(["open-info"]);

const actions = useRelationshipActions(() => props.chat);
const { openUserActions } = useUserContextSheet();

const openPartner = () => {
	if (props.partner?._id) openUserActions(props.partner);
};

// The glyph badged onto the partner's avatar says WHAT is being asked: a
// palette for a draw invite, a heart for a mate request.
const badgeIcon = computed(() =>
	rel.value.kind === "incoming_invite" ? mdiPalette : mdiHeart,
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

const containerStyle = computed(() => ({
	background: "var(--chat-widget-control-bg, rgba(255,255,255,.72))",
	borderColor:
		rel.value.accent === "amber"
			? "color-mix(in srgb, #f59e0b 45%, var(--chat-widget-border, rgba(0,0,0,.12)))"
			: "var(--chat-widget-border, rgba(0,0,0,.12))",
}));
const nameStyle = { color: "var(--chat-widget-name, #18181b)" };
const descStyle = { color: "var(--chat-widget-desc, rgba(0,0,0,.72))" };
const utilityStyle = { color: "var(--chat-widget-utility, rgba(0,0,0,.72))" };
const accentStyle = {
	color: "var(--chat-widget-accent, var(--ion-color-secondary))",
};
const badgeStyle = {
	background: "var(--chat-widget-accent, var(--ion-color-secondary))",
	borderColor: "var(--chat-widget-control-bg, rgba(255,255,255,.72))",
};
const primaryButtonStyle = {
	"--background": "var(--chat-widget-accent, var(--ion-color-secondary))",
	"--color": "#ffffff",
};
const clearButtonStyle = {
	"--color": "var(--chat-widget-utility, rgba(0,0,0,.72))",
};

const now = useNow({ interval: 60_000 });
const { canRequest, longReason } = useMateRequestGate(() => props.chat, now);

/**
 * The affirmative half of every decision, resolved once instead of being
 * re-branched in three near-identical template blocks. Null means the
 * anti-pestering gate currently withholds a new outbound request.
 */
const secondaryChoice = computed<{
	label: string;
	run: () => void;
	icon?: string;
} | null>(() => {
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
