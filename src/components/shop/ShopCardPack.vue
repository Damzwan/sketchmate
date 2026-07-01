<template>
  <div
    class="snap-start shrink-0 w-[260px] relative rounded-[2rem] overflow-hidden border bg-tertiary shadow-sm flex flex-col"
    :class="[owned ? 'border-emerald-400/60' : 'border-primary/40', highlight && 'ring-2 ring-secondary']"
  >
    <!-- Tappable body opens the full preview -->
    <button class="text-left active:opacity-90 transition-opacity" @click="$emit('preview')">
      <div class="px-4 pt-4 pb-3">
        <div class="flex items-baseline justify-between gap-2 mb-0.5">
          <h3 class="text-xl font-black text-black leading-none tracking-tight truncate cabin-sketch-regular">
            {{ sku.name }}
          </h3>
          <span v-if="owned" class="text-[12px] font-black tracking-tight text-emerald-600 shrink-0">Owned</span>
        </div>
        <p class="text-[12px] text-black/80 leading-snug">{{ sku.desc }}</p>
      </div>

      <!-- Variety strip: one tile per item -->
      <div class="flex gap-1.5 px-4 pb-1">
        <div
          v-for="item in contents"
          :key="item.id"
          class="w-11 h-11 rounded-xl overflow-hidden border border-primary/30 shrink-0"
        >
          <ShopGrantPreview :item-id="item.id" :user-img="userImg" />
        </div>
      </div>
      <p class="text-[12px] text-black/60 px-4 pt-2">
        {{ sku.grants.length }} items, tap to preview
      </p>
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
        class="w-full py-2 rounded-full bg-emerald-50 text-emerald-700 text-[12px] font-black tracking-tight text-center select-none flex items-center justify-center gap-1"
      >
        <ion-icon :icon="mdiCheck" class="text-sm" /> In your collection
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { IonButton, IonIcon } from "@ionic/vue";
import { mdiCheck } from "@mdi/js";
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
