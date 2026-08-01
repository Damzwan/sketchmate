<template>
  <div class="w-full max-w-[360px] mx-auto">
    <div class="grid grid-cols-2 gap-1 p-1 rounded-full bg-black/5 mb-3">
      <button
        v-for="page in pages"
        :key="page.id"
        type="button"
        class="rounded-full py-1.5 text-sm font-black transition-all cursor-pointer"
        :class="activePage === page.id ? 'bg-secondary text-white shadow-sm' : 'text-black/60'"
        @click="selectPage(page.id)"
      >
        {{ page.label }}
      </button>
    </div>

    <!-- Keep one preview surface alive while switching its contents so pager
         changes never rebuild the subtree during a modal update. -->
    <ChatWidgetStylePreview
      :customization="customization"
      :user="user"
      :mode="activePage"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import ChatWidgetStylePreview from "./ChatWidgetStylePreview.vue";
import type { ChatCustomization } from "@/config/profile_options.config";

const props = defineProps<{
	customization?: Partial<ChatCustomization>;
	user?: any;
	modelValue?: "overview" | "conversation";
}>();
const emit = defineEmits<{
	"update:modelValue": [value: "overview" | "conversation"];
}>();
const pages = [
	{ id: "overview" as const, label: "Overview" },
	{ id: "conversation" as const, label: "In a chat" },
];
const activePage = ref<"overview" | "conversation">(
	props.modelValue ?? "overview",
);
const selectPage = (page: "overview" | "conversation") => {
	activePage.value = page;
	emit("update:modelValue", page);
};
watch(
	() => props.modelValue,
	(page) => {
		if (page) activePage.value = page;
	},
);
</script>
