import { computed, type MaybeRefOrGetter, toValue } from "vue";
import type { ShopSku } from "@/config/catalog.config";
import { updateProfile } from "@/service/api/user.api";
import { useToast } from "@/service/toast.service";
import { useAuthStore } from "@/store/auth.store";
import { useInventoryStore } from "@/store/inventory.store";
import { useSubscriptionStore } from "@/store/subscription.store";

/**
 * Shop-equivalent actions for cosmetic previews shown outside the Shop modal.
 * Keeping ownership, purchasing and optimistic equipment here prevents prize
 * previews from becoming a read-only, second-class version of the shop.
 */
export function useShopPreviewActions(
	equipTarget: MaybeRefOrGetter<"profile" | "chat"> = "profile",
) {
	const auth = useAuthStore();
	const inventory = useInventoryStore();
	const subscriptions = useSubscriptionStore();
	const { toast } = useToast();
	const user = computed(() => auth.user);

	function isSkuOwned(sku: ShopSku | null): boolean {
		if (!sku) return false;
		return sku.kind === "bundle"
			? sku.grants.every((grant) => inventory.isOwned(grant))
			: inventory.isOwned(sku.id);
	}

	async function purchaseSku(sku: ShopSku | null): Promise<boolean> {
		if (!sku) return false;
		return subscriptions.purchaseSku(sku.id);
	}

	async function equipSku(patch: Record<string, unknown>): Promise<boolean> {
		const currentUser = user.value;
		if (!currentUser || !patch || Object.keys(patch).length === 0) return false;

		const target = toValue(equipTarget);
		const supportedPatch =
			target === "chat"
				? Object.fromEntries(
						Object.entries(patch).filter(([key]) =>
							["themeId", "fontId", "fontEffectId"].includes(key),
						),
					)
				: patch;
		if (Object.keys(supportedPatch).length === 0) {
			toast("That item is for profiles or drawing tools.");
			return false;
		}

		const field = target === "chat" ? "chat_customization" : "customization";
		const previous = { ...((currentUser as any)[field] ?? {}) };
		const next = { ...previous, ...supportedPatch };
		(currentUser as any)[field] = next;
		try {
			await updateProfile({ [field]: next } as any);
			toast(target === "chat" ? "Equipped to Chat" : "Equipped", {
				color: "success",
			});
			return true;
		} catch {
			(currentUser as any)[field] = previous;
			toast("Couldn't equip that. Please try again.", { color: "danger" });
			return false;
		}
	}

	return { user, isSkuOwned, purchaseSku, equipSku };
}
