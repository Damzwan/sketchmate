<template>
  <ion-alert :trigger="trigger" :header="header" :message="message" :buttons="alertButtons" />
</template>

<script lang="ts" setup>
import { IonAlert } from '@ionic/vue'
defineProps<{
  trigger: string
  header: string
  message: string
}>()

const emits = defineEmits(['cancel', 'confirm'])

const alertButtons = [
  {
    text: 'Cancel',
    role: 'cancel',
    handler: () => emits('cancel'),
    cssClass: 'alert-button-cancel'
  },
  {
    text: 'OK',
    role: 'confirm',
    handler: () => emits('confirm'),
    cssClass: 'alert-button-confirm'
  }
]
</script>

<style scoped>
ion-alert {
  --background: var(--ion-color-tertiary);
}
</style>

<style>
button.alert-button.alert-button-confirm {
  color: var(--ion-color-secondary);
}

button.alert-button.alert-button-cancel {
  color: var(--ion-color-secondary);
}
</style>
