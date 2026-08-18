<template>
  <ion-toolbar class="w-full min-h-14 flex items-start pt-1 pb-1">
    <ion-buttons slot="start" class="self-start mt-1">
      <ion-button @click="$emit('close')" color="light">
        <ion-icon :icon="arrowBack" />
      </ion-button>
    </ion-buttons>

    <div v-if="type === 'post' || type === 'competition'" class="flex flex-col justify-center flex-1 px-2 text-white mt-1 mb-1">
      <!-- UserAvatar rather than a plain <img>: the fullscreen viewer is the
           one place a post was shown without its author's frame/decoration,
           so a customised artist lost their look exactly where the artwork is
           biggest. Tapping the row opens their profile. -->
      <button
        type="button"
        class="flex items-center space-x-2.5 mb-1 text-left cursor-pointer"
        @click="openAuthor"
      >
        <!-- pointer-events-none: UserAvatar's frame promotes itself to its own
             compositing layer (translateZ + `contain: paint`), and inside the
             swiper's gesture surface that layer swallowed the tap — the name
             beside it opened the profile but the avatar itself did nothing.
             Nothing inside the avatar is interactive, so letting every pointer
             event fall straight through to this button is the whole fix. -->
        <UserAvatar
          :user="currItem.author"
          :img="currItem.author?.img || senderImg(currItem.author_id)"
          :customization="currItem.author?.customization"
          size="xs"
          static
          class="pointer-events-none"
        />
        <span class="text-base font-bold cabin-sketch-regular">
          {{ currItem.author?.name || 'Sketcher' }}
        </span>
      </button>
      <p v-if="currItem.description" class="text-[13px] opacity-85 line-clamp-2 leading-snug">
        {{ currItem.description }}
      </p>

      <!-- Same credit rows as the feed card, so opening a post fullscreen never
           drops an attribution the smaller view showed. Fixed light-on-dark
           colours rather than the card's palette: this toolbar is its own
           surface (a flat black scrim), not the artist's themed card. -->
      <PostCredits
        v-if="type === 'post'"
        :post="currItem"
        label-color="rgba(255,255,255,0.85)"
        ring-color="rgba(0,0,0,0.6)"
        @open-user="openCreditedUser"
      />
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
          width="36"
          height="36"
          loading="lazy"
          decoding="async"
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
import { IonButton, IonButtons, IonIcon, IonToolbar } from "@ionic/vue";
import { arrowBack } from "ionicons/icons";
import PostCredits from "@/components/home/posts/PostCredits.vue";
import UserAvatar from "@/components/profile/customization/UserAvatar.vue";
import { useUserContextSheet } from "@/composables/profile/useUserContextSheet";
import { senderImg } from "@/helper/general.helper";

const props = defineProps<{
	currItem: any;
	type: "post" | "inbox" | "competition";
	userLookup?: (userId: string) => any;
}>();

defineEmits(["close", "open-followers"]);

const badgesCountToShow = 3;
const { openUserActions } = useUserContextSheet();

const openAuthor = () => {
	const author = props.currItem.author;
	const id = author?._id || props.currItem.author_id;
	if (!id) return;
	openUserActions({ _id: id, name: author?.name, img: author?.img });
};

const openCreditedUser = (userId: string) => openUserActions({ _id: userId });

function resolveUser(userId: string) {
	return props.userLookup ? props.userLookup(userId) : userId;
}
</script>

<style scoped>
ion-toolbar {
  --background: rgba(0, 0, 0, 0.85);
}
</style>
