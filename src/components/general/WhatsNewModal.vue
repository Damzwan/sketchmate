<template>
  <ion-modal
    :is-open="isOpen"
    @didDismiss="isOpen = false"
    class="whats-new-modal"
  >
    <div class="bg-background p-6 overflow-y-auto max-h-[80vh] hide-scrollbar">
      <div class="absolute -top-10 -right-10 w-32 h-32 bg-primary/10 rounded-full blur-3xl" />

      <div class="prose dark:prose-invert relative">
        <h2 class="text-3xl font-bold mb-1 text-center cabin-sketch-regular tracking-wide text-secondary">
          Leveling Up!
        </h2>
        <p class="text-[10px] uppercase tracking-widest text-muted-foreground mb-6 text-center opacity-70">
          Release v{{ appVersion }}
        </p>

        <div class="space-y-6">
          <!-- Social Features -->
          <div class="flex gap-4">
            <div
              class="flex-shrink-0 w-12 h-12 rounded-2xl bg-secondary/30 flex items-center justify-center shadow-sm border border-border/50">
              <ion-icon :icon="svg(mdiAccountGroupOutline)" class="text-2xl text-secondary" />
            </div>
            <div>
              <h3 class="font-bold text-xl leading-tight cabin-sketch-regular text-foreground/90">
                New Social Features
              </h3>
              <p class="text-sm text-muted-foreground mt-1 cabin-sketch-regular">
                Connect like never before! Make posts, see who is online, and send private messages to your friends.
              </p>
            </div>
          </div>

          <!-- Moderation -->
          <div class="flex gap-4">
            <div
              class="flex-shrink-0 w-12 h-12 rounded-2xl bg-secondary/30 flex items-center justify-center text-2xl shadow-sm border border-border/50">
              🛡️
            </div>
            <div>
              <h3 class="font-bold text-xl leading-tight cabin-sketch-regular text-foreground/90">
                Community Moderation
              </h3>
              <p class="text-sm text-muted-foreground mt-1 cabin-sketch-regular">
                Let's keep SketchMate safe together. You now have clear options to report and block unwanted content.
              </p>
            </div>
          </div>

          <!-- Customization -->
          <div class="flex gap-4">
            <div
              class="flex-shrink-0 w-12 h-12 rounded-2xl bg-secondary/30 flex items-center justify-center shadow-sm border border-border/50">
              <ion-icon :icon="svg(mdiBrushVariant)" class="text-2xl text-secondary" />
            </div>
            <div>
              <h3 class="font-bold text-xl leading-tight cabin-sketch-regular text-foreground/90">
                More Customization
              </h3>
              <p class="text-sm text-muted-foreground mt-1 cabin-sketch-regular">
                Express yourself in all kinds of ways! Customize your profile and presence to match your unique style.
              </p>
            </div>
          </div>

          <!-- Drawing & UI -->
          <div class="flex gap-4">
            <div
              class="flex-shrink-0 w-12 h-12 rounded-2xl bg-secondary/30 flex items-center justify-center shadow-sm border border-border/50">
              <ion-icon :icon="svg(mdiLasso)" class="text-2xl text-secondary" />
            </div>
            <div>
              <h3 class="font-bold text-xl leading-tight cabin-sketch-regular text-foreground/90">
                Next-Gen Canvas
              </h3>
              <p class="text-sm text-muted-foreground mt-1 cabin-sketch-regular">
                Enjoy an improved drawing experience, a fresh new UI, and massive performance boosts for a smoother workflow.
              </p>
            </div>
          </div>
        </div>

        <ion-button
          expand="block"
          class="mt-8 cabin-sketch-regular text-xl"
          shape="round"
          color="secondary"
          @click="isOpen = false"
        >
          Awesome!
        </ion-button>
      </div>
    </div>
  </ion-modal>
</template>

<script setup lang="ts">
import { IonModal, IonButton, IonIcon } from "@ionic/vue";
import { ref, watchEffect } from "vue";
import { storeToRefs } from "pinia";
import { useAuthStore } from "@/store/auth.store";
import { compareVersions, svg } from "@/helper/general.helper";
import { mdiAccountGroupOutline, mdiBrushVariant, mdiLasso } from "@mdi/js";
import { useRoute } from "vue-router";
import { FRONTEND_ROUTES } from "@/types/router.types";
import { updateUser } from "@/service/api/user.api";

const isOpen = ref(false);
const { user } = storeToRefs(useAuthStore());
const route = useRoute();
const appVersion = __APP_VERSION__;

watchEffect(() => {
	if (isOpen.value || !user.value || route.path === `/${FRONTEND_ROUTES.login}`)
		return;

	const lastSeen = user.value.last_seen_version || "0.0.0";

	if (compareVersions(appVersion, lastSeen) === 1) {
		setTimeout(() => {
			if (!user.value) return;
			isOpen.value = true;
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
ion-modal.whats-new-modal {
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
  border-radius: 28px;
  border: 3px solid var(--ion-color-secondary); /* Thicker for the 'sketch' feel */
}
</style>