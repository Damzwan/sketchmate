<template>
  <ion-header class="shadow-none">
    <ion-toolbar color="tertiary">
      <ion-title>Documentation</ion-title>
      <ion-buttons slot="start">
        <ion-button @click="modalController.dismiss()">
          <ion-icon :icon="svg(mdiClose)" slot="icon-only" />
        </ion-button>
      </ion-buttons>
    </ion-toolbar>
  </ion-header>

  <ion-content>
    <ion-accordion-group multiple ref="accordion" :value="accordionValues">
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
          <ion-nav-link
            router-direction="forward"
            :component="SectionPage as any"
            :componentProps="{ selectedSection: selectedSection }"
          >
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
          </ion-nav-link>
        </div>
      </ion-accordion>
    </ion-accordion-group>
  </ion-content>
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
  IonNavLink,
  IonTitle,
  IonToolbar,
  modalController
} from '@ionic/vue'
import { svg } from '@/helper/general.helper'
import { mdiClose } from '@mdi/js'
import { docsAccordionContent, DocsItem } from '@/config/draw/docs.config'
import { chevronDown } from 'ionicons/icons'
import { ref } from 'vue'
import SectionPage from '@/components/draw/menu/docs/SectionDocsPage.vue'

const accordionValues = ref<string[]>(docsAccordionContent.map(section => section.key))
const selectedSection = ref<DocsItem>()

async function loadPageForSection(item: DocsItem) {
  selectedSection.value = item
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
