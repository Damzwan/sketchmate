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

    <!-- Full view = the big full-bleed surface people see when they open your
         profile (worlds get room to breathe); Card = the compact profile card. -->
    <template v-if="sku" #sub-header>
      <div class="flex justify-center gap-2 px-3 pb-1">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          class="px-4 py-1.5 rounded-full text-[13px] font-black tracking-tight border transition-colors cursor-pointer active:scale-95"
          :class="mode === tab.id
            ? 'bg-secondary text-white border-secondary'
            : 'bg-white text-black/70 border-primary/40'"
          @click="mode = tab.id"
        >
          {{ tab.label }}
        </button>
      </div>
    </template>

    <div v-if="sku" data-content-scroll="true" @touchmove.stop>
      <!-- Full-view (sheet) preview: the real ProfileSheetView with YOUR own
           profile — stats, signature, portfolio and all — so it's exactly what
           mates see, just with this item applied. -->
      <div v-if="mode === 'sheet'" class="px-1 pb-4">
        <div class="mx-auto w-full max-w-[380px] h-[560px] rounded-[2.25rem] overflow-hidden border-2 border-primary/40 shadow-lg">
          <ProfileSheetView
            :user="user"
            :customization="previewCustomization"
            :posts="ownPosts"
            :posts-loading="postsLoading"
          />
        </div>
      </div>

      <!-- Card preview — wider, with stats + signature, so it's the full
           ProfileCard just like the profile page shows. -->
      <div v-if="mode === 'card'" class="px-1 pt-2 pb-4">
        <PreviewProfileCard
          :user="user"
          :customization="previewCustomization"
          :zoom="0.95"
          :max-width="480"
          show-stats
        />
      </div>

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
          {{ isBundle ? 'Get the bundle' : 'Unlock' }} · {{ (sku as any).priceString || '' }}
        </ion-button>
        <ion-button
          v-else-if="canEquip"
          expand="block"
          color="secondary"
          shape="round"
          size="large"
          @click="$emit('equip', equipPatch)"
        >
          {{ isBundle ? 'Equip this look' : 'Equip' }}
        </ion-button>
        <ion-button v-else expand="block" fill="outline" shape="round" size="large" disabled>
          In your collection
        </ion-button>
      </div>
    </template>
  </BaseSheetModal>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { IonButton } from "@ionic/vue";
import { storeToRefs } from "pinia";
import {
	describeGrant,
	type ItemCategory,
	type ShopSku,
} from "@/config/catalog.config";
import type { Customization } from "@/config/profile_options.config";
import { usePostStore } from "@/store/post.store";
import BaseSheetModal from "@/components/general/BaseSheetModal.vue";
import ShopGrantPreview from "./ShopGrantPreview.vue";
import PreviewProfileCard from "@/components/profile/PreviewProfileCard.vue";
import ProfileSheetView from "@/components/profile/ProfileSheetView.vue";

const props = defineProps<{
	isOpen: boolean;
	sku: ShopSku | null;
	owned: boolean;
	user?: any;
	userImg?: string;
}>();
defineEmits(["close", "purchase", "equip"]);

type Mode = "card" | "sheet";
const tabs: { id: Mode; label: string }[] = [
	{ id: "card", label: "Card" },
	{ id: "sheet", label: "Full view" },
];
// Full view first — it's the important "what mates actually see" surface and it
// fills the sheet, so there's no empty space on single items.
const mode = ref<Mode>("card");

const isBundle = computed(() => props.sku?.kind === "bundle");

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

// Start from the user's REAL customization so their signature, background
// sketch, stats etc. show through, then fold the item's grants on top — i.e.
// "your profile, with this item applied". Works for a single item (one grant)
// and a bundle (many) alike.
const previewCustomization = computed<Partial<Customization>>(() => {
	const c: Partial<Customization> = { ...(props.user?.customization ?? {}) };
	for (const grant of props.sku?.grants ?? []) {
		const [cat, ...rest] = grant.split(".");
		const field = GRANT_FIELD[cat as ItemCategory];
		if (field) c[field] = rest.join(".");
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
		if (field) patch[field] = rest.join(".");
	}
	return patch;
});

// Brushes (and other tool-only grants) have no profile field, so there's
// nothing to "equip" from here — fall back to the plain collection label.
const canEquip = computed(() => Object.keys(equipPatch.value).length > 0);

// Your own portfolio, so the full view shows real sketches like the live sheet.
const postStore = usePostStore();
const { userPosts } = storeToRefs(postStore);
const ownPosts = computed(() => userPosts.value);
const postsLoading = ref(false);

watch(
	() => [props.isOpen, props.sku?.id],
	([open]) => {
		if (!open) return;
		mode.value = "card";
		const meId = props.user?._id;
		if (meId && userPosts.value.length === 0) {
			postsLoading.value = true;
			postStore
				.getUserPosts(meId, true)
				.finally(() => (postsLoading.value = false));
		}
	},
);
</script>
