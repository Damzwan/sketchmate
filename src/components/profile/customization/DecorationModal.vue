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
          Avatar Decoration
        </h1>
        <p class="text-xs font-bold opacity-60 uppercase tracking-widest mt-2">
          A frame for your face
        </p>
      </div>

      <!-- Live preview -->
      <div class="shrink-0 px-4 mb-2">
        <PreviewProfileCard :user="user" :customization="previewCustomization" />
      </div>

      <div class="flex-1 overflow-y-auto px-5 hide-scrollbar pb-4" @touchmove.stop>
        <div class="grid grid-cols-3 gap-3">
          <button
            v-for="dec in DECORATIONS"
            :key="dec.id"
            class="relative rounded-[2rem] border-2 bg-white/60 p-3 active:scale-95 transition-all overflow-hidden flex flex-col items-center gap-2"
            :class="
              localSelection === dec.id
                ? 'border-secondary shadow-lg ring-2 ring-secondary/30'
                : 'border-white shadow-sm'
            "
            @click="localSelection = dec.id"
          >
            <!-- Tiny live decoration preview (real component, real animations) -->
            <div class="relative w-16 h-16">
              <div class="absolute inset-0 rounded-[1.25rem] border-2 border-white bg-zinc-200 overflow-hidden">
                <img
                  v-if="user?.img"
                  :src="user.img"
                  alt=""
                  class="w-full h-full object-cover"
                />
              </div>
              <AvatarDecoration :def="dec" />
            </div>

            <div class="text-center min-h-[2rem]">
              <p class="text-[11px] font-black uppercase tracking-wider text-black leading-tight">
                {{ dec.name }}
              </p>
              <p class="text-[9px] font-bold text-black/40 italic leading-tight mt-0.5">
                {{ dec.desc }}
              </p>
            </div>

            <div
              v-if="localSelection === dec.id"
              class="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-secondary shadow-lg flex items-center justify-center"
            >
              <ion-icon :icon="svg(mdiCheck)" class="text-white text-xs" />
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
          Apply Decoration
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
	DECORATIONS,
	DEFAULT_DECORATION_ID,
	type Customization,
} from "@/config/profile_options.config";
import AvatarDecoration from "./AvatarDecoration.vue";
import PreviewProfileCard from "@/components/profile/PreviewProfileCard.vue";

const props = defineProps<{
	isOpen: boolean;
	user: any;
	customization: Partial<Customization>;
}>();

const emit = defineEmits(["close", "select"]);

const localSelection = ref(
	props.customization.decorationId || DEFAULT_DECORATION_ID,
);

watch(
	() => props.isOpen,
	(open) => {
		if (open)
			localSelection.value =
				props.customization.decorationId || DEFAULT_DECORATION_ID;
	},
);

const previewCustomization = computed(() => ({
	...props.customization,
	decorationId: localSelection.value,
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