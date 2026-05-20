<template>
  <ion-modal
    :is-open="isOpen"
    @did-dismiss="handleDismiss"
    :initial-breakpoint="1"
    :breakpoints="[0, 1]"
    handle-behavior="cycle"
    class="liquid-customize-modal"
  >
    <div class="h-full flex flex-col bot-pad-safe bg-background cabin-sketch-regular overflow-hidden">
      <div class="shrink-0 pt-4 pb-2 text-center">
        <h1 class="text-3xl text-secondary font-black tracking-tighter italic leading-none">
          Profile Effect
        </h1>
        <p class="text-xs font-bold opacity-60 uppercase tracking-widest mt-2">
          Atmosphere for your card
        </p>
      </div>

      <!-- Live preview at top (full card, real timing) -->
      <div class="shrink-0 px-4 mb-2">
        <PreviewProfileCard :user="user" :customization="previewCustomization" />
      </div>

      <div class="flex-1 overflow-y-auto px-5 hide-scrollbar pb-4" @touchmove.stop>
        <div class="grid grid-cols-2 gap-3">
          <button
            v-for="effect in PROFILE_EFFECTS"
            :key="effect.id"
            class="relative rounded-[2rem] border-2 bg-white/60 active:scale-95 transition-all overflow-hidden h-28"
            :class="
              localSelection === effect.id
                ? 'border-secondary shadow-lg ring-2 ring-secondary/30'
                : 'border-white shadow-sm'
            "
            @click="localSelection = effect.id"
          >
            <!-- Tile preview: preview=true compresses delays so the effect
                 reads instantly instead of waiting for staggered particles -->
            <div class="absolute inset-0 bg-gradient-to-br from-zinc-100 to-zinc-200">
              <ProfileEffect :def="effect" :preview="true" />
            </div>

            <div class="absolute inset-x-0 bottom-0 bg-white/85 backdrop-blur-sm px-3 py-2 text-left">
              <p class="text-[11px] font-black uppercase tracking-wider text-black leading-none">
                {{ effect.name }}
              </p>
              <p class="text-[9px] font-bold text-black/50 italic leading-tight mt-0.5">
                {{ effect.desc }}
              </p>
            </div>

            <div
              v-if="localSelection === effect.id"
              class="absolute top-2 right-2 w-6 h-6 rounded-full bg-secondary shadow-lg flex items-center justify-center"
            >
              <ion-icon :icon="svg(mdiCheck)" class="text-white text-sm" />
            </div>
          </button>
        </div>
      </div>

      <div class="px-5 pt-3 pb-2 shrink-0 bg-background border-t border-black/5">
        <ion-button
          expand="block"
          color="secondary"
          shape="round"
          class="h-14 font-black uppercase tracking-widest shadow-lg"
          @click="confirm"
        >
          Apply Effect
        </ion-button>
        <ion-button
          fill="clear"
          color="dark"
          expand="block"
          class="font-black uppercase tracking-widest text-xs mt-1 opacity-60"
          @click="handleDismiss"
        >
          Cancel
        </ion-button>
      </div>
    </div>
  </ion-modal>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { IonButton, IonIcon, IonModal } from "@ionic/vue";
import { mdiCheck } from "@mdi/js";
import { svg } from "@/helper/general.helper";
import {
	DEFAULT_EFFECT_ID,
	PROFILE_EFFECTS,
	type Customization,
} from "@/config/profile_options.config";
import ProfileEffect from "./ProfileEffect.vue";
import PreviewProfileCard from "@/components/profile/PreviewProfileCard.vue";

const props = defineProps<{
	isOpen: boolean;
	user: any;
	customization: Partial<Customization>;
}>();

const emit = defineEmits(["close", "select"]);

const localSelection = ref(props.customization.effectId || DEFAULT_EFFECT_ID);

watch(
	() => props.isOpen,
	(open) => {
		if (open)
			localSelection.value = props.customization.effectId || DEFAULT_EFFECT_ID;
	},
);

const previewCustomization = computed(() => ({
	...props.customization,
	effectId: localSelection.value,
}));

const confirm = () => {
	emit("select", localSelection.value);
	emit("close");
};
const handleDismiss = () => emit("close");
</script>

<style scoped>
.hide-scrollbar::-webkit-scrollbar { display: none; }
.hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }

ion-modal.liquid-customize-modal {
  --border-radius: 2.5rem 2.5rem 0 0;
  --height: 90%;
  --background: var(--ion-color-tertiary);
}
ion-modal.liquid-customize-modal::part(handle) {
  background: var(--ion-color-secondary);
  opacity: 0.3;
  width: 40px;
}
</style>