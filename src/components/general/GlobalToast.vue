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
    :data-on-draw="isDrawScreen"
  />
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import { IonToast } from '@ionic/vue'
import { useToast } from '@/service/toast.service'
import { useSwipe } from '@vueuse/core'
import { FRONTEND_ROUTES } from '@/types/router.types'

const { text, isOpen, dismiss, duration, color, buttons, position } =
  useToast()

const route = useRoute()
const isDrawScreen = computed(
  () =>
    route.name === FRONTEND_ROUTES.draw ||
    route.path.includes(`/${FRONTEND_ROUTES.draw}`)
)

const toastRef = ref()

useSwipe(toastRef, {
  onSwipeEnd(e, direction) {
    dismiss()
  }
})
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

  transition: transform 0.25s cubic-bezier(0.32, 0.72, 0, 1);

  &[data-on-draw="true"] {
    transform: translateY(-86px);
  }
}
</style>