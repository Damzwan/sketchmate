import { computed, ref, watch } from "vue";
import { useUnlockItem } from "@/composables/shop/useUnlockItem";
import { buildItemId, type ItemCategory } from "@/config/catalog.config";
import { useInventoryStore } from "@/store/inventory.store";

interface CatalogPickerOptions<T> {
	isOpen: () => boolean;
	initialId: () => string;
	items: readonly T[];
	category: ItemCategory;
	idOf: (item: T) => string;
	nameOf: (item: T) => string;
	alwaysOwned?: (id: string) => boolean;
	isVisible?: (item: T, owned: boolean) => boolean;
	onSelect: (id: string) => void;
	onClose: () => void;
}

/** Selection, ownership, purchase and reset behavior shared by catalog sheets. */
export function useCatalogPicker<T>(options: CatalogPickerOptions<T>) {
	const inventory = useInventoryStore();
	const { purchasing, unlockItem } = useUnlockItem();
	const localSelection = ref(options.initialId());

	function isItemOwned(id: string): boolean {
		return (
			options.alwaysOwned?.(id) === true ||
			inventory.isOwned(buildItemId(options.category, id))
		);
	}

	const visibleItems = computed(() =>
		options.isVisible
			? options.items.filter((item) =>
					options.isVisible?.(item, isItemOwned(options.idOf(item))),
				)
			: [...options.items],
	);
	const selectionLocked = computed(() => !isItemOwned(localSelection.value));
	const selectionName = computed(() => {
		const item = options.items.find(
			(candidate) => options.idOf(candidate) === localSelection.value,
		);
		return item ? options.nameOf(item) : "";
	});

	watch(options.isOpen, (open) => {
		if (open) localSelection.value = options.initialId();
	});

	async function unlock(): Promise<void> {
		const unlocked = await unlockItem(
			buildItemId(options.category, localSelection.value),
		);
		if (!unlocked) return;
		options.onSelect(localSelection.value);
		options.onClose();
	}

	function confirm(): void {
		if (selectionLocked.value) {
			void unlock();
			return;
		}
		options.onSelect(localSelection.value);
		options.onClose();
	}

	return {
		localSelection,
		visibleItems,
		isItemOwned,
		selectionLocked,
		selectionName,
		purchasing,
		confirm,
		unlock,
	};
}
