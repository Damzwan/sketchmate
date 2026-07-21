<template>
  <div class="animate-fade-in px-1 pt-2">
    <!-- The header carries the whole emotional job of this screen: an empty
         inbox should read as "nothing yet", not "something is broken". The mark
         is a soft tertiary plate rather than a bare grey glyph so the state
         looks composed instead of unfinished. -->
    <div class="flex flex-col items-center text-center px-3 mb-6">
      <div class="relative mb-4">
        <div class="w-20 h-20 rounded-full bg-tertiary border border-primary/30 shadow-sm flex items-center justify-center">
          <ion-icon :icon="svg(mdiChatOutline)" class="text-4xl text-secondary/70" />
        </div>
        <!-- Small accent mark, so the plate reads as an invitation to act
             rather than as an error badge. -->
        <div class="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-secondary border-2 border-background shadow-sm flex items-center justify-center">
          <ion-icon :icon="svg(mdiPlus)" class="text-lg text-white" />
        </div>
      </div>

      <h3 class="cabin-sketch-regular text-2xl font-black text-black tracking-tight leading-none">
        It's quiet in here
      </h3>
      <p class="mt-2 text-base text-black/80 cabin-sketch-regular leading-snug max-w-[280px]">
        {{ hasMates
          ? 'Pick a mate and start sketching together.'
          : 'No mates yet — add someone and your conversations will show up here.' }}
      </p>
    </div>

    <!-- PRIMARY -->
    <button
      class="w-full flex items-center gap-4 bg-tertiary border-2 border-secondary/30 rounded-[1.4rem] p-4 shadow-sm cursor-pointer active:scale-[0.98] md:hover:border-secondary/50 transition-all text-left group"
      @click="primaryCta.action"
    >
      <span class="w-12 h-12 rounded-full bg-secondary text-white flex items-center justify-center shrink-0 shadow-sm transition-transform group-hover:scale-105">
        <ion-icon :icon="svg(primaryCta.icon)" class="text-2xl" />
      </span>
      <span class="flex-1 min-w-0">
        <span class="block text-base font-black text-black cabin-sketch-regular leading-tight tracking-tight">
          {{ primaryCta.label }}
        </span>
        <span class="block text-sm text-black/80 leading-snug mt-0.5">
          {{ primaryCta.sub }}
        </span>
      </span>
      <ion-icon :icon="svg(mdiChevronRight)" class="text-xl text-secondary shrink-0 transition-transform group-hover:translate-x-0.5" />
    </button>

    <!-- SECONDARY -->
    <template v-if="secondaryCtas.length">
      <div class="flex items-center gap-3 my-5">
        <div class="h-px bg-primary/30 flex-1"></div>
        <span class="text-xs font-black text-black/80 uppercase tracking-widest">
          {{ hasMates ? 'Or explore' : 'Other ways to connect' }}
        </span>
        <div class="h-px bg-primary/30 flex-1"></div>
      </div>

      <div class="space-y-2.5">
        <button
          v-for="cta in secondaryCtas"
          :key="cta.label"
          class="w-full flex items-center gap-4 bg-tertiary border border-primary/30 rounded-[1.4rem] p-3.5 shadow-sm cursor-pointer active:scale-[0.98] md:hover:border-primary/50 transition-all text-left group"
          @click="cta.action"
        >
          <span class="w-11 h-11 rounded-full bg-primary/15 flex items-center justify-center shrink-0 transition-colors group-hover:bg-primary/25">
            <ion-icon :icon="svg(cta.icon)" class="text-xl text-black/80" />
          </span>
          <span class="flex-1 min-w-0">
            <span class="block text-base font-black text-black cabin-sketch-regular leading-tight">
              {{ cta.label }}
            </span>
            <span class="block text-sm text-black/80 leading-snug mt-0.5">
              {{ cta.sub }}
            </span>
          </span>
          <ion-icon :icon="svg(mdiChevronRight)" class="text-lg text-black/80 shrink-0 transition-transform group-hover:translate-x-0.5" />
        </button>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { storeToRefs } from "pinia";
import { IonIcon, useIonRouter } from "@ionic/vue";
import {
	mdiAccountMultiplePlusOutline,
	mdiAccountSearchOutline,
	mdiBalloon,
	mdiChatOutline,
	mdiChevronRight,
	mdiPencilPlusOutline,
	mdiPlus,
} from "@mdi/js";
import { svg } from "@/helper/general.helper";
import { useAuthStore } from "@/store/auth.store";
import { useChatWidgetStore } from "@/store/chatWidget.store";
import { useMenuStore } from "@/store/menu.store";
import { Menu } from "@/draw/types/draw.types";
import { FRONTEND_ROUTES } from "@/types/router.types";
import { masterAnimation } from "@/helper/animation.helper";

// Emitted rather than handled here: opening the friend picker flips a piece of
// ChatOverview's own view state, and this component has no business reaching
// into it.
const emit = defineEmits(["start-chat"]);

const chatWidget = useChatWidgetStore();
const { openMenu } = useMenuStore();
const { isUnderAge, user } = storeToRefs(useAuthStore());
const router = useIonRouter();

// TOTAL mates, from the user's own stat — not the quota's `used`, which now
// counts only mates made THIS WEEK. A user with 30 mates and a quiet week still
// "has mates" and should get the "message a mate" CTA, not "add your first".
const hasMates = computed(() => (user.value?.stats?.mates ?? 0) > 0);

const primaryCta = computed(() => {
	if (hasMates.value) {
		return {
			icon: mdiAccountSearchOutline,
			label: "Message a mate",
			sub: "Start a chat with someone you know",
			action: () => emit("start-chat"),
		};
	}
	return {
		icon: mdiAccountMultiplePlusOutline,
		label: "Add a mate",
		sub: "Share or scan a friend code",
		action: () => {
			chatWidget.closePanel();
			openMenu(Menu.ConnectionMenu);
		},
	};
});

const secondaryCtas = computed(() => {
	const ctas = [];

	// Once they have mates, "Add a mate" is no longer the headline act, so it
	// demotes to this list instead of disappearing.
	if (hasMates.value) {
		ctas.push({
			icon: mdiAccountMultiplePlusOutline,
			label: "Add a mate",
			sub: "Share or scan a friend code",
			action: () => {
				chatWidget.closePanel();
				openMenu(Menu.ConnectionMenu);
			},
		});
	}

	// Stranger-facing surfaces are gated on age, per the families policy.
	if (!isUnderAge.value) {
		ctas.push({
			icon: mdiPencilPlusOutline,
			label: "Public lobby",
			sub: "Draw with people who are online",
			action: () => {
				chatWidget.closePanel();
				router.push(
					{ path: FRONTEND_ROUTES.draw, query: { together: "true" } },
					masterAnimation,
				);
			},
		});
		ctas.push({
			icon: mdiBalloon,
			label: "Balloons",
			sub: "Send a drawing to a stranger",
			action: () => {
				chatWidget.closePanel();
				openMenu(Menu.BalloonMenu);
			},
		});
	}

	return ctas;
});
</script>

<style scoped>
.animate-fade-in { animation: fadeIn 0.25s cubic-bezier(0.34, 1.56, 0.64, 1) forwards; }
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}
</style>
