<template>
  <div class="px-8 mb-4 bot-pad-safe exit-modal-container bg-tertiary">
    <!-- Visual Header -->
    <div class="text-center mb-4 mt-6">
      <h2 class="text-3xl cabin-sketch-regular font-black text-black tracking-tight">
        {{ isLobby ? 'Leave Session?' : 'Save Progress?' }}
      </h2>
      <p class="text-xl cabin-sketch-regular font-medium text-black/60 mt-2">
        {{ isLobby ? 'You\'ll be disconnected from the room.' : 'Don\'t lose your masterpiece!' }}
      </p>
    </div>

    <!-- Action Stack -->
    <div class="flex flex-col gap-2">

      <!-- 🚀 SOLO PRIMARY: SAVE -->
      <ion-button
        v-if="!isLobby"
        expand="block"
        shape="round"
        color="secondary"
        class="main-exit-btn cabin-sketch-regular font-black"
        @click="dismiss('save')"
      >
        Save & Exit
      </ion-button>

      <!-- 🚀 LOBBY PRIMARY: EXIT -->
      <ion-button
        v-if="isLobby"
        expand="block"
        shape="round"
        color="secondary"
        class="main-exit-btn cabin-sketch-regular font-black"
        @click="dismiss('leave')"
      >
        Exit Room
      </ion-button>

      <!-- ❌ SOLO DESTRUCTIVE: DISCARD (Hidden in Lobby) -->
      <ion-button
        v-if="!isLobby"
        expand="block"
        fill="clear"
        color="secondary"
        class="discard-btn cabin-sketch-regular font-black"
        @click="dismiss('discard')"
      >
        Discard Changes
      </ion-button>

      <!-- ↩️ NEUTRAL: GO BACK (Unified Design) -->
      <ion-button
        expand="block"
        fill="clear"
        color="secondary"
        class="cancel-btn cabin-sketch-regular font-bold"
        @click="dismiss('cancel')"
      >
        Go Back
      </ion-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { IonButton, modalController } from '@ionic/vue'

defineProps<{ isLobby: boolean }>()

const dismiss = (role: string) => modalController.dismiss(null, role)
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

.discard-btn {
  font-size: 1rem;
  margin-top: 4px;
}

.cancel-btn {
  --opacity: 0.8;
  /* Matching the font-size of discard for consistency */
  font-size: 1rem;
}

.bg-tertiary {
  background-color: var(--ion-color-tertiary);
}
</style>

<style>
/* Global Modal overrides - ensure these are where the modal is created */
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
  /* This helps the "height: auto" work correctly in some browser versions */
  position: relative;
  display: block;
}
</style>