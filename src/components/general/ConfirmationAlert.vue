<template>
  <ion-alert
    :trigger="trigger"
    :header="header"
    message="This drawing will be deleted permanently"
    :buttons="alertButtons"
    mode="ios"
  />
</template>

<script lang="ts" setup>
import { IonAlert } from '@ionic/vue'
defineProps<{
  trigger: string
  header: string
}>()

const emits = defineEmits(['cancel', 'confirm'])

const alertButtons = [
  {
    text: 'Cancel',
    role: 'cancel',
    handler: () => emits('cancel')
  },
  {
    text: 'OK',
    role: 'confirm',
    handler: () => emits('confirm')
  }
]
</script>

<style scoped></style>
