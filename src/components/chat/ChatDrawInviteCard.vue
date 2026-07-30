<template>
  <!-- A live invitation to join someone's canvas.
       Deliberately built to ChatRelationshipBanner's conventions rather than its
       own look — both are "a person is asking you something, mid-conversation",
       and before this they were two visibly different objects in the same
       thread. Three things came straight from that banner's notes:

         · SURFACE IS TERTIARY, not white. The panel behind is warm sand and
           every other card in the app is tertiary; a pure-white card was the
           one cold rectangle in the palette and read as pasted on.
         · LEAD WITH THE PERSON, via UserAvatar — their frame, theme ring and
           decoration, tappable through to their profile. A bare <img> lost all
           of that and made an invite from someone look unrelated to their mate
           request sitting right above it.
         · THE BADGE RING TRACKS THE SURFACE (tertiary), not white, or it draws
           a cold outline on a warm card. Only the glyph inside stays white —
           that one is contrast against the fill. -->
  <div
    class="w-full rounded-2xl border border-secondary/30 bg-tertiary shadow-sm overflow-hidden animate-fade-in"
  >
    <div class="relative px-4 py-4 flex flex-col items-center text-center">
      <!-- Warm accent bloom, matching the one ConversationItem uses on rows
           that want attention. Sits under the content, never over it. -->
      <div
        class="absolute -left-8 -bottom-10 w-28 h-28 rounded-full bg-secondary/10 blur-2xl pointer-events-none"
      ></div>

      <button
        type="button"
        class="relative z-10 mb-3 cursor-pointer active:scale-95 transition-transform"
        @click="$emit('inspect-profile', invite.friend)"
      >
        <UserAvatar
          :user="invite.friend"
          :customization="invite.friend?.customization"
          size="md"
          static
          class="pointer-events-none"
        />
        <div
          class="absolute -bottom-1.5 -right-1.5 rounded-full p-1.5 border border-tertiary shadow-sm flex items-center justify-center bg-secondary"
        >
          <ion-icon :icon="svg(mdiDraw)" class="text-xs text-white" />
        </div>
      </button>

      <h3 class="relative z-10 cabin-sketch-regular text-xl font-black text-black leading-tight">
        Sketch with {{ invite.friend?.name || 'them' }}?
      </h3>
      <p class="relative z-10 mt-1.5 text-sm text-black/80 uppercase tracking-wide">
        They opened a canvas for you
      </p>

      <!-- Two equal buttons, not a 12px close glyph in the corner. The old
           card's dismiss was a `text-black/30` icon at the card edge — barely
           visible and well under a comfortable tap target. This matches the
           Ignore/Accept pair every other decision surface uses, so declining
           is as reachable as accepting. -->
      <div class="relative z-10 grid grid-cols-2 gap-3 mt-3.5 w-full max-w-[280px]">
        <ion-button
          fill="clear"
          color="dark"
          shape="round"
          class="cursor-pointer"
          @click="$emit('dismiss')"
        >
          Not now
        </ion-button>
        <ion-button
          color="secondary"
          shape="round"
          class="cursor-pointer"
          @click="$emit('join', invite.roomId)"
        >
          Join
        </ion-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { IonButton, IonIcon } from "@ionic/vue";
import { mdiDraw } from "@mdi/js";
import { svg } from "@/helper/general.helper";
import UserAvatar from "@/components/profile/customization/UserAvatar.vue";
import type { DrawInvitation } from "@/draw/sync/session.store";

defineProps<{ invite: DrawInvitation }>();

defineEmits<{
	(e: "join", roomId: string): void;
	(e: "dismiss"): void;
	(e: "inspect-profile", friend: DrawInvitation["friend"]): void;
}>();
</script>

<style scoped>
/* Matches ChatRelationshipBanner exactly — the two cards appear in the same
   thread, and the old invite's `animate-bounce-in` made it pop in with a
   different personality to every other surface around it. */
.animate-fade-in {
  animation: fadeIn 0.25s cubic-bezier(0.21, 1.02, 0.43, 1.01) forwards;
}

@keyframes fadeIn {
  from { opacity: 0; transform: scale(0.98) translateY(2px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}
</style>
