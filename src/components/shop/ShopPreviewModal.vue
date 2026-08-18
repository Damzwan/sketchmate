<template>
  <BaseSheetModal :is-open="isOpen" scrollable @close="$emit('close')">
    <template #header>
      <div v-if="sku" class="shrink-0 text-center px-2">
        <h1 class="text-3xl text-secondary font-black tracking-tighter italic leading-none cabin-sketch-regular">
          {{ sku.name }}
        </h1>
        <p class="text-[14px] text-black/60 mt-2 leading-snug">{{ sku.desc }}</p>
        <span
          v-if="isBundle"
          class="inline-block mt-2 px-3 py-0.5 rounded-full bg-secondary/10 text-secondary text-[13px] font-black tracking-tight"
        >
          {{ sku.grants.length }} items
        </span>
      </div>
    </template>

    <div v-if="sku" data-content-scroll="true" @touchmove.stop>
      <!-- Shop = the dedicated "show it off" surface: wide panes so the look
           reads big and clear, with the neighbour still peeking (tap or swipe
           to it). Taller box + higher zoom than the compact in-app pickers. -->
      <ChatWidgetStylePager
        v-if="equipTarget === 'chat'"
        :customization="previewCustomization"
        :user="user"
        class="mx-1"
      />
      <PreviewSurfacePager
        v-else
        :user="user"
        :customization="previewCustomization"
        :active="isOpen && !!sku"
        v-bind="SHOWCASE_PREVIEW"
      />

      <!-- Bundle contents grid (bundles only — a single item is redundant here) -->
      <div v-if="isBundle" class="grid grid-cols-2 gap-3 px-1 pt-4 pb-4">
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
    </div>

    <template v-if="showActions" #footer>
      <div v-if="sku" class="px-1 pt-2 pb-1 bg-background">
        <ion-button
          v-if="!owned"
          expand="block"
          color="secondary"
          shape="round"
          size="large"
          @click="$emit('purchase')"
        >
          {{ purchaseLabel }}
        </ion-button>
        <ion-button
          v-else-if="canEquip"
          expand="block"
          color="secondary"
          shape="round"
          size="large"
          @click="$emit('equip', equipPatch)"
        >
          {{ equipTarget === 'chat' ? 'Equip to Chat' : (isBundle ? 'Equip this look' : 'Equip') }}
        </ion-button>
        <ion-button v-else expand="block" fill="outline" shape="round" size="large" disabled>
          In your collection
        </ion-button>
      </div>
    </template>
  </BaseSheetModal>
</template>

<script setup lang="ts">
import { IonButton } from "@ionic/vue";
import { computed } from "vue";
import ChatWidgetStylePager from "@/components/chat/ChatWidgetStylePager.vue";
import BaseSheetModal from "@/components/general/BaseSheetModal.vue";
import PreviewSurfacePager from "@/components/profile/PreviewSurfacePager.vue";
import {
	describeGrant,
	type ItemCategory,
	type ShopSku,
} from "@/config/catalog.config";
import { SHOWCASE_PREVIEW } from "@/config/preview.config";
import type { Customization } from "@/config/profile_options.config";
import ShopGrantPreview from "./ShopGrantPreview.vue";

const props = withDefaults(
	defineProps<{
		isOpen: boolean;
		sku: ShopSku | null;
		owned: boolean;
		user?: any;
		userImg?: string;
		equipTarget?: "profile" | "chat";
		showActions?: boolean;
	}>(),
	{ showActions: true },
);
defineEmits(["close", "purchase", "equip"]);

const isBundle = computed(() => props.sku?.kind === "bundle");
const purchaseLabel = computed(() => {
	const action = isBundle.value ? "Get the bundle" : "Unlock";
	const price = (props.sku as any)?.priceString;
	return price ? `${action} · ${price}` : action;
});

const contents = computed(() =>
	(props.sku?.grants ?? []).map((g) => ({ id: g, ...describeGrant(g) })),
);

// Which customization field each grant category drives. Brushes (and anything
// not listed) have no profile representation, so they're skipped.
const GRANT_FIELD: Partial<Record<ItemCategory, keyof Customization>> = {
	theme: "themeId",
	world: "worldId",
	effect: "effectId",
	decoration: "decorationId",
	font: "fontId",
	font_effect: "fontEffectId",
	title: "titleId",
};
const CHAT_FIELDS = new Set<keyof Customization>([
	"themeId",
	"fontId",
	"fontEffectId",
]);

// Start from the user's REAL customization so their signature, background
// sketch, stats etc. show through, then fold the item's grants on top — i.e.
// "your profile, with this item applied". Works for a single item (one grant)
// and a bundle (many) alike.
const previewCustomization = computed<Partial<Customization>>(() => {
	const c: Partial<Customization> = {
		...((props.equipTarget === "chat"
			? props.user?.chat_customization
			: props.user?.customization) ?? {}),
	};
	for (const grant of props.sku?.grants ?? []) {
		const [cat, ...rest] = grant.split(".");
		const field = GRANT_FIELD[cat as ItemCategory];
		if (field && (props.equipTarget !== "chat" || CHAT_FIELDS.has(field)))
			c[field] = rest.join(".");
	}
	return c;
});

// Just this item's grants mapped to their customization fields (no existing
// user fields) — emitted on "Equip" so the parent applies the whole look. A
// single item sets one field; a bundle sets all of them at once.
const equipPatch = computed<Partial<Customization>>(() => {
	const patch: Partial<Customization> = {};
	for (const grant of props.sku?.grants ?? []) {
		const [cat, ...rest] = grant.split(".");
		const field = GRANT_FIELD[cat as ItemCategory];
		if (field && (props.equipTarget !== "chat" || CHAT_FIELDS.has(field)))
			patch[field] = rest.join(".");
	}
	return patch;
});

// Brushes (and other tool-only grants) have no profile field, so there's
// nothing to "equip" from here — fall back to the plain collection label.
const canEquip = computed(() =>
	Object.keys(equipPatch.value).some(
		(key) =>
			props.equipTarget !== "chat" ||
			CHAT_FIELDS.has(key as keyof Customization),
	),
);
</script>
