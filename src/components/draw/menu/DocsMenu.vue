<template>
  <ion-modal :trigger="trigger" @willDismiss="onDismiss" @willPresent="onPresent" :canDismiss="canDismiss" mode="ios">
    <ion-header class="shadow-none">
      <ion-toolbar color="tertiary">
        <ion-title v-if="selectedSection">
          <ion-icon :icon="svg(selectedSection.icon)" class="align-sub w-[25px] h-[25px]" />
          {{ selectedSection.text }}
        </ion-title>
        <ion-title v-else>User Manual</ion-title>
        <ion-buttons slot="start">
          <ion-button @click="onBack">
            <ion-icon :icon="svg(backIcon)" slot="icon-only" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <vue-markdown
        :source="sectionPageContent"
        class="prose prose-base custom-prose p-4"
        v-if="selectedSection && sectionPageContent"
      />
      <ion-accordion-group multiple ref="accordion" :value="accordionValues" v-else>
        <ion-accordion
          :value="section.key"
          v-for="section in docsAccordionContent"
          :key="section.key"
          :toggle-icon="section.children ? chevronDown : ''"
        >
          <ion-item slot="header" class="accordion-header">
            <ion-icon :icon="svg(section.icon)" />
            <ion-label class="pl-4">{{ section.text }}</ion-label>
          </ion-item>

          <div class="ion-padding" slot="content" v-if="section.children">
            <ion-item
              v-for="subSection in section.children"
              :key="subSection.key"
              color="tertiary"
              :detail="true"
              :button="true"
              lines="none"
              @click="() => loadPageForSection(subSection)"
            >
              <ion-icon :icon="svg(subSection.icon)" />
              <ion-label class="pl-4">{{ subSection.text }}</ion-label>
            </ion-item>
          </div>
        </ion-accordion>
      </ion-accordion-group>
    </ion-content>
  </ion-modal>
</template>

<script lang="ts" setup>
import {
  IonAccordion,
  IonAccordionGroup,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonModal,
  IonTitle,
  IonToolbar,
  modalController
} from '@ionic/vue'
import { getCurrentRoute, isNative, setAppColors, svg } from '@/helper/general.helper'
import { colorsPerRoute, settingsModalColorConfig } from '@/config/colors.config'
import { computed, ref } from 'vue'
import { mdiArrowLeft, mdiClose } from '@mdi/js'
import { docsAccordionContent, DocsItem } from '@/config/draw/docs.config'
import { chevronDown } from 'ionicons/icons'
import VueMarkdown from 'vue-markdown-render'
import { App } from '@capacitor/app'

const accordionValues = ref<string[]>(docsAccordionContent.map(section => section.key))
const selectedSection = ref<DocsItem>()
const sectionPageContent = ref()

let backListener: any = undefined

defineProps<{
  trigger: string
}>()

async function loadPageForSection(item: DocsItem) {
  if (!item.page) return
  const response = await fetch(item.page)
  sectionPageContent.value = await response.text()
  selectedSection.value = item
}

function onBack() {
  selectedSection.value ? (selectedSection.value = undefined) : modalController.dismiss()
}

async function onDismiss() {
  setAppColors(colorsPerRoute[getCurrentRoute()])
  selectedSection.value = undefined
  await backListener.remove()
}

async function onPresent() {
  setAppColors(settingsModalColorConfig)
  backListener = await App.addListener('backButton', () => {
    setTimeout(() => (selectedSection.value = undefined), 20)
  })
}

const backIcon = computed(() => (selectedSection.value ? mdiArrowLeft : mdiClose))

async function canDismiss() {
  return !isNative() || !selectedSection.value
}
</script>

<style scoped>
.accordion-header {
  --ion-background-color: #ffb995;
}

ion-accordion div ion-item {
  --padding-start: 25px;
}

ion-modal {
  --backdrop-opacity: 0.4 !important;
}
</style>
