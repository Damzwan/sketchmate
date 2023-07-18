<template>
  <ion-modal trigger="docs" @didDismiss="sectionPageContent = undefined">
    <ion-header>
      <ion-toolbar color="tertiary">
        <ion-title>Documentation</ion-title>
        <ion-buttons slot="start">
          <ion-button @click="modalController.dismiss()">
            <ion-icon :icon="svg(mdiClose)" slot="icon-only" />
          </ion-button>
        </ion-buttons>

        <!--        <ion-buttons slot="end">-->
        <!--          <ion-button>-->
        <!--            <ion-icon :icon="svg(mdiMagnify)" slot="icon-only" />-->
        <!--          </ion-button>-->
        <!--        </ion-buttons>-->
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <div v-if="sectionPageContent">
        <ion-buttons slot="start">
          <ion-button @click="sectionPageContent = undefined">
            <ion-icon :icon="svg(mdiArrowLeft)" slot="icon-only" />
          </ion-button>
        </ion-buttons>
        <vue-markdown :source="sectionPageContent" class="prose prose-base p-4" />
      </div>
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
import { svg } from '@/helper/general.helper.js'
import { mdiArrowLeft, mdiClose } from '@mdi/js'
import VueMarkdown from 'vue-markdown-render'
import { docsAccordionContent, DocsItem } from '@/config/draw/docs.config'
import { chevronDown } from 'ionicons/icons'
import { ref } from 'vue'

const accordionValues = ref<string[]>(docsAccordionContent.map(section => section.key))
const sectionPageContent = ref()

async function loadPageForSection(item: DocsItem) {
  if (!item.page) return
  const response = await fetch(item.page)
  sectionPageContent.value = await response.text()
  console.log(sectionPageContent.value)
}
</script>

<style scoped>
.accordion-header {
  --ion-background-color: #ffb995;
}

ion-accordion div ion-item {
  --padding-start: 25px;
}
</style>
