<template>
  <BaseSheetModal :is-open="isOpen" scrollable @close="$emit('close')">
    <template #header>
      <div v-if="sku" class="shrink-0 text-center px-2">
        <h1 class="text-3xl text-secondary font-black tracking-tighter italic leading-none cabin-sketch-regular">
          {{ sku.name }}
        </h1>
        <p class="text-[14px] text-black/60 mt-2 leading-snug">{{ sku.desc }}</p>
        <span class="inline-block mt-2 px-3 py-0.5 rounded-full bg-secondary/10 text-secondary text-[13px] font-black tracking-tight">
          {{ sku.grants.length }} items
        </span>
      </div>
    </template>

    <!-- Live preview: the whole look applied to the user's own card, so it's
         obvious what the bundle turns their profile into. Brushes have no card
         field, so they're skipped here (still listed in the grid below). -->
    <template v-if="sku" #sub-header>
      <div class="px-3">
        <PreviewProfileCard :user="user" :customization="previewCustomization" />
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
          <p class="text-[15px] font-black text-black leading-none truncate">{{ item.label }}</p>
          <p class="text-[12px] text-black/70 tracking-tight mt-1 capitalize">
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
import {
	describeGrant,
	type ItemCategory,
	type ShopSku,
} from "@/config/catalog.config";
import type { Customization } from "@/config/profile_options.config";
import BaseSheetModal from "@/components/general/BaseSheetModal.vue";
import ShopGrantPreview from "./ShopGrantPreview.vue";
import PreviewProfileCard from "@/components/profile/PreviewProfileCard.vue";

const props = defineProps<{
	isOpen: boolean;
	sku: ShopSku | null;
	owned: boolean;
	user?: any;
	userImg?: string;
}>();
defineEmits(["close", "purchase"]);

const contents = computed(() =>
	(props.sku?.grants ?? []).map((g) => ({ id: g, ...describeGrant(g) })),
);

// Which customization field each grant category drives on the card. Brushes
// (and anything not listed) have no card representation, so they're left out of
// the preview — the grid below still lists them.
const GRANT_FIELD: Partial<Record<ItemCategory, keyof Customization>> = {
	theme: "themeId",
	world: "worldId",
	effect: "effectId",
	decoration: "decorationId",
	font: "fontId",
	font_effect: "fontEffectId",
	title: "titleId",
};

// Fold the bundle's grants into a single customization = the whole look at once.
const previewCustomization = computed<Partial<Customization>>(() => {
	const c: Partial<Customization> = {};
	for (const grant of props.sku?.grants ?? []) {
		const [cat, ...rest] = grant.split(".");
		const field = GRANT_FIELD[cat as ItemCategory];
		if (field) c[field] = rest.join(".");
	}
	return c;
});
</script>
