<!-- components/chat/RelationshipJourney.vue -->
<!--
  The one visual that explains "how you become Mates".
  - full mode (banner): labeled circles with icons, completed steps checked,
    current step lit + pulsing, connecting track filled up to where you are.
  - compact mode (list item): a tiny dot rail with the same semantics.

  Driven entirely by the shared relationship.config model, so every surface
  tells the identical story.
-->
<template>
  <div class="w-full">
    <!-- FULL -->
    <div v-if="!compact" class="flex items-start w-full">
      <template v-for="(s, i) in JOURNEY_STEPS" :key="s.label">
        <div class="flex flex-col items-center shrink-0 w-14">
          <div
            class="w-8 h-8 rounded-full flex items-center justify-center border transition-all duration-300"
            :class="nodeClass(i)"
          >
            <ion-icon :icon="svg(i < activeIdx ? mdiCheck : s.icon)" class="text-[15px]" />
          </div>
          <span
            class="mt-1.5 text-[8px] font-black uppercase tracking-wider leading-none transition-colors"
            :class="labelClass(i)"
          >
            {{ s.label }}
          </span>
        </div>

        <div
          v-if="i < JOURNEY_STEPS.length - 1"
          class="flex-1 h-0.5 rounded-full mt-[15px] transition-colors"
          :class="i < activeIdx ? accent.dot : 'bg-black/10'"
        ></div>
      </template>
    </div>

    <!-- COMPACT -->
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
import { computed } from "vue";
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

/* full nodes */
const nodeClass = (i: number) => {
  if (i === activeIdx.value)
    return `${accent.value.solid} border-transparent shadow-sm ring-4 ${accent.value.ring} animate-node-pulse`;
  if (i < activeIdx.value)
    return `${accent.value.dot} text-white border-transparent`;
  return "bg-white border-black/10 text-black/25";
};
const labelClass = (i: number) => {
  if (i === activeIdx.value) return `${accent.value.text} font-black`;
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
</style>