<template>
  <div class="relative z-10 px-4 pt-3 pb-4 shrink-0 flex flex-col gap-3">
    <button
      v-if="totalReactionCount"
      @click="emit('open-reaction-breakdown', post)"
      class="flex items-center gap-2 self-start cursor-pointer active:scale-95 hover:scale-[1.02] transition-all"
      aria-label="See who reacted"
    >
      <div class="flex items-center">
        <div
          v-for="(key, index) in activeReactions.slice(0, 3)"
          :key="key"
          class="w-8 h-8 rounded-full bg-white shadow-sm border border-black/5 flex items-center justify-center"
          :class="index ? '-ml-2.5' : ''"
          :style="{ zIndex: 3 - index }"
        >
          <img :src="reactionImages[key]" class="w-5 h-5 object-contain" alt="" />
        </div>
      </div>
      <span class="text-sm font-black text-black/80 tracking-tight" :style="legibleStyle(strongText)">
        {{ totalReactionCount }}
        <span class="text-black/50" :style="{ color: mutedText }">{{ totalReactionCount === 1 ? 'reaction' : 'reactions' }}</span>
      </span>
      <ion-icon :icon="svg(mdiChevronRight)" class="text-base text-black/30 -ml-0.5 opacity-60" :style="{ color: mutedText }" />
    </button>

    <div class="flex items-center justify-between">
      <div class="flex items-center gap-2">
        <button
          @click="(event) => emit('open-reaction-popover', { event, post })"
          class="flex items-center cursor-pointer hover:scale-105 justify-center h-9 px-3 rounded-full border active:scale-95 transition-all"
          :class="post.user_reaction ? 'bg-secondary/10 border-secondary/30 text-secondary' : 'bg-white border-black/10 text-black/80'"
          aria-label="React"
        >
          <img v-if="post.user_reaction" :src="reactionImages[post.user_reaction]" class="w-5 h-5 object-contain" alt="" />
          <ion-icon v-else :icon="svg(mdiHeartOutline)" class="text-lg" />
        </button>
        <button
          v-if="post.enable_comments"
          @click="openComments"
          class="flex items-center gap-1.5 h-9 cursor-pointer hover:scale-105 px-3.5 rounded-full bg-white border border-black/10 text-black/80 active:scale-95 transition-all"
        >
          <ion-icon :icon="svg(mdiChatOutline)" class="text-lg" />
          <span v-if="post.comment_count" class="text-sm font-black tracking-tight">{{ post.comment_count }}</span>
        </button>
        <button @click="openShare" class="flex items-center justify-center cursor-pointer hover:scale-105 h-9 w-9 rounded-full bg-white border border-black/10 text-black/80 active:scale-95 transition-all" aria-label="Share">
          <ion-icon :icon="svg(mdiSendOutline)" class="text-base -rotate-12" />
        </button>
      </div>
      <button v-if="post.enable_remix" @click="remixPost" class="flex items-center gap-1.5 h-9 px-3 cursor-pointer hover:scale-105 rounded-full bg-white border border-black/10 text-black/70 hover:text-black active:scale-95 transition-all">
        <ion-icon :icon="svg(mdiPencilOutline)" class="text-sm" />
        <span class="text-[11px] font-black uppercase tracking-wider">Remix</span>
      </button>
    </div>

    <div v-if="previewComments.length" @click="openComments" class="cursor-pointer active:opacity-70 transition-opacity flex flex-col gap-1">
      <div v-for="comment in previewComments" :key="comment._id" class="flex items-start gap-1.5 leading-snug" :class="isTexturedEffect ? 'text-[13px]' : 'text-xs'">
        <span class="text-black font-black shrink-0 tracking-tight" :style="legibleStyle(strongText)">{{ comment.author.name }}</span>
        <span class="truncate tracking-tight" :class="isTexturedEffect ? 'font-bold' : 'text-black/80'" :style="legibleStyle(isTexturedEffect ? strongText : mutedText)">{{ safeText(comment.message, comment.message_filtered) }}</span>
      </div>
      <p v-if="hasMoreComments" class="text-xs font-black text-black/70 mt-0.5 tracking-wide" :style="legibleStyle(isTexturedEffect ? strongText : mutedText)">
        View all {{ post.comment_count }} comments
      </p>
    </div>
    <p v-else-if="post.enable_comments" @click="openComments" class="text-xs font-black text-black/70 uppercase tracking-widest cursor-pointer active:opacity-60" :style="legibleStyle(mutedText)">
      Start the conversation
    </p>
  </div>
</template>

<script setup lang="ts">
import { IonIcon } from "@ionic/vue";
import {
	mdiChatOutline,
	mdiChevronRight,
	mdiHeartOutline,
	mdiPencilOutline,
	mdiSendOutline,
} from "@mdi/js";
import { reactionImages } from "@/config/post.config";
import { svg } from "@/helper/general.helper";
import { safeText } from "@/helper/profanity.helper";
import type { FeedPost } from "@/types/server.types";

const props = defineProps<{
	post: FeedPost;
	activeReactions: string[];
	totalReactionCount: number;
	previewComments: FeedPost["comments"];
	hasMoreComments: boolean;
	isTexturedEffect: boolean;
	strongText?: string;
	mutedText?: string;
	textureHalo?: string;
	openComments: () => void;
	openShare: () => void;
	remixPost: () => void;
}>();
const emit = defineEmits(["open-reaction-breakdown", "open-reaction-popover"]);
const legibleStyle = (color?: string) => ({
	color,
	textShadow: props.textureHalo,
});
</script>
