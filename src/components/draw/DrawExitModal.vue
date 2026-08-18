<template>
  <div class="px-8 mb-4 bot-pad-safe exit-modal-container bg-tertiary">
    <div class="text-center mb-4 mt-6">
      <h2 class="text-3xl cabin-sketch-regular font-black text-black tracking-tight">
        {{ isEmptyDeletion ? 'Discard Draft?' : 'Leave Session?' }}
      </h2>

      <p v-if="isLobby" class="text-xl cabin-sketch-regular font-medium text-black/60 mt-2">
        You'll be disconnected from the room.
      </p>
      <p v-else-if="isEmptyDeletion" class="text-xl cabin-sketch-regular font-medium text-black/60 mt-2">
        This draft is empty. Exiting will remove it from your gallery storage.
      </p>
      <p v-else class="text-xl cabin-sketch-regular font-medium text-black/60 mt-2">
        Don't worry, your progress is automatically saved!
      </p>
    </div>

    <div class="flex flex-col gap-2">
      <ion-button
        expand="block"
        shape="round"
        color="secondary"
        class="main-exit-btn font-black"
        @click="dismiss('leave')"
      >
        {{ isLobby ? 'Leave Room' : (isEmptyDeletion ? 'Discard & Exit' : 'Exit') }}
      </ion-button>

      <ion-button
        expand="block"
        fill="clear"
        color="secondary"
        class="cancel-btn font-bold"
        @click="dismiss('cancel')"
      >
        Keep Drawing
      </ion-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { IonButton, modalController } from "@ionic/vue";

defineProps<{
	isLobby: boolean;
	isEmptyDeletion: boolean; // Evaluates conditional strings for clean warning feedback
}>();

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