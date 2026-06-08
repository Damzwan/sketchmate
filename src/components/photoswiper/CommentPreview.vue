<template>
  <div
    v-if="comments.length > 0"
    class="absolute right-[10px] bottom-[80px] z-[100] w-[240px] p-[10px] cursor-pointer select-none"
    @click.stop="$emit('open-comments')"
  >
    <div
      v-for="(comment, i) in comments.slice(0, 4)"
      :key="comment._id || i"
      class="my-1 p-1 rounded-full shadow-lg bg-black/60 border border-white/20 backdrop-blur-md transition-transform duration-200 active:scale-[0.97]"
    >
      <div class="flex items-center min-w-0">
        <ion-avatar class="w-8 h-8 flex-shrink-0 border border-white/10 overflow-hidden">
          <img
            :src="comment.author?.img || senderImg(resolveUser(comment.sender || comment.author_id))"
            class="block object-cover w-full h-full"
            alt="avatar"
          />
        </ion-avatar>

        <div class="flex-1 min-w-0 mx-2">
          <p class="text-[12px] font-black text-white cabin-sketch-regular leading-none truncate mb-0.5">
            {{ comment.author?.name || senderName(resolveUser(comment.sender || comment.author_id)) }}
          </p>
          <p class="text-[12px] text-white/90 cabin-sketch-regular truncate leading-tight">
            {{ comment.message }}
          </p>
        </div>
      </div>
    </div>

    <div v-if="commentCount > comments.slice(0, 4).length" class="mt-2 pl-3">
      <p class="text-[11px] font-bold text-white/60 italic cabin-sketch-regular drop-shadow-md">
        + {{ commentCount - comments.slice(0, 4).length }} more comments...
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { IonAvatar } from "@ionic/vue";
import { senderImg, senderName } from "@/helper/general.helper";

defineProps<{
	comments: any[];
	commentCount: number;
	resolveUser: (id: string) => any;
}>();

defineEmits(["open-comments"]);
</script>