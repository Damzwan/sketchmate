<template>
  <div
    class="snap-start shrink-0 w-[260px] relative rounded-[2rem] overflow-hidden border bg-tertiary shadow-sm flex flex-col transition-all duration-200 md:hover:scale-[1.02] md:hover:shadow-md"
    :class="[owned ? 'border-emerald-400/60' : 'border-primary/40', highlight && 'ring-2 ring-secondary']"
  >
    <!-- Savings ribbon: only when we can prove a real discount vs buying the
         items separately. -->
    <div
      v-if="!owned && savingsPct > 0"
      class="absolute top-0 right-0 z-10 px-2.5 py-1 rounded-bl-2xl rounded-tr-[2rem] bg-secondary text-white text-[12px] font-black tracking-tight shadow-sm select-none"
    >
      Save {{ savingsPct }}%
    </div>

    <!-- Whole body is tappable and opens the full preview -->
    <button
      class="text-left active:opacity-90 transition-opacity cursor-pointer w-full group"
      @click="$emit('preview')"
    >
      <div class="px-4 pt-4 pb-3">
        <div class="flex items-baseline justify-between gap-2 mb-0.5">
          <h3 class="text-xl font-black text-black leading-none tracking-tight truncate cabin-sketch-regular">
            {{ sku.name }}
          </h3>
          <span v-if="owned" class="text-[13px] font-black tracking-tight text-emerald-600 shrink-0">Owned</span>
        </div>
        <p class="text-[13px] text-black/80 leading-snug">{{ sku.desc }}</p>
      </div>

      <!-- Variety strip: one tile per item. Tapping the card opens the full
           preview; the CTA below buys. -->
      <div class="relative pb-3 overflow-hidden">
        <div class="flex gap-1.5 px-4">
          <div
            v-for="item in contents"
            :key="item.id"
            class="w-11 h-11 rounded-xl overflow-hidden border border-primary/30 shrink-0"
          >
            <ShopGrantPreview :item-id="item.id" :user-img="userImg" />
          </div>
        </div>
        <!-- Soft right-edge fade hints the strip continues / is tappable. -->
        <div class="absolute inset-y-0 right-0 w-12 pointer-events-none bg-gradient-to-l from-tertiary to-transparent"></div>
      </div>
    </button>

    <!-- CTA -->
    <div class="px-4 pt-2 pb-4 mt-auto">
      <ion-button
        v-if="!owned"
        expand="block"
        color="secondary"
        shape="round"
        class="m-0 tracking-tight"
        @click="$emit('purchase')"
      >
        {{ (sku as any).priceString || 'Get the bundle' }}
      </ion-button>
      <div
        v-else
        class="w-full py-2 rounded-full bg-emerald-50 text-emerald-700 text-[13px] font-black tracking-tight text-center select-none flex items-center justify-center gap-1"
      >
        <ion-icon :icon="mdiCheck" class="text-sm" /> In your collection
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { IonButton, IonIcon } from "@ionic/vue";
import { mdiCheck } from "@mdi/js";
import { computed } from "vue";
import { describeGrant, type ShopSku } from "@/config/catalog.config";
import ShopGrantPreview from "./ShopGrantPreview.vue";

const props = withDefaults(
	defineProps<{
		sku: ShopSku;
		owned: boolean;
		highlight?: boolean;
		userImg?: string;
		/** % saved vs buying every grant separately. 0 = don't show a badge. */
		savingsPct?: number;
	}>(),
	{ savingsPct: 0 },
);
defineEmits(["purchase", "preview"]);

const contents = computed(() =>
	props.sku.grants.map((g) => ({ id: g, ...describeGrant(g) })),
);
</script>
