<template>
  <!-- AGE-GATED BANNER (soft mode) -->
  <section
    v-if="isUnderAge"
    class="bg-amber-50/60 backdrop-blur-sm border border-amber-200/80 rounded-3xl p-4 flex gap-3 shadow-sm"
  >
    <ion-icon :icon="svg(mdiSproutOutline)" class="text-2xl shrink-0 text-amber-700" />
    <div class="flex-1 min-w-0">
      <p class="font-black text-base text-amber-900 leading-tight">
        Public features unlock at 13
      </p>
      <p class="text-sm text-amber-900/90 mt-1 leading-snug">
        You can draw, save drafts, add mates, and draw together with them. Public lobbies, posts, and balloons will turn on when you're old enough.
      </p>
      <button
        @click="goToAgeSettings"
        class="text-sm font-bold cursor-pointer text-amber-900 underline mt-2 block active:opacity-60"
      >
        Entered the wrong birthday? Fix it
      </button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { IonIcon, useIonRouter } from "@ionic/vue";
import { mdiSproutOutline } from "@mdi/js";
import { storeToRefs } from "pinia";
import { svg } from "@/helper/general.helper";
import { useAuthStore } from "@/store/auth.store";
import { FRONTEND_ROUTES } from "@/types/router.types";
import { masterAnimation } from "@/helper/animation.helper";

const { isUnderAge } = storeToRefs(useAuthStore());
const r = useIonRouter();

const goToAgeSettings = () => {
	r.push(FRONTEND_ROUTES.settings, masterAnimation);
};
</script>
