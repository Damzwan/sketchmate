<template>
  <ion-modal
    :is-open="isOpen"
    @didDismiss="isOpen = false"
    class="whats-new-modal"
  >
    <div class="bg-background p-8 overflow-hidden">
      <div class="absolute -top-10 -right-10 w-32 h-32 bg-primary/10 rounded-full blur-3xl" />

      <div class="prose dark:prose-invert relative">
        <div class="flex justify-center mb-2 text-5xl animate-bounce">
          🎨
        </div>

        <h2 class="text-3xl font-bold mb-1 text-center cabin-sketch-regular tracking-wide text-secondary">
          New Creative Tools!
        </h2>
        <p class="text-[10px] uppercase tracking-widest text-muted-foreground mb-8 text-center opacity-70">
          Release v{{ appVersion }}
        </p>

        <div class="space-y-8">
          <div class="flex gap-4">
            <div
              class="flex-shrink-0 w-14 h-14 rounded-2xl bg-secondary/50 flex items-center justify-center text-2xl shadow-sm border border-border/50">
              <ion-icon :icon="svg(mdiAccountGroupOutline)" class="text-lg" size="large" />
            </div>
            <div>
              <h3 class="font-bold text-2xl leading-tight cabin-sketch-regular text-foreground/90">Draw with
                Friends</h3>
              <p class="text-lg text-muted-foreground mt-1 leading-relaxed">
                Sketch together in real-time! Create private lobbies or join public ones.
                Look for the <span
                class="inline-flex items-center px-1.5 py-0.5 rounded bg-muted border border-border align-middle mx-0.5">
                  <ion-icon :icon="svg(mdiAccountGroupOutline)" class="text-xl" />
                </span> icon on the draw page.
              </p>
            </div>
          </div>

          <div class="flex gap-4">
            <div
              class="flex-shrink-0 w-14 h-14 rounded-2xl bg-secondary/50 flex items-center justify-center text-3xl shadow-sm border border-border/50">
              ♾️
            </div>
            <div>
              <h3 class="font-bold text-2xl leading-tight cabin-sketch-regular text-foreground/90">Infinite Space</h3>
              <p class="text-lg text-muted-foreground mt-1 leading-relaxed">
                The canvas is now limitless. Pan and zoom anywhere, your creativity no longer has borders!
              </p>
            </div>
          </div>
        </div>

        <ion-button
          expand="block"
          class="mt-10 cabin-sketch-regular text-xl"
          shape="round"
          color="secondary"
          @click="isOpen = false"
        >
          Let's Draw!
        </ion-button>
      </div>
    </div>
  </ion-modal>
</template>

<script setup lang="ts">
import { IonModal, IonButton, IonIcon } from '@ionic/vue'
import { ref, watchEffect } from 'vue'
import { storeToRefs } from 'pinia'
import { useAuthStore } from '@/store/auth.store'
import { compareVersions, svg } from '@/helper/general.helper'
import { useAPI } from '@/service/api/api.service'
import { mdiAccountGroupOutline } from '@mdi/js'
import { useRoute } from 'vue-router'
import { FRONTEND_ROUTES } from '@/types/router.types'

const isOpen = ref(false)
const { user } = storeToRefs(useAuthStore())
const api = useAPI()
const route = useRoute()
const appVersion = __APP_VERSION__

watchEffect(() => {
  if (isOpen.value || !user.value || route.path === `/${FRONTEND_ROUTES.login}`) return

  const lastSeen = user.value.last_seen_version || '0.0.0'

  if (compareVersions(appVersion, lastSeen) === 1) {
    setTimeout(() => {
      if (!user.value) return
      isOpen.value = true

      user.value.last_seen_version = appVersion
      void api.updateUser({
        _id: user.value._id,
        last_seen_version: appVersion
      })
    }, 2000)
  }
})
</script>

<style scoped>
ion-modal.whats-new-modal {
  --width: 90%;
  --max-width: 400px;
  --height: fit-content;
  --border-radius: 28px;
  --box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  --backdrop-opacity: 0.7;
  --z-index: 2000;
}

/* Give it a slightly sketchy border vibe */
.bg-background {
  border-radius: inherit;
  border: 2px solid var(--ion-color-primary, #3880ff);
  position: relative;
}

.prose {
  animation: slideUp 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}

@keyframes slideUp {
  from {
    transform: translateY(30px);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}

ion-button {
  --box-shadow: 0 4px 0 var(--ion-color-primary-shade);
  transition: transform 0.1s;
}

ion-button:active {
  transform: translateY(2px);
}
</style>