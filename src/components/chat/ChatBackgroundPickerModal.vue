<template>
  <BaseSheetModal
    :is-open="isOpen"
    scrollable
    title="Chat Sketch"
    subtitle="A drawing behind your messages"
    @close="$emit('close')"
  >
    <div class="grid grid-cols-2 gap-1 p-1 rounded-full bg-black/5 mb-4">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        type="button"
        class="rounded-full py-2 text-sm font-black transition-all"
        :class="activeTab === tab.id ? 'bg-secondary text-white shadow-sm' : 'text-black/60'"
        @click="activeTab = tab.id"
      >
        {{ tab.label }}
      </button>
    </div>

    <div v-if="loading" class="min-h-52 flex items-center justify-center">
      <ion-spinner name="crescent" color="secondary" />
    </div>

    <div v-else-if="items.length" class="grid grid-cols-3 gap-3">
      <button
        v-for="item in items"
        :key="`${item.type}-${item.id}`"
        type="button"
        class="relative aspect-square rounded-2xl overflow-hidden bg-black/5 border border-primary/40 active:scale-95 transition-transform"
        :disabled="selectingId !== ''"
        @click="choose(item)"
      >
        <img
          :src="item.thumbnail"
          alt="Sketch background option"
          loading="lazy"
          decoding="async"
          class="w-full h-full object-contain"
        />
        <div v-if="selectingId === item.id" class="absolute inset-0 grid place-items-center bg-black/35">
          <ion-spinner name="crescent" class="text-white" />
        </div>
      </button>
    </div>

    <div v-else class="min-h-52 flex flex-col items-center justify-center text-center px-6">
      <ion-icon :icon="svg(mdiImageOffOutline)" class="text-4xl text-black/25" />
      <p class="mt-3 text-base font-black text-black/70">
        {{ activeTab === 'inbox' ? 'Your gallery is empty' : 'No posts yet' }}
      </p>
      <p class="mt-1 text-xs text-black/45">Share a drawing, then come back to make it your chat sketch.</p>
    </div>

    <ion-button
      v-if="canLoadMore"
      expand="block"
      fill="clear"
      color="secondary"
      class="mt-4"
      :disabled="loadingMore"
      @click="loadMore"
    >
      {{ loadingMore ? 'Loading…' : 'Show more' }}
    </ion-button>

    <template #footer>
      <ion-button
        v-if="currentUrl"
        expand="block"
        fill="outline"
        color="danger"
        shape="round"
        @click="clear"
      >
        <ion-icon :icon="svg(mdiTrashCanOutline)" slot="start" />
        Remove chat sketch
      </ion-button>
    </template>
  </BaseSheetModal>
</template>

<script setup lang="ts">
import { IonButton, IonIcon, IonSpinner } from "@ionic/vue";
import { mdiImageOffOutline, mdiTrashCanOutline } from "@mdi/js";
import { storeToRefs } from "pinia";
import { computed, ref, watch } from "vue";
import BaseSheetModal from "@/components/general/BaseSheetModal.vue";
import { svg } from "@/helper/general.helper";
import { fetchUserPosts, prepareChatBackground } from "@/service/api/user.api";
import { useToast } from "@/service/toast.service";
import { useAuthStore } from "@/store/auth.store";
import { useInboxStore } from "@/store/inbox.store";
import type { FeedPost } from "@/types/server.types";

const props = defineProps<{
	isOpen: boolean;
	currentUrl?: string;
}>();
const emit = defineEmits<{
	close: [];
	selected: [preview: { url: string; type: SourceType; id: string }];
	cleared: [];
}>();

type SourceType = "inbox" | "post";
interface PickerItem {
	id: string;
	type: SourceType;
	thumbnail: string;
}

const tabs = [
	{ id: "inbox" as const, label: "Gallery" },
	{ id: "post" as const, label: "My posts" },
];
const activeTab = ref<SourceType>("inbox");
const loading = ref(false);
const loadingMore = ref(false);
const selectingId = ref("");
const posts = ref<FeedPost[]>([]);
const postPage = ref(1);
const postsAllLoaded = ref(false);
const inboxStore = useInboxStore();
const {
	inbox,
	allLoaded: inboxAllLoaded,
	hasFetchedInitial,
} = storeToRefs(inboxStore);
const authStore = useAuthStore();
const { toast } = useToast();

const galleryItems = computed<PickerItem[]>(() =>
	inbox.value.map((item) => ({
		id: item._id,
		type: "inbox",
		thumbnail: item.thumbnail,
	})),
);
const postItems = computed<PickerItem[]>(() =>
	posts.value.map((post) => ({
		id: post._id,
		type: "post",
		thumbnail: post.thumbnail_url,
	})),
);
const items = computed(() =>
	activeTab.value === "inbox" ? galleryItems.value : postItems.value,
);
const canLoadMore = computed(() =>
	activeTab.value === "inbox" ? !inboxAllLoaded.value : !postsAllLoaded.value,
);

async function loadInitial() {
	if (!props.isOpen || loading.value) return;
	loading.value = true;
	try {
		const jobs: Promise<unknown>[] = [];
		if (!hasFetchedInitial.value) jobs.push(inboxStore.getInboxBatch(true));
		if (!posts.value.length && authStore.user?._id) {
			jobs.push(loadPostPage(true));
		}
		await Promise.all(jobs);
	} finally {
		loading.value = false;
	}
}

async function loadPostPage(reset = false) {
	const userId = authStore.user?._id;
	if (!userId || (postsAllLoaded.value && !reset)) return;
	if (reset) {
		postPage.value = 1;
		posts.value = [];
		postsAllLoaded.value = false;
	}
	const response = await fetchUserPosts(userId, postPage.value, 30);
	const incoming = response.posts ?? [];
	posts.value.push(
		...incoming.filter(
			(post) => !posts.value.some((existing) => existing._id === post._id),
		),
	);
	postsAllLoaded.value = incoming.length < 30;
	postPage.value++;
}

async function loadMore() {
	loadingMore.value = true;
	try {
		if (activeTab.value === "inbox") await inboxStore.getInboxBatch();
		else await loadPostPage();
	} finally {
		loadingMore.value = false;
	}
}

async function choose(item: PickerItem) {
	if (selectingId.value) return;
	selectingId.value = item.id;
	try {
		const { url } = await prepareChatBackground(item.type, item.id);
		emit("selected", { url, type: item.type, id: item.id });
		toast("Preview ready — confirm it to keep it! ✨", { color: "success" });
		emit("close");
	} catch {
		toast("Couldn't prepare that chat sketch.", { color: "danger" });
	} finally {
		selectingId.value = "";
	}
}

function clear() {
	emit("cleared");
	emit("close");
}

watch(
	() => props.isOpen,
	(open) => {
		if (open) void loadInitial();
	},
);
</script>
