import { computed, ref } from "vue";
import { useUserContextSheet } from "@/composables/profile/useUserContextSheet";
import { useShopPreviewActions } from "@/composables/shop/useShopPreviewActions";
import {
	CATALOG_BY_ID,
	describeGrant,
	type ShopSku,
} from "@/config/catalog.config";
import type {
	CompetitionAuthor,
	CompetitionResultRow,
} from "@/service/api/competition.api";
import { mixpanelEvents, trackEvent } from "@/service/mixpanel";

export function useWinnerRewards(hasWon: () => boolean) {
	const { openUserActions } = useUserContextSheet();
	const shopActions = useShopPreviewActions();
	const previewSku = ref<ShopSku | null>(null);
	const isPreviewOwned = computed(() =>
		shopActions.isSkuOwned(previewSku.value),
	);

	function rewardFor(row: CompetitionResultRow) {
		const itemId = row.granted_items.find((id) => !id.startsWith("title."));
		return itemId ? { id: itemId, label: describeGrant(itemId).label } : null;
	}

	function openReward(itemId: string) {
		trackEvent(mixpanelEvents.competitionRewardShopOpen, {
			item_id: itemId,
			won: hasWon(),
		});
		const knownSku = CATALOG_BY_ID[itemId];
		if (knownSku) {
			previewSku.value = knownSku;
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

	function openProfile(winner: CompetitionAuthor) {
		void openUserActions({
			_id: winner._id,
			name: winner.name,
			img: winner.img,
		});
	}

	return {
		previewSku,
		isPreviewOwned,
		rewardFor,
		openReward,
		purchasePreview,
		equipPreview,
		openProfile,
	};
}
