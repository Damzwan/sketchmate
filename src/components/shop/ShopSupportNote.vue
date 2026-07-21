<template>
  <DevNote title="SketchMate Big Boss">
    <p>
      Hey! I'm the solo developer behind SketchMate. I spent <span class="text-secondary font-black">1,000+ hours</span>
      creating this app. I am trying to keep the app mainly free and ad-free. Your support keeps it alive
      <ion-icon :icon="svg(mdiHeart)" class="text-secondary text-sm align-[-1px]" />
    </p>
  </DevNote>
</template>

<script setup lang="ts">
import { IonIcon } from "@ionic/vue";
import { mdiHeart } from "@mdi/js";
import { svg } from "@/helper/general.helper";
import DevNote from "@/components/general/DevNote.vue";
</script>
