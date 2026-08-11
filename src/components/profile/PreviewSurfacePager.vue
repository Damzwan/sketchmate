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


    <div class="relative">
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
          <!-- While the fullscreen overlay is up, freeze every pane so we never
               animate two copies of the same surface at once. -->
          <AmbientScope :active="mode === tab.id && !zoomOpen">
            <div
              v-if="visited.has(tab.id)"
              class="pane-zoom"
              :style="zoomStyle(tab.id)"
            >
              <PreviewSurface
                :mode="tab.id"
                :user="user"
                :customization="customization"
                :mock-post="mockPost"
                :mock-chat="mockChat"
                :mock-toast="mockToast"
              />
            </div>
          </AmbientScope>
        </section>
      </div>

      <!-- Expand → fullscreen. Only on the active pane, only when opted in. -->
      <button
        v-if="zoomable"
        class="preview-expand"
        aria-label="View fullscreen"
        @click="openZoom"
      >
        <ion-icon :icon="svg(mdiArrowExpand)" />
      </button>
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

    <!-- Fullscreen zoom as a native ion-modal: proper backdrop + hardware/back
         button + swipe-to-dismiss instead of a hand-rolled overlay. Mounts ONE
         surface, only while open. A manual ambient hold (see script) freezes
         every background world in ALL host contexts, and this AmbientScope
         re-arms the foreground so only the zoomed surface keeps animating. -->
    <ion-modal
      :is-open="zoomOpen"
      class="ps-zoom-modal"
      @didDismiss="zoomOpen = false"
    >
      <div
        class="ps-zoom-overlay"
        :style="{ '--post-img-max-h': '48vh' }"
        @click.self="zoomOpen = false"
      >
        <button class="ps-zoom-close" aria-label="Close" @click="zoomOpen = false">
          <ion-icon :icon="svg(mdiClose)" />
        </button>

        <!-- Surface chips so the user can still switch Card/Post/Chat zoomed.
             Drive the overlay's OWN state — never the pager's mode. -->
        <div class="ps-zoom-chips">
          <button
            v-for="tab in tabs"
            :key="'z' + tab.id"
            class="preview-chip"
            :class="{ 'preview-chip--active': zoomMode === tab.id }"
            @click="zoomMode = tab.id"
          >
            <ion-icon :icon="svg(tab.icon)" class="text-[15px]" />
            {{ tab.label }}
          </button>
        </div>

        <div class="ps-zoom-stage" @click.self="zoomOpen = false">
          <AmbientScope :active="true">
            <PreviewSurface
              :mode="zoomMode"
              :user="user"
              :customization="customization"
              :mock-post="mockPost"
              :mock-chat="mockChat"
              :mock-toast="mockToast"
            />
          </AmbientScope>
        </div>
      </div>
    </ion-modal>
  </div>
</template>

