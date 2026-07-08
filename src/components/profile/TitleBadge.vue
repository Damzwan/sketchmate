<template>
  <template v-if="def">
    <button
      :id="triggerId"
      type="button"
      class="title-pin group relative overflow-hidden text-[10px] font-black uppercase tracking-widest pl-1.5 pr-3 py-1 rounded-full inline-flex items-center gap-1.5 border border-white/25 transition-all duration-300 ease-out cursor-pointer hover:scale-110 active:scale-95 hover:-translate-y-px"
      :class="extraClass"
      :style="{ background: theme.titleBg, color: theme.nameColor }"
      @click.stop="open = true"
    >
      <span class="title-pin__sheen"></span>
      <span
        class="relative w-4 h-4 rounded-full flex items-center justify-center text-[10px] leading-none shadow-inner"
        :style="{ background: 'rgba(255,255,255,0.35)' }"
      >{{ def.emoji }}</span>
      <span class="relative">{{ def.name }}</span>
    </button>

    <ion-popover
      :is-open="open"
      :trigger="triggerId"
      :arrow="true"
      side="bottom"
      alignment="center"
      class="title-popover"
      @did-dismiss="open = false"
    >
      <div class="p-4 w-60 cabin-sketch-regular">
        <div class="flex items-center gap-2 mb-1">
          <span class="text-2xl">{{ def.emoji }}</span>
          <h3 class="text-xl font-black text-black leading-none">{{ def.name }}</h3>
        </div>
        <p class=" text-black/80 mb-2">{{ def.desc }}</p>
        <div class="rounded-2xl bg-secondary/10 px-3 py-2">
          <p class="text-lg font-black uppercase tracking-widest text-secondary mb-0.5">
            {{ owned ? 'Unlocked' : 'How to earn' }}
          </p>
          <p class=" font-semibold text-black/70 leading-snug">{{ def.howTo }}</p>
        </div>
      </div>
    </ion-popover>
  </template>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { IonPopover } from "@ionic/vue";
import { resolveTitleDef, type Theme } from "@/config/profile_options.config";
import { buildItemId } from "@/config/catalog.config";
import { useInventoryStore } from "@/store/inventory.store";

const props = withDefaults(
	defineProps<{
		titleId?: string;
		theme: Theme;
		extraClass?: string;
	}>(),
	{ extraClass: "" },
);

const open = ref(false);
const triggerId = `title-badge-${Math.random().toString(36).slice(2, 9)}`;

const def = computed(() => resolveTitleDef(props.titleId));
const owned = computed(() =>
	props.titleId
		? useInventoryStore().isOwned(buildItemId("title", props.titleId))
		: true,
);
</script>

<style scoped>
/* Glossy, gently-floating title pin with a sheen that sweeps across on idle. */
.title-pin {
	box-shadow:
		0 2px 8px rgba(0, 0, 0, 0.12),
		inset 0 1px 0 rgba(255, 255, 255, 0.5);
	animation: title-pin-float 4s ease-in-out infinite;
}
.title-pin:hover {
	box-shadow:
		0 5px 16px rgba(0, 0, 0, 0.18),
		inset 0 1px 0 rgba(255, 255, 255, 0.6);
}

.title-pin__sheen {
	position: absolute;
	top: 0;
	bottom: 0;
	left: -60%;
	width: 40%;
	background: linear-gradient(
		115deg,
		transparent,
		rgba(255, 255, 255, 0.65),
		transparent
	);
	transform: skewX(-20deg);
	animation: title-pin-sheen 4.5s ease-in-out infinite;
}

@keyframes title-pin-float {
	0%,
	100% {
		transform: translateY(0);
	}
	50% {
		transform: translateY(-1.5px);
	}
}

@keyframes title-pin-sheen {
	0%,
	55% {
		left: -60%;
	}
	85%,
	100% {
		left: 130%;
	}
}

@media (prefers-reduced-motion: reduce) {
	.title-pin,
	.title-pin__sheen {
		animation: none;
	}
}

.title-popover {
	--width: auto;
	--max-width: 18rem;
	--border-radius: 1.25rem;
	--box-shadow: 0 12px 40px rgba(0, 0, 0, 0.18);
}
</style>
