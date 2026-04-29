<template>
  <ion-toolbar class="w-full h-14 flex">
    <ion-buttons slot="start">
      <ion-button @click="$emit('close')" color="light">
        <ion-icon :icon="arrowBack" />
      </ion-button>
    </ion-buttons>

    <ion-buttons slot="end">
      <ion-button
        v-if="(currItem.comments || []).length > 0"
        @click="$emit('update:showComments', !showComments)"
        color="light"
        class="pr-2"
      >
        <ion-icon :icon="svg(showComments ? mdiChatRemoveOutline : mdiChatOutline)" class="w-[25px] h-[25px]" />
      </ion-button>

      <button
        v-if="currItem.followers && currItem.followers.length > 0"
        class="flex -space-x-6 pr-2"
        @click="$emit('open-followers')"
      >
        <img
          v-for="(follower, i) in [...currItem.followers].reverse().slice(0, badgesCountToShow)"
          :key="follower"
          :src="senderImg(resolveUser(follower))"
          :alt="follower"
          class="w-[36px] h-[36px] rounded-full border-secondary-light border-[1px]"
          :style="{ zIndex: i }"
        >

        <div
          v-if="currItem.followers.slice(badgesCountToShow).length > 0"
          class="w-[36px] h-[36px] rounded-full border-secondary-light border-[1px] flex justify-center items-center bg-white"
          :style="{ zIndex: currItem.followers.length + 1 }"
        >
          <p class="text-gray-600">{{ currItem.followers.slice(badgesCountToShow).length }}+</p>
        </div>
      </button>
    </ion-buttons>
  </ion-toolbar>
</template>

<script setup lang="ts">
import { IonToolbar, IonButtons, IonButton, IonIcon } from '@ionic/vue'
import { arrowBack } from 'ionicons/icons'
import { mdiChatOutline, mdiChatRemoveOutline } from '@mdi/js'
import { svg, senderImg } from '@/helper/general.helper'

const props = defineProps<{
  currItem: any
  showComments: boolean
  userLookup?: (userId: string) => any
}>()

defineEmits(['close', 'open-followers', 'update:showComments'])

const badgesCountToShow = 3

function resolveUser(userId: string) {
  return props.userLookup ? props.userLookup(userId) : userId
}
</script>

<style scoped>
ion-toolbar {
  --background: #000000;
}
</style>