<!-- components/chat/ChatMessageBubble.vue -->
<template>
  <div class="w-full">
    <!-- System Messages -->
    <div v-if="msg.type && msg.type !== 'message'" class="flex justify-center w-full my-2">
      <div @click="$emit('inspect-profile', $event, msg.member || partner)" class="flex items-center gap-1.5 px-2 py-1 cursor-pointer active:opacity-60 transition-opacity">
        <img :src="msg.member?.img || partner?.img" class="w-6 h-6 rounded-full object-cover opacity-80" />
        <span class="text-[11px] font-bold cabin-sketch-regular text-black/40 uppercase">
          <span class="text-black/60">{{ msg.member?.name || partner?.name }}</span>
          <span class="ml-1">{{ msg.type === 'join' ? 'joined' : 'left' }}</span>
        </span>
      </div>
    </div>

    <!-- User Messages -->
    <div v-else class="flex items-start gap-2.5 px-1 py-0.5" :class="{'flex-row-reverse': isMe, 'mt-[-6px]': isCompact}">
      <div class="w-8 h-8 shrink-0 flex items-end" v-if="!isMe && !isCompact">
        <img :src="partner?.img" class="w-8 h-8 rounded-xl object-cover border-2 border-white shadow-sm" />
      </div>
      <div v-else-if="!isMe" class="w-8 shrink-0"></div>

      <div class="flex flex-col max-w-[75%]" :class="{ 'items-end': isMe }">
        <div class="py-2 px-3.5 text-[15px] shadow-sm cabin-sketch-regular tracking-wide"
             :class="isMe ? 'bg-secondary text-white rounded-2xl rounded-tr-sm' : 'bg-white/80 text-black rounded-2xl rounded-tl-sm border border-white/60'">

          <div v-if="!isCompact && !isMe && activeTab === 'lobby'" class="text-[8px] font-black mb-1 opacity-50 uppercase font-sans">
            {{ msg.member?.name || partner?.name }}
          </div>

          <div class="font-bold">{{ msg.content || msg.message }}</div>

          <div class="text-[8px] mt-1 font-sans opacity-80 flex justify-end items-center gap-1">
            <span>{{ dayjs(msg.createdAt).format('HH:mm') }}</span>
            <span v-if="isMe && activeTab !== 'lobby'" class="text-[11px] flex items-center">
              <ion-icon v-if="msg.status === 'sending'" :icon="timeOutline" class="opacity-60" />
              <ion-icon v-else-if="msg.status === 'error'" :icon="alertCircleOutline" class="text-red-300" />
              <ion-icon v-else :icon="checkmarkDoneOutline" class="text-white" />
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import dayjs from 'dayjs'
import { IonIcon } from '@ionic/vue'
import { timeOutline, alertCircleOutline, checkmarkDoneOutline } from 'ionicons/icons'

defineProps<{
  msg: any;
  partner: any;
  isMe: boolean;
  isCompact: boolean;
  activeTab: string;
}>()

defineEmits(['inspect-profile'])
</script>