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
      <ion-button
        v-if="displayCommentCount > 0"
        @click="$emit('update:showComments', !showComments)"
        color="light"
        class="pr-2"
      >
        <ion-icon :icon="svg(showComments ? mdiChatRemoveOutline : mdiChatOutline)" class="w-[25px] h-[25px]" />
      </ion-button>

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
import { computed } from "vue";
import { IonToolbar, IonButtons, IonButton, IonIcon } from "@ionic/vue";
import { arrowBack } from "ionicons/icons";
import { mdiChatOutline, mdiChatRemoveOutline } from "@mdi/js";
import { svg, senderImg } from "@/helper/general.helper";

const props = defineProps<{
	currItem: any;
	type: "post" | "inbox";
	showComments: boolean;
	userLookup?: (userId: string) => any;
}>();

defineEmits(["close", "open-followers", "update:showComments"]);

const badgesCountToShow = 3;

const displayCommentCount = computed(() => {
	if (props.type === "post") return props.currItem?.comment_count || 0;
	return props.currItem?.comments?.length || 0;
});

function resolveUser(userId: string) {
	return props.userLookup ? props.userLookup(userId) : userId;
}
</script>

<style scoped>
ion-toolbar {
  --background: rgba(0, 0, 0, 0.85);
}
</style>