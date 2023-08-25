<template>
  <ion-modal trigger="connect_help" @willPresent="loadMD" mode="ios">
    <ion-header class="shadow-none">
      <ion-toolbar color="tertiary">
        <ion-title>How to connect</ion-title>
        <ion-buttons slot="start">
          <ion-button @click="close">
            <ion-icon :icon="svg(mdiArrowLeft)" slot="icon-only" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <vue-markdown :source="md" class="prose prose-base custom-prose p-6" v-if="md" />
    </ion-content>
  </ion-modal>
</template>

<script lang="ts" setup>
import {
  IonButton,
  IonButtons,
  IonHeader,
  IonIcon,
  IonModal,
  IonTitle,
  IonToolbar,
  modalController,
  IonContent
} from '@ionic/vue'
import { svg } from '@/helper/general.helper'
import { mdiArrowLeft } from '@mdi/js'
import VueMarkdown from 'vue-markdown-render'
import connectDocsPage from '@/assets/docs/connect.md'
import { ref } from 'vue'

const md = ref()

function close() {
  modalController.dismiss()
}

async function loadMD() {
  const response = await fetch(connectDocsPage as any)
  md.value = await response.text()
}
</script>

<style scoped></style>
