<template>
  <div class="flex justify-end px-0.5 pb-0.5 text-xs font-sans text-black/80 gap-0.5">
    <span>{{ dayjs(msg.createdAt).format("HH:mm") }}</span>
    <span v-if="isMe && activeTab !== 'lobby'" class="text-[9px] flex items-center">
      <svg viewBox="0 0 24 24" class="w-3 h-3 fill-current" :class="statusTick.class" aria-hidden="true">
        <path :d="statusTick.path" />
      </svg>
    </span>
  </div>
</template>

<script setup lang="ts">
import { mdiAlertCircleOutline, mdiCheckAll, mdiClockOutline } from "@mdi/js";
import dayjs from "dayjs";
import { computed } from "vue";

const props = defineProps<{ msg: any; isMe: boolean; activeTab: string }>();

const statusTick = computed(() => {
	if (props.msg.status === "sending")
		return { path: mdiClockOutline, class: "opacity-40" };
	if (props.msg.status === "error")
		return { path: mdiAlertCircleOutline, class: "text-red-400" };
	return { path: mdiCheckAll, class: "text-secondary" };
});
</script>
