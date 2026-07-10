<template>
  <ion-modal
    :is-open="isWhatsNewOpen"
    @didDismiss="isWhatsNewOpen = false"
    class="sketch-modal"
  >
    <div class="bg-background p-5 overflow-y-auto max-h-[85vh] hide-scrollbar relative">
      <div class="absolute -top-10 -right-10 w-32 h-32 bg-primary/10 rounded-full blur-3xl pointer-events-none" />

      <div class="relative flex flex-col gap-6">

        <!-- Header / Version -->
        <div class="text-center">
          <h2 class="text-3xl font-bold mb-1 cabin-sketch-regular tracking-wide text-secondary">
            What is new
          </h2>
          <p class="text-[10px] uppercase tracking-widest text-black/50">
            Release v{{ appVersion }}
          </p>
        </div>

        <div class="absolute top-2 right-2 z-20">
          <ion-button @click="isWhatsNewOpen=false" fill="clear" color="dark" class="m-0">
            <ion-icon :icon="svg(mdiClose)" slot="icon-only" class="text-2xl" />
          </ion-button>
        </div>

        <!-- Big Boss Solo Dev Message -->
        <div class="flex items-start gap-3">
          <img
            :src="bigbossImage"
            alt="Developer"
            class="w-12 h-12 rounded-full object-cover border-2 border-primary/50 shadow-sm shrink-0"
          />
          <div class="relative flex-1 min-w-0 rounded-2xl rounded-tl-sm border border-primary/40 bg-tertiary px-3.5 py-3 shadow-sm">
            <span class="absolute -left-1.5 top-3 w-3 h-3 rotate-45 bg-tertiary border-l border-b border-primary/40"></span>

            <p class="text-[14px] font-black text-black leading-none cabin-sketch-regular text-lg">
              SketchMate Big Boss
            </p>
            <div class="text-[13px] text-black/80 leading-snug mt-2 space-y-2.5">
              <p>
                Hey! I'm the solo dev behind SketchMate. Over the last 2 years, I've invested thousands of hours and personal funds into this app.
              </p>
              <p>
                To keep SketchMate alive, mainly free, and ad-free, I'm introducing monetization through customization. I know this is a big shift, but it's the only way to sustain the project's costs.
              </p>
              <p class="font-black text-secondary">
                As a thank you to existing users, I've gifted you an exclusive "Gratitude" World and a "Crumbled Paper" profile effect that can never be bought.
              </p>

              <p class="font-black text-secondary">
                For the people that supported the project in the past by donating will be rewarded a lifetime subscription
              </p>
            </div>
          </div>
        </div>

        <!-- Changelog Features -->
        <div class="space-y-4 px-1 mt-1">

          <!-- Social -->
          <div class="flex gap-3 items-center">
            <div class="flex-shrink-0 w-10 h-10 rounded-xl bg-secondary/10 flex items-center justify-center border border-secondary/20">
              <ion-icon :icon="svg(mdiAccountGroupOutline)" class="text-xl text-secondary" />
            </div>
            <div>
              <h3 class="font-bold text-lg leading-tight cabin-sketch-regular text-black/90">Social</h3>
              <p class="text-[13px] text-black/70 mt-0.5 leading-snug">
                Posts, chatting, reacting, and a non-addictive chronological feed.
              </p>
            </div>
          </div>

          <!-- Better Drawing -->
          <div class="flex gap-3 items-center">
            <div class="flex-shrink-0 w-10 h-10 rounded-xl bg-secondary/10 flex items-center justify-center border border-secondary/20">
              <ion-icon :icon="svg(mdiPaletteOutline)" class="text-xl text-secondary" />
            </div>
            <div>
              <h3 class="font-bold text-lg leading-tight cabin-sketch-regular text-black/90">Better Drawing</h3>
              <p class="text-[13px] text-black/70 mt-0.5 leading-snug">
                Improved drawing engine, significantly less lag, and new tools.
              </p>
            </div>
          </div>

          <!-- Anti-Griefing -->
          <div class="flex gap-3 items-center">
            <div class="flex-shrink-0 w-10 h-10 rounded-xl bg-secondary/10 flex items-center justify-center border border-secondary/20">
              <ion-icon :icon="svg(mdiShieldCheckOutline)" class="text-xl text-secondary" />
            </div>
            <div>
              <h3 class="font-bold text-lg leading-tight cabin-sketch-regular text-black/90">Community Safety</h3>
              <p class="text-[13px] text-black/70 mt-0.5 leading-snug">
                Reporting, blocking, and private drawing areas within public lobbies.
              </p>
            </div>
          </div>

          <!-- Customization -->
          <div class="flex gap-3 items-center">
            <div class="flex-shrink-0 w-10 h-10 rounded-xl bg-secondary/10 flex items-center justify-center border border-secondary/20">
              <ion-icon :icon="svg(mdiBrushVariant)" class="text-xl text-secondary" />
            </div>
            <div>
              <h3 class="font-bold text-lg leading-tight cabin-sketch-regular text-black/90">Customization</h3>
              <p class="text-[13px] text-black/70 mt-0.5 leading-snug">
                Extensive new ways to personalize your profile and presence.
              </p>
            </div>
          </div>

          <!-- UI -->
          <div class="flex gap-3 items-center">
            <div class="flex-shrink-0 w-10 h-10 rounded-xl bg-secondary/10 flex items-center justify-center border border-secondary/20">
              <ion-icon :icon="svg(mdiLayersOutline)" class="text-xl text-secondary" />
            </div>
            <div>
              <h3 class="font-bold text-lg leading-tight cabin-sketch-regular text-black/90">Reworked UI</h3>
              <p class="text-[13px] text-black/70 mt-0.5 leading-snug">
                A cleaner, faster, and more polished interface across the app.
              </p>
            </div>
          </div>
        </div>

        <!-- Actions -->
        <div class="flex flex-col gap-3 mt-2">
          <ion-button
            expand="block"
            class="cabin-sketch-regular text-xl tracking-wide m-0"
            shape="round"
            color="secondary"
            @click="isWhatsNewOpen = false"
          >
            Awesome!
          </ion-button>

