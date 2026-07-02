<template>
  <BaseSheetModal :is-open="isOpen" scrollable @close="$emit('close')">
    <template #header>
      <div v-if="sku" class="shrink-0 text-center px-2">
        <h1 class="text-3xl text-secondary font-black tracking-tighter italic leading-none cabin-sketch-regular">
          {{ sku.name }}
        </h1>
        <p class="text-[13px] text-black/60 mt-2 leading-snug">{{ sku.desc }}</p>
        <span class="inline-block mt-2 px-3 py-0.5 rounded-full bg-secondary/10 text-secondary text-[12px] font-black tracking-tight">
          {{ sku.grants.length }} items
        </span>
      </div>
    </template>

    <div v-if="sku" data-content-scroll="true" @touchmove.stop class="grid grid-cols-2 gap-3 pb-4">
      <div
        v-for="item in contents"
        :key="item.id"
        class="rounded-[1.5rem] overflow-hidden border border-primary/40 bg-tertiary shadow-sm"
      >
        <div class="h-24 border-b border-primary/30">
          <ShopGrantPreview :item-id="item.id" :user-img="userImg" />
        </div>
        <div class="px-3 py-2">
          <p class="text-[14px] font-black text-black leading-none truncate">{{ item.label }}</p>
          <p class="text-[11px] text-black/70 tracking-tight mt-1 capitalize">
            {{ item.category.replace('_', ' ') }}
          </p>
        </div>
      </div>
    </div>

    <template #footer>
      <div v-if="sku" class="px-1 pt-2 pb-1 bg-background">
        <ion-button
          v-if="!owned"
          expand="block"
          color="secondary"
          shape="round"
          size="large"
          @click="$emit('purchase')"
        >
          Get the bundle · {{ (sku as any).priceString || '' }}
        </ion-button>
        <ion-button v-else expand="block" fill="outline" shape="round" size="large" disabled>
          In your collection
        </ion-button>
      </div>
    </template>
  </BaseSheetModal>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { IonButton } from "@ionic/vue";
import { describeGrant, type ShopSku } from "@/config/catalog.config";
import BaseSheetModal from "@/components/general/BaseSheetModal.vue";
import ShopGrantPreview from "./ShopGrantPreview.vue";

const props = defineProps<{
	isOpen: boolean;
	sku: ShopSku | null;
	owned: boolean;
	userImg?: string;
}>();
defineEmits(["close", "purchase"]);

const contents = computed(() =>
	(props.sku?.grants ?? []).map((g) => ({ id: g, ...describeGrant(g) })),
);
</script>
