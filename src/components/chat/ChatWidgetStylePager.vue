<template>
  <div class="w-full max-w-[280px] mx-auto">
    <div class="grid grid-cols-2 gap-1 p-1 rounded-full bg-black/5 mb-3">
      <button
        v-for="page in pages"
        :key="page.id"
        type="button"
        class="rounded-full py-1.5 text-sm font-black transition-all cursor-pointer"
        :class="activePage === page.id ? 'bg-secondary text-white shadow-sm' : 'text-black/60'"
        @click="activePage = page.id"
      >
        {{ page.label }}
      </button>
    </div>

    <!-- Keep one animated preview surface alive while switching its contents.
         Re-keying the full tree destroyed active world players during a Vue
         transition and could race their async canvas cleanup. -->
    <ChatWidgetStylePreview
      :customization="customization"
      :user="user"
      :mode="activePage"
    />
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import ChatWidgetStylePreview from "./ChatWidgetStylePreview.vue";
import type { ChatCustomization } from "@/config/profile_options.config";

defineProps<{
	customization?: Partial<ChatCustomization>;
	user?: any;
}>();
const pages = [
	{ id: "overview" as const, label: "Overview" },
	{ id: "conversation" as const, label: "In a chat" },
];
const activePage = ref<"overview" | "conversation">("overview");
</script>
