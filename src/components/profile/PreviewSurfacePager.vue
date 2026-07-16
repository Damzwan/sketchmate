<template>
  <div>

    <div class="flex justify-center gap-1.5 px-3 pb-1">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        class="preview-chip"
        :class="{ 'preview-chip--active': mode === tab.id }"
        @click="setMode(tab.id)"
      >
        <ion-icon :icon="svg(tab.icon)" class="text-[15px]" />
        {{ tab.label }}
      </button>
    </div>


    <div
      ref="pagerRef"
      class="preview-pager hide-scrollbar"
      :style="pagerVars"
      @scroll.passive="onPagerScroll"
      @touchmove.stop
    >
      <section
        v-for="tab in tabs"
        :key="'pane' + tab.id"
        class="preview-pane"
        :style="{ height: `${paneHeight}px` }"
        @click.capture="onPaneClick(tab.id, $event)"
      >
        <AmbientScope :active="mode === tab.id">
          <div
            v-if="visited.has(tab.id)"
            class="pane-zoom"
            :style="zoomStyle(tab.id)"
          >
            <!-- Card: the compact profile card, stats + signature. -->
            <PreviewProfileCard
              v-if="tab.id === 'card'"
              class="w-full flex justify-center"
              :user="user"
              :customization="customization"
              :zoom="1"
              :max-width="480"
              show-stats
            />

            <!-- Post: how a feed post looks wearing this look. Display-only.
                 Restrict max-width so it maintains a natural aspect ratio before scaling. -->
            <div v-else-if="tab.id === 'post'" class="post-preview w-full max-w-[420px] pointer-events-none">
              <FeedPostCard :post="mockPost" :is-mine="true" />
            </div>

            <!-- Chat: chat header (ChatToolbar) + conversation-list row.
                 Restrict max-width and add slight padding to avoid shadow clipping. -->
            <div v-else-if="tab.id === 'chat'" class="w-full max-w-[420px] px-1 pointer-events-none space-y-4">
              <div class="rounded-[1.5rem] overflow-hidden border border-primary/40 shadow-sm">
                <ChatToolbar :preview="chatPreview" />
              </div>
              <ConversationItem
                :chat="mockChat"
                current-user-id="preview-me"
                :is-online="true"
                :is-typing="false"
              />
            </div>
          </div>
        </AmbientScope>
      </section>
    </div>

    <!-- Swipe position dots -->
    <div class="flex items-center justify-center gap-1.5 mt-2 mb-1">
      <button
        v-for="tab in tabs"
        :key="'dot' + tab.id"
        class="pager-dot"
        :class="{ 'pager-dot--active': mode === tab.id }"
        :aria-label="tab.label"
        @click="setMode(tab.id)"
      ></button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from "vue";
import { IonIcon } from "@ionic/vue";
import {
	mdiCardAccountDetailsOutline,
	mdiChatOutline,
	mdiImageOutline,
} from "@mdi/js";
import { svg } from "@/helper/general.helper";
import type { Customization } from "@/config/profile_options.config";
import AmbientScope from "@/components/general/AmbientScope.vue";
import PreviewProfileCard from "@/components/profile/PreviewProfileCard.vue";
import FeedPostCard from "@/components/home/posts/FeedPostCard.vue";
import ConversationItem from "@/components/chat/ConversationItem.vue";
import ChatToolbar from "@/components/chat/ChatToolbar.vue";
import exampleImg from "@/assets/example.webp";

const props = withDefaults(
	defineProps<{
		user?: any;
		customization: Partial<Customization>;
		/** Host visibility. false → panes unmount (closed modals cost nothing);
     true → reset to Card and mount active+neighbor. */
		active?: boolean;
		/** Every pane box is exactly this tall — pick small (~260) for pick-and-
     apply modals where the item grid needs the room, larger (~420) for a
     dedicated preview sheet like the shop. */
		paneHeight?: number;
		/** Pane box width. Small pick-and-apply modals keep the default narrow
     peek; a dedicated preview sheet (shop) passes something wider like
     "min(92%, 480px)" so the look reads big while the next item still peeks. */
		paneWidth?: string;
		/** Cap for the Post surface's drawing image. Scale it up alongside a
     taller paneHeight so the post preview isn't a tiny letterbox. */
		postImgMaxHeight?: string;
		/** Per-surface zoom. Content width auto-compensates (100%/zoom), so any
     zoom still fills the pane; height crops at the bottom if it outgrows
     the box. */
		cardZoom?: number;
		postZoom?: number;
		chatZoom?: number;
	}>(),
	{
		active: true,
		paneHeight: 420,
		paneWidth: "min(76%, 340px)",
		postImgMaxHeight: "190px",
		cardZoom: 0.68,
		postZoom: 0.92,
		chatZoom: 1,
	},
);

