<template>
  <ion-header class="shadow-none">
    <ion-toolbar color="tertiary">
      <ion-title>
        {{ selectedSection.text }}
        <ion-icon :icon="svg(selectedSection.icon)" class="align-sub w-[25px] h-[25px]" />
      </ion-title>
      <ion-buttons slot="start">
        <ion-back-button ref="backBtn" />
      </ion-buttons>
    </ion-toolbar>
  </ion-header>

  <ion-content>
    <vue-markdown
      :source="sectionPageContent"
      class="prose prose-base custom-prose p-4"
      v-if="selectedSection && sectionPageContent"
    />
  </ion-content>
</template>

<script lang="ts" setup>
import VueMarkdown from 'vue-markdown-render'
import { DocsItem } from '@/config/draw/docs.config'
import {
  IonBackButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonTitle,
  IonToolbar,
  useIonRouter
} from '@ionic/vue'
import { onBeforeMount, onUnmounted, ref } from 'vue'
import { svg } from '@/helper/general.helper'
import { App } from '@capacitor/app'

const sectionPageContent = ref()
const backBtn = ref()

const props = defineProps<{
  selectedSection: DocsItem
}>()

let backListener: any = undefined

onBeforeMount(async () => {
  if (!props.selectedSection.page) return
  const response = await fetch(props.selectedSection.page)
  sectionPageContent.value = await response.text()

  backListener = await App.addListener('backButton', () => {
    backBtn.value.$el.click()
  })
})

onUnmounted(async () => {
  if (backListener) {
    await backListener.remove()
  }
})
</script>

<style scoped>
.custom-prose {
  @apply prose-h2:my-4 prose-h3:my-3;
}
</style>
