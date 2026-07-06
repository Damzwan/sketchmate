<template>
  <div class="flex items-start gap-3">
    <img
      :src="bigbossImage"
      alt="Developer"
      class="w-11 h-11 rounded-full object-cover border-2 border-primary/50 shadow-sm shrink-0"
    />
    <div class="relative flex-1 min-w-0 rounded-2xl rounded-tl-sm border border-primary/40 bg-tertiary px-3.5 py-2.5">
      <!-- little speech tail -->
      <span class="absolute -left-1.5 top-3 w-3 h-3 rotate-45 bg-tertiary border-l border-b border-primary/40"></span>
      <p class="text-[14px] font-black text-black leading-none">SketchMate Big Boss</p>
      <p class="text-[13px] leading-snug mt-1.5">
        Hey! I'm the solo dev behind SketchMate. I spent <span class="text-secondary font-black">1,000+ hours</span>
        creating this app. I am trying to keep the app mainly free and ad-free. Your support keeps it alive
        <ion-icon :icon="svg(mdiHeart)" class="text-secondary text-sm align-[-1px]" />
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { IonIcon } from '@ionic/vue'
import { mdiHeart } from '@mdi/js'
import { svg } from '@/helper/general.helper'
import bigbossImage from '@/assets/bigboss.jpg'
</script>