// CSS custom props drive pane sizing so the same pager serves a compact picker
// and a big shop preview without duplicate markup.
const pagerVars = computed(() => ({
	"--pane-w": props.paneWidth,
	"--post-img-max-h": props.postImgMaxHeight,
}));

type Mode = "card" | "post" | "chat";
const tabs: { id: Mode; label: string; icon: string }[] = [
	{ id: "card", label: "Card", icon: mdiCardAccountDetailsOutline },
	{ id: "post", label: "Post", icon: mdiImageOutline },
	{ id: "chat", label: "Chat", icon: mdiChatOutline },
];
const mode = ref<Mode>("card");

const zooms = computed<Record<Mode, number>>(() => ({
	card: props.cardZoom,
	post: props.postZoom,
	chat: props.chatZoom,
}));

// zoom scales layout using transforms, so width 100%/z re-fills the pane at any scale level.
const zoomStyle = (id: Mode) => {
	const z = zooms.value[id] || 1;
	return {
		transform: `scale(${z})`,
		transformOrigin: "top center",
		width: `calc(100% / ${z})`,
	};
};

// Panes mount on first approach (active ± 1 neighbour, so the edge-peek and a
// swipe-in are never blank) and stay mounted after — no remount pop-in when
// swiping back. AmbientScope handles freezing; mounting is the only lazy part.
const visited = reactive(new Set<Mode>());
const markVisited = (id: Mode) => {
	const idx = tabs.findIndex((t) => t.id === id);
	visited.add(id);
	if (tabs[idx - 1]) visited.add(tabs[idx - 1].id);
	if (tabs[idx + 1]) visited.add(tabs[idx + 1].id);
};

const pagerRef = ref<HTMLElement | null>(null);
let pagerRaf = 0;

const scrollToPane = (idx: number, smooth = true) => {
	const el = pagerRef.value;
	const child = el?.children[idx] as HTMLElement | undefined;
	if (!el || !child) return;
	el.scrollTo({
		left: child.offsetLeft - (el.clientWidth - child.offsetWidth) / 2,
		behavior: smooth ? "smooth" : "auto",
	});
};

const setMode = (id: Mode, scroll = true) => {
	if (mode.value !== id) {
		mode.value = id;
		markVisited(id);
	}
	if (scroll) scrollToPane(tabs.findIndex((t) => t.id === id));
};

// Tapping a PEEKED (non-active) pane navigates to it instead of interacting
// with its content — capture phase so inner buttons never fire. The active
// pane's clicks pass through untouched.
const onPaneClick = (id: Mode, e: Event) => {
	if (mode.value === id) return;
	e.stopPropagation();
	e.preventDefault();
	setMode(id);
};

// Track swipes: whichever pane's center is nearest the pager's center is the
// active mode. rAF-throttled — scroll events fire far faster than paints.
const onPagerScroll = () => {
	if (pagerRaf) return;
	pagerRaf = requestAnimationFrame(() => {
		pagerRaf = 0;
		const el = pagerRef.value;
		if (!el) return;
		const center = el.scrollLeft + el.clientWidth / 2;
		let best = 0;
		let bestDist = Infinity;
		for (let i = 0; i < el.children.length; i++) {
			const child = el.children[i] as HTMLElement;
			const d = Math.abs(child.offsetLeft + child.offsetWidth / 2 - center);
			if (d < bestDist) {
				bestDist = d;
				best = i;
			}
		}
		const id = tabs[best]?.id;
		if (id && id !== mode.value) setMode(id, false);
	});
};

// Host opened → reset to Card, mount ONLY the card, and pull the neighbor in
// after the open transition settles — mounting a second world+effect surface
// mid-transition is exactly when the modal animation stutters. Host closed →
// unmount every pane so a customization view with six of these costs nothing.
let neighborTimer = 0;
watch(
	() => props.active,
	async (active) => {
		window.clearTimeout(neighborTimer);
		if (active) {
			mode.value = "card";
			visited.clear();
			visited.add("card");
			await nextTick();
			scrollToPane(0, false);
			neighborTimer = window.setTimeout(() => markVisited(mode.value), 450);
		} else {
			visited.clear();
		}
	},
	{ immediate: true },
);

