<template>
  <div
    class="snap-start shrink-0 w-[260px] relative rounded-[2rem] overflow-hidden border bg-tertiary shadow-sm flex flex-col transition-all duration-200 md:hover:scale-[1.02] md:hover:shadow-md"
    :class="[owned ? 'border-emerald-400/60' : 'border-primary/40', highlight && 'ring-2 ring-secondary']"
  >
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

      <!-- Variety strip: one tile per item. A magnifier badge fades in over the
           right edge so it reads as "open me" without a text prompt. -->
      <div class="relative pb-3">
        <div class="flex gap-1.5 px-4">
          <div
            v-for="item in contents"
            :key="item.id"
            class="w-11 h-11 rounded-xl overflow-hidden border border-primary/30 shrink-0"
          >
            <ShopGrantPreview :item-id="item.id" :user-img="userImg" />
          </div>
        </div>
        <div class="absolute inset-y-0 right-0 w-20 flex items-center justify-end pr-3 pointer-events-none bg-gradient-to-l from-tertiary via-tertiary/90 to-transparent">
          <span class="flex items-center justify-center w-9 h-9 rounded-full bg-secondary text-white shadow-md transition-transform duration-200 group-hover:scale-110">
            <ion-icon :icon="svg(mdiMagnifyPlusOutline)" class="text-xl" />
          </span>
        </div>
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
import { computed } from "vue";
import { IonButton, IonIcon } from "@ionic/vue";
import { mdiCheck, mdiMagnifyPlusOutline } from "@mdi/js";
import { svg } from "@/helper/general.helper";
import { describeGrant, type ShopSku } from "@/config/catalog.config";
import ShopGrantPreview from "./ShopGrantPreview.vue";

const props = defineProps<{
	sku: ShopSku;
	owned: boolean;
	highlight?: boolean;
	userImg?: string;
}>();
defineEmits(["purchase", "preview"]);

const contents = computed(() =>
	props.sku.grants.map((g) => ({ id: g, ...describeGrant(g) })),
);
</script>
