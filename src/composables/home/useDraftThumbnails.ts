import { onScopeDispose, type Ref, ref, watch } from "vue";
import type { DrawingDraftMetadata } from "@/draw/document/document.store";

/**
 * Resolve draft previews to `<img>`-usable urls, and own the object URLs.
 *
 * A Blob thumbnail needs `URL.createObjectURL`, which allocates a handle the
 * browser keeps alive until it is revoked — so every one created here has to be
 * released, or a home screen the user visits repeatedly leaks a WebP per card
 * per visit. The map is keyed by `id + updatedAt`: re-reading the same draft
 * from IndexedDB yields a NEW Blob instance for identical bytes, so reference
 * equality would churn a fresh url on every refresh.
 *
 * Legacy `data:` and remote `https:` thumbnails pass through untouched — they
 * are already urls and own no resources.
 */
export function useDraftThumbnails(drafts: Ref<DrawingDraftMetadata[]>) {
	const thumbnailUrls = ref<Record<string, string>>({});
	/** revision key → object url, for everything this composable allocated. */
	const owned = new Map<string, string>();

	const revisionKey = (draft: DrawingDraftMetadata) =>
		`${draft.id}:${draft.updatedAt}`;

	function release(keys: Iterable<string>): void {
		for (const key of keys) {
			const url = owned.get(key);
			if (!url) continue;
			URL.revokeObjectURL(url);
			owned.delete(key);
		}
	}

	watch(
		drafts,
		(list) => {
			const next: Record<string, string> = {};
			const live = new Set<string>();

			for (const draft of list) {
				const thumbnail = draft.thumbnail;
				if (!thumbnail) continue;

				if (typeof thumbnail === "string") {
					next[draft.id] = thumbnail;
					continue;
				}

				const key = revisionKey(draft);
				live.add(key);
				let url = owned.get(key);
				if (!url) {
					url = URL.createObjectURL(thumbnail);
					owned.set(key, url);
				}
				next[draft.id] = url;
			}

			const stale = [...owned.keys()].filter((key) => !live.has(key));
			thumbnailUrls.value = next;
			// Revoked only AFTER the new map is published. Revoking a url an <img>
			// is still pointing at makes it un-fetchable, and a re-render between
			// the two would show a broken image.
			if (stale.length) queueMicrotask(() => release(stale));
		},
		{ immediate: true, deep: false },
	);

	// `onScopeDispose`, not `onBeforeUnmount`: the latter is a no-op outside a
	// component instance, which would silently leak every handle if this were
	// ever called from a plain effect scope or another composable.
	onScopeDispose(() => release([...owned.keys()]));

	return { thumbnailUrls };
}
