<template>
  <section v-if="rewards.length" :class="compact ? '' : 'px-4 pt-5'">
    <div v-if="!compact" class="mb-2.5">
      <h2 class="text-lg font-black text-black">Prizes this week</h2>
    </div>

    <div :class="compact ? 'flex items-center gap-2' : 'flex gap-3 overflow-x-auto hide-scrollbar pb-1'">
      <component
        :is="interactive ? 'button' : 'div'"
        v-for="reward in displayedRewards"
        :key="`${reward.categoryId}:${reward.itemId}`"
        type="button"
        class="overflow-hidden border border-primary/35 bg-tertiary text-left shadow-sm"
        :class="compact
          ? 'w-12 h-12 rounded-xl shrink-0'
          : 'w-44 shrink-0 rounded-2xl cursor-pointer transition-all active:scale-[0.98] md:hover:scale-[1.025] md:hover:shadow-md'"
        @click="interactive && openReward(reward.itemId)"
      >
        <template v-if="compact">
          <ShopGrantPreview :item-id="reward.itemId" :user-img="user?.img" />
        </template>
        <template v-else>
          <div class="h-20 border-b border-primary/25">
            <ShopGrantPreview :item-id="reward.itemId" :user-img="user?.img" />
          </div>
          <div class="p-3">
            <p class="text-[10px] font-black uppercase tracking-widest text-black/80 truncate">
              {{ reward.categoryLabel }} prize
            </p>
            <p class="text-sm font-black text-black truncate mt-1">{{ reward.label }}</p>
          </div>
        </template>
      </component>
      <span v-if="compact && rewards.length > displayedRewards.length" class="text-[11px] font-black opacity-80">
        +{{ rewards.length - displayedRewards.length }}
      </span>
    </div>

    <ShopPreviewModal
      :is-open="!!previewSku"
      :sku="previewSku"
      :owned="isPreviewOwned"
      :user="user"
      :user-img="user?.img"
      @close="previewSku = null"
      @purchase="purchasePreview"
      @equip="equipPreview"
    />
  </section>
</template>

<script setup lang="ts">
import { storeToRefs } from "pinia";
import { computed, ref } from "vue";
import ShopGrantPreview from "@/components/shop/ShopGrantPreview.vue";
import ShopPreviewModal from "@/components/shop/ShopPreviewModal.vue";
import { useShopPreviewActions } from "@/composables/shop/useShopPreviewActions";
import {
	CATALOG_BY_ID,
	describeGrant,
	type ShopSku,
} from "@/config/catalog.config";
import type { CompetitionCategory } from "@/config/competition.config";
import { useAuthStore } from "@/store/auth.store";

const props = withDefaults(
	defineProps<{
		categories: CompetitionCategory[];
		compact?: boolean;
		interactive?: boolean;
	}>(),
	{ compact: false, interactive: true },
);

const { user } = storeToRefs(useAuthStore());
const shopActions = useShopPreviewActions();
const previewSku = ref<ShopSku | null>(null);
const isPreviewOwned = computed(() => shopActions.isSkuOwned(previewSku.value));
const rewards = computed(() => {
	const seen = new Set<string>();
	return props.categories.flatMap((category) =>
		category.reward_items.flatMap((itemId) => {
			const key = `${category.id}:${itemId}`;
			if (seen.has(key)) return [];
			seen.add(key);
			return [
				{
					itemId,
					categoryId: category.id,
					categoryLabel: category.label,
					label: describeGrant(itemId).label,
				},
			];
		}),
	);
});
const displayedRewards = computed(() =>
	props.compact ? rewards.value.slice(0, 2) : rewards.value,
);

function openReward(itemId: string) {
	const known = CATALOG_BY_ID[itemId];
	if (known) {
		previewSku.value = known;
		return;
	}
	const item = describeGrant(itemId);
	previewSku.value = {
		id: itemId,
		kind: "single",
		rcProductId: "",
		grants: [itemId],
		category: item.category,
		name: item.label,
		desc: "Competition prize",
	};
}

async function purchasePreview() {
	await shopActions.purchaseSku(previewSku.value);
}

async function equipPreview(patch: Record<string, unknown>) {
	if (await shopActions.equipSku(patch)) previewSku.value = null;
}
</script>

<style scoped>
.hide-scrollbar::-webkit-scrollbar { display: none; }
.hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
</style>