<!--          <a-->
<!--            href="https://sketchmate.ninja/blog/"-->
<!--            target="_blank"-->
<!--            class="text-center text-[13px] font-bold text-black/60 active:scale-95 transition-transform"-->
<!--          >-->
<!--            Read the full story on the blog <ion-icon :icon="svg(mdiOpenInNew)" class="align-[-2px] ml-0.5" />-->
<!--          </a>-->
        </div>
      </div>
    </div>
  </ion-modal>
</template>

<script setup lang="ts">
import { IonModal, IonButton, IonIcon } from "@ionic/vue";
import { watchEffect } from "vue";
import { storeToRefs } from "pinia";
import { useAuthStore } from "@/store/auth.store";
import { useMenuStore } from "@/store/menu.store";
import { compareVersions, svg } from "@/helper/general.helper";
import {
	mdiAccountGroupOutline,
	mdiBrushVariant,
	mdiShieldCheckOutline,
	mdiPaletteOutline,
	mdiLayersOutline,
	mdiOpenInNew,
	mdiClose,
} from "@mdi/js";
import { useRoute } from "vue-router";
import { FRONTEND_ROUTES } from "@/types/router.types";
import { updateUser } from "@/service/api/user.api";
import bigbossImage from "@/assets/bigboss.jpg";

const menuStore = useMenuStore();
const { isWhatsNewOpen } = storeToRefs(menuStore);

const { user } = storeToRefs(useAuthStore());
const route = useRoute();
const appVersion = __APP_VERSION__;

watchEffect(() => {
	if (
		isWhatsNewOpen.value ||
		!user.value ||
		route.path === `/${FRONTEND_ROUTES.login}`
	)
		return;

	const lastSeen = user.value.last_seen_version;

	if (!lastSeen) {
		user.value.last_seen_version = appVersion;
		void updateUser({
			_id: user.value._id,
			last_seen_version: appVersion,
		});
		return;
	}

	if (compareVersions(appVersion, lastSeen) === 1) {
		setTimeout(() => {
			if (!user.value) return;
			isWhatsNewOpen.value = true;
		}, 2000);

		user.value.last_seen_version = appVersion;
		void updateUser({
			_id: user.value._id,
			last_seen_version: appVersion,
		});
	}
});
</script>

<style scoped>
ion-modal.sketch-modal {
  --width: 92%;
  --max-width: 420px;
  --height: fit-content;
  --border-radius: 28px;
}

.hide-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}

.hide-scrollbar::-webkit-scrollbar {
  display: none;
}

.bg-background {
  background-color: var(--ion-color-background);
}
</style>