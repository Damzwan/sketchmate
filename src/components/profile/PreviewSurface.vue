<!-- components/profile/PreviewSurface.vue -->
<template>
  <PreviewProfileCard
    v-if="mode === 'card'"
    class="w-full flex justify-center"
    :user="user"
    :customization="customization"
    :zoom="1"
    :max-width="480"
    show-stats
  />

  <div v-else-if="mode === 'post'" class="post-preview w-full max-w-[420px] pointer-events-none">
    <FeedPostCard :post="mockPost" :is-mine="true" preview />
  </div>

  <!-- Chat: Toolbar + Conversation + Scaled Toast Preview -->
  <div v-else class="w-full max-w-[420px] px-1 pointer-events-none flex flex-col gap-4">

    <div class="rounded-[1.6rem] overflow-hidden border border-primary/30 shadow-sm relative z-10">
      <ChatToolbar :preview="chatPreview" />
    </div>

    <ConversationItem
      class="relative z-10"
      :chat="mockChat"
      current-user-id="preview-me"
      :is-online="true"
      :is-typing="false"
    />

    <!-- Mock Join Toast: Pinned below the chat, scaled up to look bigger purely in the preview -->
    <div class="flex justify-center w-full pb-4 relative z-20">
      <ChatToastItem
        v-if="mockToast"
        :toast="mockToast"
        class="w-[260px] transform scale-[1.35] origin-top"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Customization } from "@/config/profile_options.config";
import PreviewProfileCard from "@/components/profile/PreviewProfileCard.vue";
import FeedPostCard from "@/components/home/posts/FeedPostCard.vue";
import ConversationItem from "@/components/chat/ConversationItem.vue";
import ChatToolbar from "@/components/chat/ChatToolbar.vue";
import ChatToastItem from "@/components/chat/ChatToastItem.vue";

defineProps<{
	mode: "card" | "post" | "chat";
	user?: any;
	customization: Partial<Customization>;
	mockPost: any;
	mockChat: any;
	chatPreview: any;
	mockToast?: any;
}>();
</script>

<style scoped>
.post-preview :deep(.tap-guard),
.post-preview :deep(.tap-guard > img) {
  max-height: var(--post-img-max-h, 190px);
}
</style>