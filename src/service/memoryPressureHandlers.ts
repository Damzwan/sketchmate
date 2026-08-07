// memoryPressureHandlers.ts
//
// What the app gives back when Android asks (P3.3). The bus itself lives in
// `memoryPressure.ts`; this is the policy.
//
// Ordering principle: shed what is furthest from what the user is looking at,
// and only ever shed things that can be re-derived. Each tier is cumulative.
//
// The draw engine is deliberately absent — it subscribes to the same bus from
// `draw/diagnostics/drawMemoryPressure.ts`, where it can release GPU-backed
// caches without this module having to import Fabric.

import {
	installMemoryPressureBridge,
	type MemoryPressureLevel,
	onMemoryPressure,
} from "@/service/memoryPressure";
import { useChatStore } from "@/store/chat.store";
import { useInboxStore } from "@/store/inbox.store";
import { usePhotoSwiper } from "@/store/photoswiper.store";
import { usePostStore } from "@/store/post.store";

/** Cache ceilings under pressure, well below the steady-state limits. */
const CHAT_CONVERSATIONS_UNDER_PRESSURE = 2;
const POST_CACHE_UNDER_PRESSURE = 10;
const INBOX_ITEMS_UNDER_PRESSURE = 40;

function shedViewCaches() {
	// The swiper retains the whole collection it was opened with plus every
	// decoded slide. Closed, it is pure dead weight.
	const swiper = usePhotoSwiper();
	if (!swiper.open) swiper.releaseRetainedContent();

	usePostStore().prunePostCache(POST_CACHE_UNDER_PRESSURE);
}

function shedDormantConversations() {
	// Keeps the conversation the user has open; drops the rest, which re-fetch
	// on next open exactly as they do after the normal LRU eviction.
	useChatStore().pruneMessageCaches(CHAT_CONVERSATIONS_UNDER_PRESSURE);
}

function shedInboxTail() {
	// Trimming the tail is safe: pagination refills it from the `lastDate`
	// cursor. `allLoaded` must be cleared or the list would refuse to page back.
	const inbox = useInboxStore();
	if (inbox.inbox.length <= INBOX_ITEMS_UNDER_PRESSURE) return;
	inbox.inbox = inbox.inbox.slice(0, INBOX_ITEMS_UNDER_PRESSURE);
	inbox.allLoaded = false;
}

function handle(level: MemoryPressureLevel) {
	// uiHidden is not scarcity — it only means the UI went away. View caches are
	// worthless in that state, but conversations and inbox pages are not.
	if (level === "uiHidden") {
		shedViewCaches();
		return;
	}

	shedViewCaches();
	if (level === "moderate") return;

	shedDormantConversations();
	if (level === "low") return;

	shedInboxTail();
}

/** Call once at boot. Idempotent; a no-op on web. */
export function installMemoryPressureHandlers(): () => void {
	installMemoryPressureBridge();
	return onMemoryPressure(handle);
}
