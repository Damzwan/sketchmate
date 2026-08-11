<template>
  <section>
    <div class="grid grid-cols-6 gap-2.5 overflow-visible">
      <button
        v-for="action in visibleActions"
        :key="action.id"
        @click="$emit('action', action.id)"
        class="relative overflow-visible flex flex-col justify-between p-3.5 rounded-[1.75rem] border transition-all duration-300 active:scale-[0.96] cursor-pointer group text-left shadow-sm"
        :class="getCardLayoutClasses(action.id)"
      >
        <!-- Visual Core -->
        <template v-if="action.id === 'balloon'">
          <div
            class="absolute pointer-events-none transition-transform duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] group-hover:scale-110 z-20"
            :class="getImageLayoutClasses(action.id)"
          >
            <Lottie :src="balloonLottie" :loop="true" :speed="0.5" class="w-full h-full" />
          </div>
        </template>
        <template v-else>
<img
            width="1"
            height="1"
            loading="lazy"
            decoding="async"
            :src="action.img ?? undefined"
            class="absolute pointer-events-none object-contain transition-transform duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] group-hover:scale-110 z-20"
            :class="getImageLayoutClasses(action.id)"
            alt=""
          />
        </template>

        <!-- Text Labels -->
        <div class="relative z-10 flex flex-col justify-between h-full items-start pointer-events-none">
          <span
            class="cabin-sketch-regular leading-none text-black font-black tracking-tight"
            :class="action.id === 'draw_alone' || action.id === 'draw_together' ? 'text-xl' : 'text-base'"
          >
            {{ action.label }}
          </span>

          <span v-if="action.id === 'draw_alone'" class="text-[10px] uppercase font-black tracking-widest px-2 py-0.5 bg-secondary text-white rounded-full shadow-sm mt-auto">Solo</span>
          <span v-if="action.id === 'draw_together'" class="text-[10px] uppercase font-black tracking-widest px-2 py-0.5 bg-secondary text-white rounded-full shadow-sm mt-auto">Live Lobbies</span>
        </div>
      </button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from "vue";
import draw_alone from "@/assets/illustrations/home/draw_alone.webp";
import draw_together from "@/assets/illustrations/home/draw_together.webp";
import share from "@/assets/illustrations/home/share.webp";
import balloonLottie from "@/assets/lottie/balloon.lottie";
import Lottie from "@/components/general/Lottie.vue";

const props = defineProps<{ isUnderAge: boolean }>();
defineEmits(["action"]);

const ALL_QUICK_ACTIONS = [
	{ id: "draw_alone", label: "Draw", img: draw_alone, requiresAge: false },
	{
		id: "draw_together",
		label: "Together",
		img: draw_together,
		requiresAge: false,
	},
	{ id: "share", label: "Add Mate", img: share, requiresAge: false },
	{ id: "balloon", label: "Balloon", img: null, requiresAge: true },
];

const visibleActions = computed(() =>
	ALL_QUICK_ACTIONS.filter((a) => !a.requiresAge || !props.isUnderAge),
);

const getCardLayoutClasses = (id: string) => {
	const isBig = ["draw_alone", "draw_together"].includes(id);
	return {
		"col-span-3 border border-primary/40 bg-tertiary hover:border-secondary/40": true,
		"h-28": isBig,
		"h-20": !isBig,
	};
};

const getImageLayoutClasses = (id: string) => ({
	"w-18 h-18 -right-1 -bottom-1": id === "draw_alone",
	"w-18 h-18 right-1 -bottom-1": id === "draw_together",
	"w-14 h-14 right-2 bottom-1": id === "share",
	"w-14 h-14 right-2 bottom-0.5": id === "balloon",
});
</script>