<script setup lang="ts">
import { IonIcon, IonModal } from "@ionic/vue";
import {
	mdiArrowExpand,
	mdiCardAccountDetailsOutline,
	mdiChatOutline,
	mdiClose,
	mdiImageOutline,
} from "@mdi/js";
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from "vue";
import exampleImg from "@/assets/example.webp";
import AmbientScope from "@/components/general/AmbientScope.vue";
import PreviewSurface from "@/components/profile/PreviewSurface.vue";
import { useSnapPager } from "@/composables/general/useSnapPager";
import type { Customization } from "@/config/profile_options.config";
import { svg } from "@/helper/general.helper";
import { useAmbientPause } from "@/store/ambientPause.store";

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
		/** Show an expand control that blows the active surface up to a
     fullscreen overlay. Opt-in — only the shop's showcase wants it. */
		zoomable?: boolean;
	}>(),
	{
		active: true,
		paneHeight: 420,
		paneWidth: "min(76%, 340px)",
		postImgMaxHeight: "190px",
		cardZoom: 0.68,
		postZoom: 0.92,
		chatZoom: 1,
		zoomable: false,
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

// Fullscreen zoom overlay for the active surface (opt-in via `zoomable`).
// Its own surface state — switching chips inside the overlay must NOT move the
// pager underneath (that desyncs when the overlay closes). Seeded from the
// pager's mode on open, then independent.
const zoomOpen = ref(false);
const zoomMode = ref<Mode>("card");
const openZoom = () => {
	zoomMode.value = mode.value;
	zoomOpen.value = true;
};

// A manual ambient hold while zoomed freezes every background world regardless
// of host context (the customization sheets don't engage the menu-tracked
// pause the shop does). Balanced release on close/unmount so the hold can't leak.
const ambient = useAmbientPause();
let holding = false;
watch(zoomOpen, (open) => {
	if (open && !holding) {
		holding = true;
		ambient.hold();
	} else if (!open && holding) {
		holding = false;
		ambient.release();
	}
});

const zooms = computed<Record<Mode, number>>(() => ({
	card: props.cardZoom,
	post: props.postZoom,
	chat: props.chatZoom,
}));

// Add this to your PreviewPager.vue script
const mockToast = computed<any>(() => {
	const u = props.user ?? {};
	return {
		tabId: "preview-toast",
		subtitle: u.name ?? "You",
		title: "Lobby",
		text: "You hopped into the room!",
		img: u.img,
		isTrial: false,
		isRequest: false,
		isJoin: true,
		customization: props.customization,
	};
});

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

const {
	pagerRef,
	scrollToPane,
	setActive: setMode,
	onPaneClick,
	onPagerScroll,
} = useSnapPager(
	tabs.map((tab) => tab.id),
	mode,
	{ onChange: markVisited },
);

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
			zoomOpen.value = false;
			visited.clear();
		}
	},
	{ immediate: true },
);

onBeforeUnmount(() => {
	window.clearTimeout(neighborTimer);
	if (holding) {
		holding = false;
		ambient.release();
	}
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
</script>

<style scoped>

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

/* ── Expand button (bottom-right of the pager) ──────────────────────────── */
.preview-expand {
  position: absolute;
  right: 10px;
  bottom: 8px;
  width: 34px;
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 9999px;
  border: 1.5px solid rgba(var(--ion-color-primary-rgb), 0.35);
  background: rgba(255, 255, 255, 0.9);
  color: var(--ion-color-secondary);
  font-size: 18px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  cursor: pointer;
  transition: transform 0.15s ease;
  z-index: 5;
}
.preview-expand:active {
  transform: scale(0.9);
}

/* ── Fullscreen zoom overlay (fills the transparent ion-modal) ──────────── */
.ps-zoom-modal {
  --background: transparent;
  --box-shadow: none;
  --width: 100%;
  --height: 100%;
  --border-radius: 0;
}

.ps-zoom-overlay {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: calc(16px + var(--ion-safe-area-top, 0px)) 16px
    calc(16px + var(--ion-safe-area-bottom, 0px));
  background: rgba(24, 14, 8, 0.82);
  /* Single static layer — composited once, not per frame. */
  backdrop-filter: blur(5px);
  -webkit-backdrop-filter: blur(5px);
}

.ps-zoom-stage {
  width: 100%;
  max-width: 520px;
  max-height: 100%;
  overflow-y: auto;
  display: flex;
  /* Top-anchor so a tall surface (the Post card) scrolls fully instead of
     being centre-clipped with its header unreachable. */
  align-items: flex-start;
  justify-content: center;
}

.ps-zoom-chips {
  position: absolute;
  top: calc(12px + var(--ion-safe-area-top, 0px));
  left: 0;
  right: 0;
  display: flex;
  justify-content: center;
  gap: 6px;
}

.ps-zoom-close {
  position: absolute;
  top: calc(12px + var(--ion-safe-area-top, 0px));
  right: 14px;
  width: 38px;
  height: 38px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 9999px;
  background: rgba(255, 255, 255, 0.15);
  color: #fff;
  font-size: 22px;
  cursor: pointer;
  z-index: 2;
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
