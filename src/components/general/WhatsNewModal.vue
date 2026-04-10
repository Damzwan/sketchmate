<template>
  <ion-modal
    :is-open="isOpen"
    @didDismiss="isOpen = false"
    class="whats-new-modal"
  >
    <div class="bg-background p-6 overflow-y-auto max-h-[80vh] hide-scrollbar">
      <div class="absolute -top-10 -right-10 w-32 h-32 bg-primary/10 rounded-full blur-3xl" />

      <div class="prose dark:prose-invert relative">
        <div class="flex justify-center mb-2 text-5xl animate-bounce">
          🎨
        </div>

        <h2 class="text-3xl font-bold mb-1 text-center cabin-sketch-regular tracking-wide text-secondary">
          New Creative Tools!
        </h2>
        <p class="text-[10px] uppercase tracking-widest text-muted-foreground mb-6 text-center opacity-70">
          Release v{{ appVersion }}
        </p>

        <div class="space-y-6">
          <div class="flex gap-4">
            <div
              class="flex-shrink-0 w-12 h-12 rounded-2xl bg-secondary/30 flex items-center justify-center shadow-sm border border-border/50">
              <ion-icon :icon="svg(mdiAccountGroupOutline)" class="text-2xl text-secondary" />
            </div>
            <div>
              <h3 class="font-bold text-xl leading-tight cabin-sketch-regular text-foreground/90">Draw with Friends</h3>
              <p class="text-sm text-muted-foreground mt-1">
                Sketch together in real-time! Create private lobbies or join public ones.
              </p>
            </div>
          </div>

          <div class="flex gap-4">
            <div
              class="flex-shrink-0 w-12 h-12 rounded-2xl bg-secondary/30 flex items-center justify-center shadow-sm border border-border/50">
              <ion-icon :icon="svg(mdiBrushVariant)" class="text-2xl text-secondary" />
            </div>
            <div>
              <h3 class="font-bold text-xl leading-tight cabin-sketch-regular text-foreground/90">5 New Brushes</h3>
              <p class="text-sm text-muted-foreground mt-1">
                From Glow to Charcoal, unlock new styles for your art.
              </p>
            </div>
          </div>

          <div class="flex gap-4">
            <div
              class="flex-shrink-0 w-12 h-12 rounded-2xl bg-secondary/30 flex items-center justify-center text-2xl shadow-sm border border-border/50">
              ♾️
            </div>
            <div>
              <h3 class="font-bold text-xl leading-tight cabin-sketch-regular text-foreground/90">Infinite Space</h3>
              <p class="text-sm text-muted-foreground mt-1">
                The canvas is now limitless. Pan and zoom anywhere—your creativity has no borders!
              </p>
            </div>
          </div>

          <div class="flex gap-4">
            <div
              class="flex-shrink-0 w-12 h-12 rounded-2xl bg-secondary/30 flex items-center justify-center shadow-sm border border-border/50">
              <ion-icon :icon="svg(mdiMapOutline)" class="text-2xl text-secondary" />
            </div>
            <div>
              <h3 class="font-bold text-xl leading-tight cabin-sketch-regular text-foreground/90">Pro Minimap</h3>
              <p class="text-sm text-muted-foreground mt-1">
                Navigating huge drawings is easy now. Use the new minimap to see your whole masterpiece at once.
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
import { mdiAccountGroupOutline, mdiBrushVariant, mdiMapOutline } from '@mdi/js'
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
    }, 2000)
    user.value.last_seen_version = appVersion
    void api.updateUser({
      _id: user.value._id,
      last_seen_version: appVersion
    })
  }
})
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