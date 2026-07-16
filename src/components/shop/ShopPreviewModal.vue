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

      <!-- Post preview — exactly how a feed post looks wearing this item.
           Display-only (pointer-events-none) so taps don't fire real actions;
           scaled down so it doesn't dominate the sheet. -->
      <div v-if="mode === 'post'" class="px-1 pt-2 pb-4 pointer-events-none">
        <div class="post-preview mx-auto w-full max-w-[360px]">
          <FeedPostCard :post="mockPost" :is-mine="true" />
        </div>
      </div>

      <!-- Chat preview — the chat header (ChatToolbar) AND the conversation-list
           row, so both surfaces the look shows up on are covered. -->
      <div v-if="mode === 'chat'" class="px-1 pt-2 pb-4 pointer-events-none space-y-4">
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
import { computed, provide, ref, watch } from "vue";
import { IonButton } from "@ionic/vue";
import { AMBIENT_FOREGROUND } from "@/store/ambientPause.store";
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
import FeedPostCard from "@/components/home/posts/FeedPostCard.vue";
import ConversationItem from "@/components/chat/ConversationItem.vue";
import ChatToolbar from "@/components/chat/ChatToolbar.vue";
import exampleImg from "@/assets/example.webp";

const props = defineProps<{
	isOpen: boolean;
	sku: ShopSku | null;
	owned: boolean;
	user?: any;
	userImg?: string;
}>();
defineEmits(["close", "purchase", "equip"]);

// The previewed item is the ONE thing that should animate — the shop grid behind
// (which provides `false` while a preview is open) stays frozen.
provide(AMBIENT_FOREGROUND, true);

type Mode = "card" | "sheet" | "post" | "chat";
const tabs: { id: Mode; label: string }[] = [
	{ id: "card", label: "Card" },
	{ id: "sheet", label: "Full view" },
	{ id: "post", label: "Post" },
	{ id: "chat", label: "Chat" },
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

// A synthetic feed post wearing the previewed look — the user's own artwork if
// they have any, so "how my post looks with this" is real. Rendered display-only.
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
			customization: previewCustomization.value,
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
				customization: previewCustomization.value,
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
			customization: previewCustomization.value,
		},
	};
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

<style scoped>
/* The feed card's height is driven by its artwork strip (`.tap-guard`), whose
   image is `max-h-[50vh]` — huge inside a tall sheet. Cap that strip so the post
   preview is compact; the header/footer keep their natural size. */
.post-preview :deep(.tap-guard),
.post-preview :deep(.tap-guard > img) {
	max-height: 190px;
}
</style>
