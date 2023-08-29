<template>
  <ion-modal :trigger="trigger" @willDismiss="onDismiss" @willPresent="onPresent" :canDismiss="canDismiss" mode="ios">
    <ion-header class="shadow-none">
      <ion-toolbar color="tertiary">
        <ion-title v-if="selectedSection">
          <ion-icon :icon="svg(docsMapping[selectedSection].icon)" class="align-sub w-[25px] h-[25px]" />
          {{ docsMapping[selectedSection].text }}
        </ion-title>
        <ion-title v-else>User Manual</ion-title>
        <ion-buttons slot="start">
          <ion-button @click="onBack">
            <ion-icon :icon="svg(backIcon)" slot="icon-only" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content ref="modalContent">
      <div v-if="selectedSection && sectionPageContent" @click="internalLink">
        <vue-markdown :source="sectionPageContent" class="prose prose-base custom-prose p-4" :html="true" />
        <div class="w-full flex justify-between">
          <ion-button v-if="prevSection" @click="loadPageForSection(prevSection)" fill="clear" color="secondary">
            <ion-icon slot="start" :icon="svg(mdiChevronLeft)" />
            {{ docsMapping[prevSection].text }}
          </ion-button>
          <div v-else />

          <ion-button v-if="nextSection" @click="loadPageForSection(nextSection)" fill="clear" color="secondary">
            <ion-icon slot="end" :icon="svg(mdiChevronRight)" />
            {{ docsMapping[nextSection].text }}
          </ion-button>
        </div>
      </div>
      <ion-accordion-group multiple ref="accordion" :value="docsAccordionContent" v-else>
        <ion-accordion
          :value="section"
          v-for="section in docsAccordionContent"
          :key="section"
          :toggle-icon="docsMapping[section].children ? chevronDown : ''"
        >
          <ion-item slot="header" class="accordion-header">
            <ion-icon :icon="svg(docsMapping[section].icon)" />
            <ion-label class="pl-4">{{ docsMapping[section].text }}</ion-label>
          </ion-item>

          <div class="ion-padding" slot="content" v-if="docsMapping[section].children">
            <ion-item
              v-for="subSection in docsMapping[section].children"
              :key="subSection"
              color="tertiary"
              :detail="true"
              :button="true"
              lines="none"
              @click="() => loadPageForSection(subSection)"
            >
              <ion-icon :icon="svg(docsMapping[subSection].icon)" />
              <ion-label class="pl-4">{{ docsMapping[subSection].text }}</ion-label>
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
import { mdiArrowLeft, mdiChevronLeft, mdiChevronRight, mdiClose } from '@mdi/js'
import { docsAccordionContent, DocsKey, docsMapping } from '@/config/draw/docs.config'
import { chevronDown } from 'ionicons/icons'
import VueMarkdown from 'vue-markdown-render'
import { App } from '@capacitor/app'
import { generateNextPrevForDocsItem } from '@/helper/draw/draw.helper'

const selectedSection = ref<DocsKey>()
const nextSection = ref<DocsKey>()
const prevSection = ref<DocsKey>()

const prevNextSetup = Object.keys(docsMapping).reduce((acc: any, curr: any) => {
  return { ...acc, ...generateNextPrevForDocsItem(docsMapping[curr as DocsKey]) }
}, {})

const sectionPageContent = ref()
const modalContent = ref()

let backListener: any = undefined

defineProps<{
  trigger: string
}>()

async function loadPageForSection(section: DocsKey) {
  const retrievedSection = docsMapping[section]
  const response = await fetch(retrievedSection.page)
  sectionPageContent.value = await response.text()
  selectedSection.value = section
  prevSection.value = prevNextSetup[section][0]
  nextSection.value = prevNextSetup[section][1]
  modalContent.value.$el.scrollToTop()
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

function internalLink(e: any) {
  if (!e.target.href) return
  const pageKey = e.target.href.substring(e.target.href.indexOf(':') + 1, e.target.href.lastIndexOf('.'))
  console.log(pageKey)
  loadPageForSection(pageKey as DocsKey)
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

<style>
.vue-link {
  color: blue;
  text-decoration: underline;
  cursor: pointer;
}

.vue-link:hover {
  text-decoration: none;
}
</style>
