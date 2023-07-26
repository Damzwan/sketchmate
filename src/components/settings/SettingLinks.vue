<template>
  <div class="w-full flex flex-col bottom-0">
    <ion-button v-if="docs" fill="clear" color="secondary" id="docs">User Manual</ion-button>
    <DocsMenu />
    <ion-button v-if="form" fill="clear" color="secondary" href="https://forms.gle/x6odhcdEJHx7Zm8N8" target="_blank"
      >Feedback Form
    </ion-button>
    <ion-button v-if="blog" fill="clear" color="secondary" href="https://sketchmate.ninja/blog/" target="_blank"
      >Blog</ion-button
    >
    <ion-button v-if="contact" fill="clear" color="secondary" href="mailto:damian.vlaicu@gmail.com"
      >Contact Me</ion-button
    >
  </div>
</template>

<script lang="ts" setup>
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

import DocsMenu from '@/components/draw/menu/DocsMenu.vue'
import { IonButton } from '@ionic/vue'
</script>
