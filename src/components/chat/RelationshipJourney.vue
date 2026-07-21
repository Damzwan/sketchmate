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
              :style="labelStyle(i)"
            >
              {{ s.label }}
            </span>
          </div>

          <div
            v-if="i < JOURNEY_STEPS.length - 1"
            class="flex-1 h-0.5 rounded-full mt-[20px] transition-colors"
            :class="connectorClass(i)"
          ></div>
        </template>
      </div>

      <div
        v-if="activeInfo !== null"
        class="mt-3.5 px-4 py-2.5 cabin-sketch-regular rounded-xl border text-base animate-fade-in text-center max-w-[280px]"
        :class="dark
          ? 'bg-black/40 border-white/10 text-white/90'
          : 'bg-tertiary border-black/5 text-black/90'"
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
            :style="labelStyle(i)"
          >
            {{ s.label }}
          </span>
        </div>
        <div
          v-if="i < JOURNEY_STEPS.length - 1"
          class="flex-1 h-px rounded-full transition-colors"
          :class="compactConnectorClass(i)"
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
		/**
		 * The rail is sitting on a DARK backdrop — either a dark world (Cosmic
		 * Drift) or a dark theme surface (Noir, Midnight). Every resting colour
		 * here is a `black/xx` tint tuned for a light card: the nodes, the
		 * connectors and the info bubble all disappear on either one. This flips
		 * the whole scale to white.
		 *
		 * The caller decides WHY it's dark, because the two causes need different
		 * label colours (see ConversationItem) — the rail only needs to know that
		 * it is.
		 *
		 * Same contract as ChatRelationshipStrip, deliberately: both render the
		 * relationship state on a partner's surface, so they take the same props.
		 */
		dark?: boolean;
		/** The already-resolved LIGHT name colour — the ACTIVE step's label. */
		nameColor?: string;
		/** The already-resolved LIGHT desc colour — every other label. */
		descColor?: string;
	}>(),
	{ accent: "secondary", compact: false, dark: false },
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
		// Only the RESTING node is a light-card colour — the other two are accent
		// fills that read fine on either surface.
		baseClass = props.dark
			? "bg-white/10 border-white/25 text-white/55"
			: "bg-white border-black/10 text-black/25";
	}

	// Highlight actively selected info node for better context
	if (activeInfo.value === i && i !== activeIdx.value) {
		baseClass += props.dark ? " ring-2 ring-white/20" : " ring-2 ring-black/10";
	}

	return baseClass;
};

// On a dark world the accent classes go too: `text-secondary` on a starfield is
// the same low-contrast problem the black tints have. The theme's own *Dark
// colours are already tuned against its cardBg, so the labels ride those and
// pick up the `.on-world` halo instead.
const labelClass = (i: number) => {
	if (props.dark) {
		return i === activeIdx.value
			? "on-world font-black"
			: "on-world" + (activeInfo.value === i ? " font-bold" : "");
	}
	if (i === activeIdx.value) return `${accent.value.text} font-black`;
	if (activeInfo.value === i) return "text-secondary font-bold";
	if (i < activeIdx.value) return "text-black/45";
	return "text-black/25";
};

/** Inline colour for a label, so `dark` can use the theme's supplied values. */
const labelStyle = (i: number) => {
	if (!props.dark) return {};
	const color = i === activeIdx.value ? props.nameColor : props.descColor;
	// Opacity carries the done/upcoming distinction that the black tints used to.
	return color
		? { color, opacity: i <= activeIdx.value ? 1 : 0.6 }
		: {};
};

const connectorClass = (i: number) => {
	if (i < activeIdx.value) return props.dark ? "bg-white/45" : accent.value.dot;
	return props.dark ? "bg-white/15" : "bg-black/10";
};

/* compact dots */
const dotClass = (i: number) => {
	if (i === activeIdx.value) return `w-2 h-2 ${accent.value.dot} shadow-sm`;
	if (i < activeIdx.value)
		return props.dark ? "w-1.5 h-1.5 bg-white/60" : "w-1.5 h-1.5 bg-black/25";
	return props.dark ? "w-1.5 h-1.5 bg-white/25" : "w-1.5 h-1.5 bg-black/10";
};
const compactLabelClass = (i: number) => {
	if (props.dark) return "on-world";
	if (i === activeIdx.value) return accent.value.text;
	if (i < activeIdx.value) return "text-black/35";
	return "text-black/20";
};
const compactConnectorClass = (i: number) => {
	if (i < activeIdx.value) return props.dark ? "bg-white/40" : "bg-black/20";
	return props.dark ? "bg-white/15" : "bg-black/10";
};
</script>

<style scoped>
/* Same halo ChatRelationshipStrip uses over a world: the theme's *Dark colours
   carry the contrast, this just holds the glyph edges against a busy starfield
   without putting a plate behind the rail and hiding the world. */
.on-world {
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.55);
}

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