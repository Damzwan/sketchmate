<template>
  <button
    class="relative w-10 h-10 flex items-center justify-center rounded-2xl border shadow-lg transition-all active:scale-95 cursor-pointer"
    :class="activeType
      ? 'border-secondary bg-secondary/15 ring-2 ring-secondary/40'
      : 'border-primary/60 bg-primary/40 backdrop-blur-md'"
    :aria-label="buttonLabel"
    @click="open"
  >
    <ion-icon :icon="svg(buttonIcon)" class="w-6 h-6 text-black" />
    <span
      v-if="activeType"
      class="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-secondary border-2 border-white/70"
      aria-hidden="true"
    />
  </button>

  <ion-popover
    :is-open="menuOpen"
    :event="menuEvent"
    side="top"
    alignment="end"
    :show-backdrop="false"
    @didDismiss="menuOpen = false"
  >
    <ion-content>
      <ion-list lines="none" class="divide-y divide-primary p-0">
        <ion-item color="tertiary" :button="true" :detail="false" @click="choose('ruler')">
          <ion-icon :icon="svg(mdiRuler)" />
          <div class="pl-2 min-w-0 flex-1">
            <p class="text-base">Ruler</p>
            <p class="text-xs opacity-60">{{ activeType === 'ruler' ? 'Tap again to turn off' : 'Straight strokes and erasing' }}</p>
          </div>
          <ion-icon v-if="activeType === 'ruler'" slot="end" :icon="checkmark" color="secondary" />
        </ion-item>

        <ion-item color="tertiary" :button="true" :detail="false" @click="choose('compass')">
          <ion-icon :icon="svg(mdiCompassOutline)" />
          <div class="pl-2 min-w-0 flex-1">
            <p class="text-base">Compass</p>
            <p class="text-xs opacity-60">{{ activeType === 'compass' ? 'Tap again to turn off' : 'Full circles or partial arcs' }}</p>
          </div>
          <ion-icon v-if="activeType === 'compass'" slot="end" :icon="checkmark" color="secondary" />
        </ion-item>
      </ion-list>
    </ion-content>
  </ion-popover>
</template>

<script setup lang="ts">
import { IonContent, IonIcon, IonItem, IonList, IonPopover } from "@ionic/vue";
import { mdiCompassOutline, mdiRuler, mdiRulerSquareCompass } from "@mdi/js";
import { checkmark } from "ionicons/icons";
import { storeToRefs } from "pinia";
import { computed, ref } from "vue";
import {
	type InstrumentType,
	useInstrumentStore,
} from "@/draw/tools/instruments/instrument.store";
import { svg } from "@/helper/general.helper";

const instruments = useInstrumentStore();
const { activeType } = storeToRefs(instruments);
const menuOpen = ref(false);
const menuEvent = ref<Event>();

const buttonIcon = computed(() => {
	if (activeType.value === "ruler") return mdiRuler;
	if (activeType.value === "compass") return mdiCompassOutline;
	return mdiRulerSquareCompass;
});
const buttonLabel = computed(() =>
	activeType.value
		? `Instruments — ${activeType.value} active`
		: "Drawing instruments",
);

function open(event: Event) {
	menuEvent.value = event;
	menuOpen.value = true;
}

function choose(type: InstrumentType) {
	instruments.select(type);
	menuOpen.value = false;
}
</script>
