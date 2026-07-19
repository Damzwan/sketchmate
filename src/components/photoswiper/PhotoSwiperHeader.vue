<template>
  <ion-toolbar class="w-full min-h-14 flex items-start pt-1 pb-1">
    <ion-buttons slot="start" class="self-start mt-1">
      <ion-button @click="$emit('close')" color="light">
        <ion-icon :icon="arrowBack" />
      </ion-button>
    </ion-buttons>

    <div v-if="type === 'post'" class="flex flex-col justify-center flex-1 px-2 text-white mt-1 mb-1">
      <div class="flex items-center space-x-2 mb-1">
        <img
          :src="currItem.author?.img || senderImg(currItem.author_id)"
          class="w-6 h-6 rounded-full object-cover border border-white/20"
        />
        <span class="text-sm font-bold cabin-sketch-regular">
          {{ currItem.author?.name || 'Sketcher' }}
        </span>
      </div>
      <p v-if="currItem.description" class="text-xs cabin-sketch-regular opacity-80 line-clamp-2 leading-tight">
        {{ currItem.description }}
      </p>
    </div>

    <ion-buttons slot="end" class="self-start mt-1">
      <!-- The comment-visibility toggle used to live here. It's gone: a control
           in the header for a strip at the bottom, next to a footer button that
           opened the full thread, meant three related controls in three places
           and an unlabelled icon nobody could decode. The footer comment button
           now owns the peek strip. -->
      <button
        v-if="type === 'inbox' && currItem.followers && currItem.followers.length > 0"
        class="flex -space-x-6 pr-2 cursor-pointer"
        @click="$emit('open-followers')"
      >
        <img
          v-for="(follower, i) in [...currItem.followers].reverse().slice(0, badgesCountToShow)"
          :key="follower"
          :src="senderImg(resolveUser(follower))"
          :alt="follower"
          class="w-[36px] h-[36px] rounded-full border-secondary-light border-[1px]"
          :style="{ zIndex: i }"
        />
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
import { IonToolbar, IonButtons, IonButton, IonIcon } from "@ionic/vue";
import { arrowBack } from "ionicons/icons";
import { senderImg } from "@/helper/general.helper";

const props = defineProps<{
	currItem: any;
	type: "post" | "inbox";
	userLookup?: (userId: string) => any;
}>();

defineEmits(["close", "open-followers"]);

const badgesCountToShow = 3;

function resolveUser(userId: string) {
	return props.userLookup ? props.userLookup(userId) : userId;
}
</script>

<style scoped>
ion-toolbar {
  --background: rgba(0, 0, 0, 0.85);
}
</style>