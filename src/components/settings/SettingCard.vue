<template>
  <component
    :is="tag"
    :href="href"
    :target="href ? target : undefined"
    class="setting-card"
    :class="[
      { 'setting-card--interactive': interactive },
      tone === 'danger' ? '!border-red-500/20' : ''
    ]"
    @click="interactive ? $emit('click') : undefined"
  >
    <span class="setting-card__chip" :class="tone === 'danger' ? 'bg-red-500/10' : 'bg-secondary/10'">
      <ion-icon :icon="resolvedIcon" class="text-xl" :class="tone === 'danger' ? 'text-red-500' : 'text-secondary'" />
    </span>

    <span class="min-w-0 flex-1 text-left">
      <slot name="label">
        <span
          class="block font-bold text-base leading-tight truncate"
          :class="tone === 'danger' ? 'text-red-500' : 'text-black'"
        >
          {{ label }}
        </span>
        <span v-if="sublabel" class="block text-base text-black/80 truncate mt-0.5">{{ sublabel }}</span>
      </slot>
    </span>

    <span class="shrink-0 flex items-center">
      <slot name="trailing" />
    </span>
  </component>
</template>

<script setup lang="ts">
import { IonIcon } from "@ionic/vue";
import { computed } from "vue";
import { svg } from "@/helper/general.helper";

const props = withDefaults(
	defineProps<{
		icon: string;
		// icon may be an mdi path (needs svg()) or a ready data-uri (ionicons)
		rawIcon?: boolean;
		label?: string;
		sublabel?: string;
		tone?: "brand" | "danger";
		href?: string;
		target?: string;
		// false = plain container (e.g. holds a toggle), no click/hover affordance
		interactive?: boolean;
	}>(),
	{
		tone: "brand",
		target: "_blank",
		interactive: true,
	},
);

defineEmits(["click"]);

const tag = computed(() =>
	props.href ? "a" : props.interactive ? "button" : "div",
);
const resolvedIcon = computed(() =>
	props.rawIcon ? props.icon : svg(props.icon),
);
</script>

<style scoped>
@reference "@/theme/main.css";

.setting-card {
  @apply w-full flex items-center gap-3 bg-tertiary border border-primary/40 rounded-[1.5rem] p-3 shadow-sm transition-transform;
}

.setting-card--interactive {
  @apply cursor-pointer hover:scale-105 active:scale-[0.98];
}

.setting-card__chip {
  @apply w-10 h-10 rounded-xl flex items-center justify-center shrink-0;
}
</style>
