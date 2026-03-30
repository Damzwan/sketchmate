<template>
  <div class="mx-2">
    <div class="card bg-purple-300">
      <div class="flex-1 pr-3">
        <p class="cabin-sketch-regular text-xl font-bold flex items-center gap-2">
          Live Drawing!
          <span class="bg-secondary text-white text-[10px] px-2 py-0.5 rounded-full uppercase italic">
    New
  </span>
        </p>
        <p class="text-sm cabin-sketch-regular mt-1 text-gray-800">
          Collaborate on a canvas in real time
        </p>

        <ion-button
          fill="outline"
          color="dark"
          class="mt-3"
          @click="drawTogether"
        >
          Start Drawing
        </ion-button>
      </div>

      <img
        :src="drawing"
        alt="Collaborative drawing illustration"
        class="w-32 h-32 object-contain"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { Menu } from '@/draw/types/draw.types'
import { IonButton, useIonRouter } from '@ionic/vue'
import { useMenuStore } from '@/store/menu.store'
import drawing from '@/assets/illustrations/draw_together.webp'
import { FRONTEND_ROUTES } from '@/types/router.types'

const { openMenu } = useMenuStore()
const router = useIonRouter()

function drawTogether() {
  router.push(FRONTEND_ROUTES.draw)
  setTimeout(() => {
    openMenu(Menu.DrawRoomMenu)
  }, 500)
}
</script>

<style scoped>
@reference "@/theme/main.css";

.card {
  @apply w-full mx-auto rounded-xl p-4 max-w-96 flex justify-between items-center shadow-md;
}
</style>