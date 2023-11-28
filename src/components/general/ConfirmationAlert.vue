<template>
  <ion-alert
  :is-open="isOpen"
    :trigger="trigger"
    :header="header"
    :message="message"
    :buttons="alertButtons"
    @keyup.enter="confirm"
    @keyup.delete="cancel"
    @didDismiss="() => emits('update:isOpen', false)"
  />
</template>

<script lang="ts" setup>
import { alertController, IonAlert } from '@ionic/vue'

const props = withDefaults(defineProps<{
  trigger?: string
  header: string
  message?: string
  confirmationtext?: string
  isOpen?: boolean
}>(), {
  isOpen: false
})

const emits = defineEmits(['cancel', 'confirm', 'update:isOpen'])

function confirm() {
  emits('confirm')
  alertController.dismiss()
}

function cancel() {
  emits('cancel')
  alertController.dismiss()
}

const alertButtons = [
  {
    text: 'Cancel',
    role: 'cancel',
    handler: () => emits('cancel'),
    cssClass: 'alert-button-cancel'
  },
  {
    text: props.confirmationtext || 'Ok',
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