onBeforeUnmount(() => {
	if (pagerRaf) cancelAnimationFrame(pagerRaf);
	window.clearTimeout(neighborTimer);
});

// ── Mock surfaces wearing the previewed look ────────────────────────────────
const mockPost = computed<any>(() => {
	const u = props.user ?? {};
	return {
		_id: "preview-post",
		author_id: u._id ?? "preview-me",
		author: {
			_id: u._id ?? "preview-me",
			name: u.name ?? "You",
			img: u.img,
			avatar: u.img,
			customization: props.customization,
		},
		image_url: exampleImg,
		drawing_url: exampleImg,
		description: u.description || "Fresh from the canvas ✨",
		createdAt: new Date().toISOString(),
		reaction_counts: { love: 12, fire: 4 },
		user_reaction: null,
		comment_count: 0,
		comments: [],
		views: 128,
		enable_comments: true,
		enable_remix: true,
	};
});

// A synthetic active conversation row wearing the previewed look. currentUserId
// is "preview-me", so the OTHER participant carries the customization.
const mockChat = computed<any>(() => {
	const u = props.user ?? {};
	return {
		_id: "preview-chat",
		participants: [
			{ _id: "preview-me", name: "You" },
			{
				_id: "preview-partner",
				name: u.name ?? "You",
				img: u.img,
				customization: props.customization,
			},
		],
		status: "active",
		initiator_id: "preview-me",
		last_message: { type: "text", content: "This is how your chats look 🎨" },
		unread_counts: { "preview-me": 2 },
		updatedAt: new Date().toISOString(),
	};
});

// Partner descriptor for the ChatToolbar header preview (bypasses its store
// resolution). Same look as the conversation row's partner.
const chatPreview = computed<any>(() => {
	const u = props.user ?? {};
	return {
		partner: {
			_id: "preview-partner",
			name: u.name ?? "You",
			img: u.img,
			customization: props.customization,
		},
	};
});
</script>

<style scoped>

.post-preview :deep(.tap-guard),
.post-preview :deep(.tap-guard > img) {
  max-height: var(--post-img-max-h, 190px);
}


.preview-pager {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  overflow-x: auto;
  scroll-snap-type: x mandatory;
  overscroll-behavior-x: contain;

  --pane-w: min(76%, 340px); /* fallback; host overrides via :style */
  padding: 4px calc(50% - (var(--pane-w) / 2)) 0;
}

.preview-pane {
  flex: 0 0 var(--pane-w);
  scroll-snap-align: center;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  overflow: hidden;
  border-radius: 1.5rem;
  cursor: pointer;
}

.pane-zoom {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  flex-shrink: 0;
}

.hide-scrollbar::-webkit-scrollbar {
  display: none;
}
.hide-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}

/* ── Chips ──────────────────────────────────────────────────────────── */
.preview-chip {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 7px 12px;
  border-radius: 9999px;
  font-size: 12.5px;
  font-weight: 900;
  letter-spacing: -0.01em;
  border: 1.5px solid rgba(var(--ion-color-primary-rgb), 0.35);
  background: #fff;
  color: rgba(0, 0, 0, 0.55);
  cursor: pointer;
  transition:
    background 0.18s ease,
    color 0.18s ease,
    border-color 0.18s ease,
    box-shadow 0.18s ease,
    transform 0.18s ease;
}
.preview-chip--active {
  background: var(--ion-color-secondary);
  border-color: var(--ion-color-secondary);
  color: #fff;
  box-shadow: 0 3px 10px rgba(var(--ion-color-secondary-rgb), 0.35);
  transform: scale(1.05);
}
.preview-chip:active {
  transform: scale(0.94);
}

/* ── Position dots ──────────────────────────────────────────────────── */
.pager-dot {
  width: 6px;
  height: 6px;
  border-radius: 9999px;
  border: none;
  padding: 0;
  background: rgba(0, 0, 0, 0.18);
  cursor: pointer;
  transition:
    width 0.2s ease,
    background 0.2s ease;
}
.pager-dot--active {
  width: 18px;
  background: var(--ion-color-secondary);
}
</style>