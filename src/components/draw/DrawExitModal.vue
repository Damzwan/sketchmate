<template>
  <div class="px-8 mb-4 bot-pad-safe exit-modal-container bg-tertiary">
    <div class="text-center mb-4 mt-6">
      <h2 class="text-3xl cabin-sketch-regular font-black text-black tracking-tight">
        Leave Session?
      </h2>
      <p class="text-xl cabin-sketch-regular font-medium text-black/60 mt-2">
        You'll be disconnected from the room.
      </p>
    </div>

    <div class="flex flex-col gap-2">
      <ion-button
        expand="block"
        shape="round"
        color="secondary"
        class="main-exit-btn cabin-sketch-regular font-black"
        @click="dismiss('leave')"
      >
        Leave Room
      </ion-button>

      <ion-button
        expand="block"
        fill="clear"
        color="secondary"
        class="cancel-btn cabin-sketch-regular font-bold"
        @click="dismiss('cancel')"
      >
        Stay
      </ion-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { IonButton, modalController } from "@ionic/vue";

const dismiss = (role: string) => modalController.dismiss(null, role);
</script>

<style scoped>
.main-exit-btn {
  --border-width: 2px;
  --border-color: black;
  --border-style: solid;
  --box-shadow: 0 4px 0px rgba(0, 0, 0, 0.1);
  font-size: 1.1rem;
  height: 60px;
}

.cancel-btn {
  --opacity: 0.8;
  font-size: 1rem;
}

.bg-tertiary {
  background-color: var(--ion-color-tertiary);
}
</style>

<style>
ion-modal.draw-exit-modal {
  --height: auto;
  --background: var(--ion-color-tertiary);
  --border-radius: 40px 40px 0 0;
  align-items: flex-end;
}

ion-modal.draw-exit-modal .ion-page {
  justify-content: flex-end;
  background: transparent !important;
}

ion-modal.draw-exit-modal::part(content) {
  position: relative;
  display: block;
}
</style>