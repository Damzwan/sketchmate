<template>
  <ion-page>
    <ion-tabs>
      <ion-router-outlet :animation="masterAnimation" :key="sessionKey"/>

      <!-- Tab Dock: Lifted, transparent glass dock wrapper layout -->
      <ion-tab-bar
        slot="bottom"
        mode="ios"
        class="floating-tab-dock shadow-xl"
      >
        <ion-tab-button
          v-for="tab in tabs"
          :key="tab.route"
          :tab="tab.route"
          :href="`/${tab.route}`"
          @click.stop.prevent="handleTabClick(tab.route)"
          class="bg-transparent transition-all duration-300"
          :class="{ 'tab-selected': isTabActive(tab.route) }"
        >
          <!-- User Profile Tab Layout Option -->
          <template v-if="tab.route === FRONTEND_ROUTES.profile">
            <div
              class="w-7 h-7 rounded-full border-2 transition-all duration-300 overflow-hidden flex justify-center items-center"
              :class="isTabActive(tab.route) ? 'border-secondary scale-110 shadow-sm' : 'border-black/20'"
            >
              <img v-if="profileImg" :src="profileImg" class="w-full h-full object-cover" alt="Profile" />
              <ion-icon v-else :icon="personOutline" class="text-[18px]" />
            </div>
          </template>

          <!-- Standard Navigation Icons Layout -->
          <template v-else>
            <ion-icon
              :icon="tab.icon"
              class="text-2xl transition-all duration-300 text-black/40"
              :class="isTabActive(tab.route) ? 'text-secondary text-secondary-glow' : 'hover:text-black/60'"
            />
          </template>
        </ion-tab-button>
      </ion-tab-bar>
    </ion-tabs>
  </ion-page>
</template>

<script setup lang="ts">
import {
	IonIcon,
	IonPage,
	IonRouterOutlet,
	IonTabBar,
	IonTabButton,
	IonTabs,
	useIonRouter,
} from "@ionic/vue";
import { homeOutline, imagesOutline, personOutline } from "ionicons/icons";
import { FRONTEND_ROUTES } from "@/types/router.types";
import { masterAnimation } from "@/helper/animation.helper";
import { useRoute } from "vue-router";
import { storeToRefs } from "pinia";
import { useAuthStore } from "@/store/auth.store";
import { computed } from "vue";

const router = useIonRouter();
const route = useRoute();

const { localUserImg: profileImg, user } = storeToRefs(useAuthStore());
const sessionKey = computed(() => user.value?._id ?? "anon");

const tabs = [
	{ route: FRONTEND_ROUTES.home, icon: homeOutline },
	{ route: FRONTEND_ROUTES.gallery, icon: imagesOutline },
	{ route: FRONTEND_ROUTES.profile, icon: personOutline },
];

const isTabActive = (tabRoute: string) => route.path.includes(tabRoute);

const handleTabClick = (tabRoute: string) => {
	if (isTabActive(tabRoute)) return;
	router.push(`/${tabRoute}`);
};
</script>

<style lang="scss" scoped>
/* Floating glass dock architecture */
ion-tab-bar.floating-tab-dock {
  --background: rgba(var(--ion-color-tertiary-rgb, 253, 246, 238), 0.85);
  backdrop-filter: blur(20px) saturate(140%);
  -webkit-backdrop-filter: blur(20px) saturate(140%);

  height: 54px;
  position: absolute;
  bottom: calc(12px + var(--ion-safe-area-bottom, 0px));

  /* Centering & Responsive Logic */
  left: 50%;
  transform: translateX(-50%);
  width: calc(100% - 40px); /* Falls back to 20px margins on mobile */
  max-width: 480px;         /* Keeps it looking like a compact dock on tablets/desktop */

  border-radius: 2rem;
  border: 1.5px solid rgba(var(--ion-color-primary-rgb), 0.5);
  padding-bottom: 0 !important;
  overflow: hidden;
}

ion-tab-button {
  --color: rgba(0, 0, 0, 0.4);
  --color-selected: var(--ion-color-secondary);

  /* Tactile interactive micro-bounce curves */
  &.tab-selected ion-icon {
    animation: dynamicPop 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
    color: var(--ion-color-secondary) !important;
  }
}

.text-secondary-glow {
  filter: drop-shadow(0 2px 6px rgba(var(--ion-color-secondary-rgb), 0.25));
}

@keyframes dynamicPop {
  0% {
    transform: scale(1);
  }
  30% {
    transform: scale(0.8);
  }
  75% {
    transform: scale(1.15);
  }
  100% {
    transform: scale(1);
  }
}
</style>