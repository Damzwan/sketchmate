<template>
  <!-- Card: the compact profile card, stats + signature. -->
  <PreviewProfileCard
    v-if="mode === 'card'"
    class="w-full flex justify-center"
    :user="user"
    :customization="customization"
    :zoom="1"
    :max-width="480"
    show-stats
  />

  <!-- Post: how a feed post looks wearing this look. Display-only. Restrict
       max-width so it keeps a natural aspect ratio before scaling. -->
  <div v-else-if="mode === 'post'" class="post-preview w-full max-w-[420px] pointer-events-none">
    <FeedPostCard :post="mockPost" :is-mine="true" />
  </div>

  <!-- Chat: chat header (ChatToolbar) + conversation-list row. -->
  <div v-else class="w-full max-w-[420px] px-1 pointer-events-none space-y-4">
    <div class="rounded-[1.5rem] overflow-hidden border border-primary/40 shadow-sm">
      <ChatToolbar :preview="chatPreview" />
    </div>
    <ConversationItem
      :chat="mockChat"
      current-user-id="preview-me"
      :is-online="true"
      :is-typing="false"
    />
  </div>
</template>

<script setup lang="ts">
import type { Customization } from "@/config/profile_options.config";
import PreviewProfileCard from "@/components/profile/PreviewProfileCard.vue";
import FeedPostCard from "@/components/home/posts/FeedPostCard.vue";
import ConversationItem from "@/components/chat/ConversationItem.vue";
import ChatToolbar from "@/components/chat/ChatToolbar.vue";

// One mock look wearing a customization, rendered as a Card / Post / Chat
// surface. Extracted so the pager pane AND the fullscreen zoom overlay render
// the SAME markup from one source — no duplicated surface trees to drift.
defineProps<{
	mode: "card" | "post" | "chat";
	user?: any;
	customization: Partial<Customization>;
	mockPost: any;
	mockChat: any;
	chatPreview: any;
}>();
</script>

<style scoped>
/* Post drawing image cap — driven by the host's --post-img-max-h var so the
   compact pane and the roomy fullscreen stage each size it differently. */
.post-preview :deep(.tap-guard),
.post-preview :deep(.tap-guard > img) {
  max-height: var(--post-img-max-h, 190px);
}
</style>
