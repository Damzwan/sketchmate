<template>
  <ion-header class="ion-no-border bg-background relative w-full z-50 top-pad-safe shadow-none">
    <div class="flex items-center px-2 h-[60px]">

      <!-- Standardized Back Button -->
      <ion-back-button
        default-href="/chat"
        :icon="chevronBackOutline"
        text=""
        class="text-black"
      />

      <!-- Partner Info Group -->
      <div class="flex items-center flex-1 min-w-0 ml-1">
        <!-- Avatar with Liquid Border -->
        <div class="relative w-10 h-10 rounded-[1.2rem] bg-primary/20 flex items-center justify-center shrink-0 border border-primary/30 shadow-sm overflow-hidden">
          <img v-if="partner?.img" :src="partner.img" class="w-full h-full object-cover" />
          <span v-else class="cabin-sketch-regular text-lg font-bold text-black">
            {{ partner?.name?.charAt(0) || '?' }}
          </span>

          <!-- Online Indicator -->
          <div
            v-if="isOnline"
            class="absolute top-1 right-1 w-2.5 h-2.5 bg-green-500 border border-white rounded-full z-10 animate-pulse shadow-sm"
          ></div>
        </div>

        <!-- Identity & Status -->
        <div class="ml-3 flex flex-col justify-center min-w-0">
          <p class="cabin-sketch-regular text-xl font-bold text-black leading-none truncate mt-1">
            {{ partner?.name || 'Loading...' }}
          </p>

          <div class="h-3 flex items-center mt-0.5">
            <span v-if="isTyping" class="text-[10px] font-black text-tertiary italic">
              typing...
            </span>
            <span v-else-if="isOnline" class="text-[9px] font-black uppercase text-green-600 tracking-wider">
              Online Now
            </span>
          </div>
        </div>
      </div>

      <!-- Right Side Actions -->
      <div class="flex items-center">
        <ion-button fill="clear" class="m-0 p-0 active:scale-90 transition-transform opacity-40">
          <ion-icon slot="icon-only" :icon="svg(mdiDotsVertical)" class="text-[24px] text-black" />
        </ion-button>
      </div>

    </div>
  </ion-header>
</template>

<script setup lang="ts">
import { IonHeader, IonIcon, IonBackButton, IonButton } from '@ionic/vue'
import { chevronBackOutline } from 'ionicons/icons'
import { mdiDotsVertical } from '@mdi/js'
import { svg } from '@/helper/general.helper'
import { Mate } from '@/types/server.types'

defineProps<{
  partner?: Mate | null;
  isOnline: boolean;
  isTyping: boolean;
}>()
</script>

<style scoped>
@reference "@/theme/main.css";

ion-back-button {
  --color: black;
}


</style>