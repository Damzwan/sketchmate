<template>
  <div class="w-full flex flex-col bottom-0">
    <ion-button v-if="docs" fill="clear" color="secondary" :id="id">User Manual</ion-button>
    <DocsMenu :trigger="id" />
    <ion-button v-if="form" fill="clear" color="secondary" href="https://forms.gle/x6odhcdEJHx7Zm8N8" target="_blank"
      >Feedback Form
    </ion-button>
    <ion-button v-if="blog" fill="clear" color="secondary" href="https://sketchmate.ninja/blog/" target="_blank"
      >Blog
    </ion-button>
    <ion-button v-if="contact" fill="clear" color="secondary" href="mailto:contact@sketchmate.ninja"
      >Contact Me
    </ion-button>
    <ion-button v-if="!isNative() && installPrompt" fill="clear" color="secondary" @click="installPWA"
      >Install SketchMate
    </ion-button>
    <ion-button v-if="showIosSafariInstructions()" fill="clear" color="secondary" :id="pwaInstructionId"
      >Install Sketchmate</ion-button
    >
    <IosPwaInstructions :trigger="pwaInstructionId" v-if="showIosSafariInstructions()" />
  </div>
</template>

<script lang="ts" setup>
import { v4 as uuidv4 } from 'uuid'
import DocsMenu from '@/components/draw/menu/DocsMenu.vue'
import { IonButton } from '@ionic/vue'
import { useAppStore } from '@/store/app.store'
import { storeToRefs } from 'pinia'
import { isNative, showIosSafariInstructions } from '@/helper/general.helper'
import IosPwaInstructions from '@/components/general/IosPwaInstructions.vue'

const { installPrompt } = storeToRefs(useAppStore())
const pwaInstructionId = uuidv4()

export interface Props {
  docs?: boolean
  form?: boolean
  blog?: boolean
  contact?: boolean
}

withDefaults(defineProps<Props>(), {
  docs: true,
  form: true,
  blog: true,
  contact: true
})

const id = uuidv4()

async function installPWA() {
  if (installPrompt.value) {
    installPrompt.value.prompt()
    const { outcome } = await installPrompt.value.userChoice
    if (outcome === 'accepted') {
      installPrompt.value = null
    }
  }
}
</script>

<style scoped>
@media screen and (max-height: 700px) {
  ion-button {
    height: 35px !important;
    min-height: 35px !important;
  }
}
</style>
