<!-- components/chat/InviteList.vue -->
<template>
  <div v-if="invitations.length > 0" class="px-2 mb-6 animate-fade-in">
    <div class="flex items-center gap-2 mb-2 px-1">
      <div class="w-1.5 h-1.5 bg-secondary rounded-full animate-pulse"></div>
      <div class="text-[10px] font-black text-secondary uppercase tracking-widest">
        Drawing Invites
      </div>
    </div>

    <div class="space-y-2">
      <div
        v-for="invite in invitations"
        :key="invite.roomId"
        class="flex items-center justify-between p-3 bg-white/60 border border-secondary/20 rounded-[1.8rem] shadow-sm backdrop-blur-md"
      >
        <div class="flex items-center gap-3">
          <!-- Avatar with Drawing Badge -->
          <div class="relative">
            <img
              :src="invite.friend.img"
              class="w-11 h-11 rounded-2xl object-cover border-2 border-white shadow-sm"
            />
            <div class="absolute -bottom-1 -right-1 bg-secondary rounded-full p-1 border-2 border-white shadow-sm">
              <ion-icon :icon="svg(mdiDraw)" class="text-[10px] text-white" />
            </div>
          </div>

          <div class="flex flex-col">
            <span class="text-sm font-black text-black leading-none truncate max-w-[120px] cabin-sketch-regular">
              {{ invite.friend.name }}
            </span>
            <span class="text-[9px] font-black text-secondary uppercase mt-1 tracking-widest opacity-70">
              Wants to sketch
            </span>
          </div>
        </div>

        <button
          @click="$emit('join', invite.roomId)"
          class="px-5 py-2.5 bg-secondary text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-lg active:scale-90 transition-all"
        >
          Join
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { IonIcon } from '@ionic/vue'
import { mdiDraw } from '@mdi/js'
import { svg } from '@/helper/general.helper'

defineProps<{
  invitations: any[]
}>()

defineEmits(['join'])
</script>