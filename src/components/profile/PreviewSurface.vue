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

  <!-- Chat: Conversation row + Scaled Toast Preview.
       No ChatToolbar here — the in-chat header is owned by the Chat Style sheet
       (ChatWidgetStylePreview), which overrides it with the chat customization.
       Showing it from the PROFILE customization advertised a look that the chat
       does not actually use. -->
  <div v-else class="w-full max-w-[420px] px-1 pointer-events-none flex flex-col gap-4">

    <ConversationItem
      class="relative z-10"
      :chat="mockChat"
      current-user-id="preview-me"
      :is-online="true"
      :is-typing="false"
    />

    <!-- Mock Join Toast, sized like every other surface in this column.
         It used to be a 260px box blown up with `scale-[1.35]`: a transform
         doesn't change the LAYOUT box, so the pane only reserved 260px while
         the toast painted ~350px wide and spilled out of the frame — worse on
         mobile, where the pager's own zoom transform shrinks the pane. Plain
         width, no transform, so painted size and reserved size agree. -->
    <div class="flex justify-center w-full pb-4 relative z-20">
      <ChatToastItem
        v-if="mockToast"
        :toast="mockToast"
        class="w-full"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import ChatToastItem from "@/components/chat/ChatToastItem.vue";
import ConversationItem from "@/components/chat/ConversationItem.vue";
import FeedPostCard from "@/components/home/posts/FeedPostCard.vue";
import PreviewProfileCard from "@/components/profile/PreviewProfileCard.vue";
import type { Customization } from "@/config/profile_options.config";

defineProps<{
	mode: "card" | "post" | "chat";
	user?: any;
	customization: Partial<Customization>;
	mockPost: any;
	mockChat: any;
	mockToast?: any;
}>();
</script>

<style scoped>
.post-preview :deep(.tap-guard),
.post-preview :deep(.tap-guard > img) {
  max-height: var(--post-img-max-h, 190px);
}
</style>