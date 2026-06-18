<template>
  <ion-toast
    ref="toastRef"
    :is-open="isOpen"
    :message="text"
    :duration="duration"
    :buttons="buttons"
    :color="color"
    :position="position"
    @didDismiss="dismiss()"
    class="global-toast"
  />
</template>

<script setup lang="ts">
import { ref } from "vue";
import { IonToast } from "@ionic/vue";
import { useToast } from "@/service/toast.service";
import { useSwipe } from "@vueuse/core";

const { text, isOpen, dismiss, duration, color, buttons, position } =
	useToast();

const toastRef = ref();

useSwipe(toastRef, {
	onSwipeEnd(e, direction) {
		dismiss();
	},
});
</script>

<style lang="scss">
.global-toast {
  --border-radius: 16px;
  --button-color: var(--ion-color-primary-contrast);

  &::part(message) {
    font-family: 'Cabin Sketch', cursive;
    font-weight: bold;
    font-size: 16px;
  }
}
</style>