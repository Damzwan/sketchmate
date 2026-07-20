<template>
  <div class="w-full">
    <div v-if="!compact" class="flex flex-col items-center w-full">
      <div class="flex items-start justify-center w-full">
        <template v-for="(s, i) in JOURNEY_STEPS" :key="s.label">
          <div
            class="flex flex-col items-center shrink-0 w-16 cursor-pointer md:hover:opacity-75 transition-opacity active:scale-95"
            @click="toggleInfo(i)"
          >
            <div
              class="w-10 h-10 rounded-full flex items-center justify-center border transition-all duration-300"
              :class="nodeClass(i)"
            >
              <ion-icon :icon="svg(i < activeIdx ? mdiCheck : s.icon)" class="text-[18px]" />
            </div>
            <span
              class="mt-2 text-[9px] font-black uppercase tracking-wider leading-none transition-colors"
              :class="labelClass(i)"
            >
              {{ s.label }}
            </span>
          </div>

          <div
            v-if="i < JOURNEY_STEPS.length - 1"
            class="flex-1 h-0.5 rounded-full mt-[20px] transition-colors"
            :class="i < activeIdx ? accent.dot : 'bg-black/10'"
          ></div>
        </template>
      </div>

      <div
        v-if="activeInfo !== null"
        class="mt-3.5 px-4 py-2.5 cabin-sketch-regular bg-tertiary rounded-xl border border-black/5 text-base text-black/90 animate-fade-in text-center max-w-[280px]"
      >
        {{ infoText }}
      </div>
    </div>

    <div v-else class="flex items-center gap-1.5">
      <template v-for="(s, i) in JOURNEY_STEPS" :key="s.label">
        <div class="flex items-center gap-1 shrink-0">
          <div class="rounded-full transition-all duration-300" :class="dotClass(i)"></div>
          <span
            class="text-[7px] font-black uppercase tracking-wider transition-colors"
            :class="compactLabelClass(i)"
          >
            {{ s.label }}
          </span>
        </div>
        <div
          v-if="i < JOURNEY_STEPS.length - 1"
          class="flex-1 h-px rounded-full transition-colors"
          :class="i < activeIdx ? 'bg-black/20' : 'bg-black/10'"
        ></div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { IonIcon } from "@ionic/vue";
import { mdiCheck } from "@mdi/js";
import { svg } from "@/helper/general.helper";
import {
	JOURNEY_STEPS,
	RELATIONSHIP_ACCENT,
	RelationshipAccent,
} from "@/config/relationship.config";

const props = withDefaults(
	defineProps<{
		/** 1-based current step on the journey (1 Invite, 2 Trial, 3 Mates). */
		step: number;
		accent?: RelationshipAccent;
		compact?: boolean;
	}>(),
	{ accent: "secondary", compact: false },
);

const accent = computed(() => RELATIONSHIP_ACCENT[props.accent]);
const activeIdx = computed(() => props.step - 1);

/* Interactive logic */
const activeInfo = ref<number | null>(null);

const toggleInfo = (index: number) => {
	activeInfo.value = activeInfo.value === index ? null : index;
};

// Read from the step definition rather than a parallel switch keyed by index —
// the two copies of this text had already diverged in tone, and an index-based
// switch silently breaks the moment a step is inserted.
const infoText = computed(() =>
	activeInfo.value === null ? "" : JOURNEY_STEPS[activeInfo.value].info,
);

/* full nodes */
const nodeClass = (i: number) => {
	let baseClass = "";
	if (i === activeIdx.value) {
		baseClass = `${accent.value.solid} border-transparent shadow-sm ring-4 ${accent.value.ring} animate-node-pulse`;
	} else if (i < activeIdx.value) {
		baseClass = `${accent.value.dot} text-white border-transparent`;
	} else {
		baseClass = "bg-white border-black/10 text-black/25";
	}

	// Highlight actively selected info node for better context
	if (activeInfo.value === i && i !== activeIdx.value) {
		baseClass += " ring-2 ring-black/10";
	}

	return baseClass;
};

const labelClass = (i: number) => {
	if (i === activeIdx.value) return `${accent.value.text} font-black`;
	if (activeInfo.value === i) return "text-secondary font-bold";
	if (i < activeIdx.value) return "text-black/45";
	return "text-black/25";
};

/* compact dots */
const dotClass = (i: number) => {
	if (i === activeIdx.value) return `w-2 h-2 ${accent.value.dot} shadow-sm`;
	if (i < activeIdx.value) return "w-1.5 h-1.5 bg-black/25";
	return "w-1.5 h-1.5 bg-black/10";
};
const compactLabelClass = (i: number) => {
	if (i === activeIdx.value) return accent.value.text;
	if (i < activeIdx.value) return "text-black/35";
	return "text-black/20";
};
</script>

<style scoped>
@keyframes nodePulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.08); }
}
.animate-node-pulse {
  animation: nodePulse 2s ease-in-out infinite;
}

.animate-fade-in {
  animation: fadeIn 0.25s cubic-bezier(0.21, 1.02, 0.43, 1.01) forwards;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: scale(0.95) translateY(2px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}
</style>