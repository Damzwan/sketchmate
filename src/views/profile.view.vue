<template>
  <ion-page>
    <TopBar title="Profile" />

    <ion-content class="bg-background">
      <transition name="liquid-fade" mode="out-in">

        <div
          v-if="loadingAccount"
          key="skeleton"
          class="px-4 pt-6 pb-12 max-w-2xl mx-auto cabin-sketch-regular"
        >
          <ProfileCardSkeleton />
        </div>

        <div
          v-else-if="user"
          key="content"
          class="px-4 pt-6 pb-12 max-w-2xl mx-auto cabin-sketch-regular"
        >
          <ProfileCard
            :user="user"
            :customization="user.customization"
            :world-remount-key="worldKey"
            :is-own-profile="true"
            @go-settings="goToSettings"
            @go-customize="goToCustomize"
            @go-network="goToNetwork"
            @open-connection="openMenu(Menu.ConnectionMenu)"
            show-stats
          />

          <div class="mt-7 p-1 rounded-2xl bg-primary/15 grid grid-cols-2 gap-1 border border-primary/20">
            <button
              v-for="tab in profileTabs"
              :key="tab.id"
              type="button"
              class="h-11 rounded-xl text-sm font-black transition-all"
              :class="profileTab === tab.id ? 'bg-tertiary text-black shadow-sm' : 'text-black/55 md:hover:bg-tertiary/60'"
              @click="profileTab = tab.id"
            >
              {{ tab.label }}
            </button>
          </div>

          <ProfilePost v-if="profileTab === 'posts'" :posts="userPosts" :loading="loadingPosts" />
          <ProfileCompetitions v-else :user="user" />

          <ion-infinite-scroll v-if="profileTab === 'posts'" @ionInfinite="loadMorePosts" :disabled="!hasMoreUserPosts">
            <ion-infinite-scroll-content loading-spinner="bubbles" />
          </ion-infinite-scroll>
        </div>
      </transition>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import {
	IonContent,
	IonInfiniteScroll,
	IonInfiniteScrollContent,
	IonPage,
	onIonViewDidEnter,
	useIonRouter,
} from "@ionic/vue";
import { storeToRefs } from "pinia";
import { ref } from "vue";
import TopBar from "@/components/general/TopBar.vue";
import PreviewProfileCard from "@/components/profile/PreviewProfileCard.vue";
import ProfileCard from "@/components/profile/ProfileCard.vue";
import ProfileCardSkeleton from "@/components/profile/ProfileCardSkeleton.vue";
import ProfileCompetitions from "@/components/profile/ProfileCompetitions.vue";
import ProfilePost from "@/components/profile/ProfilePost.vue";
import { masterAnimation } from "@/helper/animation.helper";
import { useToast } from "@/service/toast.service";
import { useAuthStore } from "@/store/auth.store";
import { useMenuStore } from "@/store/menu.store";
import { usePostStore } from "@/store/post.store";
import { Menu } from "@/types/menu.types";

const router = useIonRouter();
const authStore = useAuthStore();
const postStore = usePostStore();
const { toast } = useToast();

const { user } = storeToRefs(authStore);
const { userPosts, hasMoreUserPosts, isProfileDirty } = storeToRefs(postStore);
const { openMenu } = useMenuStore();

const loadingAccount = ref(true);
const loadingPosts = ref(false);
const profileTab = ref<"posts" | "competitions">("posts");
const profileTabs = [
	{ id: "posts" as const, label: "Posts" },
	{ id: "competitions" as const, label: "Competitions" },
];

// World lotties measure their canvas via getBoundingClientRect at mount. When a
// world edit re-renders them while this page is `ion-page-hidden` (display:none),
// the rect is 0 and they lock a wrong (small) size. Bumping this on view-enter
// remounts the world while the page is visible — same path as a fresh app load,
// which renders correctly.
const worldKey = ref(0);

const loadPosts = async () => {
	if (!user.value) return;
	loadingPosts.value = true;
	try {
		await postStore.getUserPosts(user.value._id, true);
	} catch {
		toast("Failed to load sketches", { color: "danger" });
	} finally {
		loadingPosts.value = false;
	}
};

const loadMorePosts = async (e: any) => {
	if (!user.value) return e.target.complete();
	try {
		await postStore.getUserPosts(user.value._id, false);
	} finally {
		e.target.complete();
	}
};

onIonViewDidEnter(async () => {
	worldKey.value++;
	await authStore.waitUntilInitialized();
	loadingAccount.value = false;
	if (userPosts.value.length === 0 || isProfileDirty.value) loadPosts();
});

const goToNetwork = (tab: string) =>
	router.push(`/network?tab=${tab}`, masterAnimation);
const goToSettings = () => router.push("/settings", masterAnimation);
const goToCustomize = () => router.push("/customize", masterAnimation);
</script>
