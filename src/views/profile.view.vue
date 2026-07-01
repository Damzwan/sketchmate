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
            :is-own-profile="true"
            @go-settings="goToSettings"
            @go-customize="goToCustomize"
            @go-network="goToNetwork"
            @open-connection="openMenu(Menu.ConnectionMenu)"
          />

          <ProfilePost :posts="userPosts" :loading="loadingPosts" />

          <ion-infinite-scroll @ionInfinite="loadMorePosts" :disabled="!hasMoreUserPosts">
            <ion-infinite-scroll-content loading-spinner="bubbles" />
          </ion-infinite-scroll>
        </div>
      </transition>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { ref } from "vue";
import {
	IonContent,
	IonInfiniteScroll,
	IonInfiniteScrollContent,
	IonPage,
	onIonViewDidEnter,
	useIonRouter,
} from "@ionic/vue";
import { storeToRefs } from "pinia";
import { useAuthStore } from "@/store/auth.store";
import { usePostStore } from "@/store/post.store";
import { masterAnimation } from "@/helper/animation.helper";
import { useToast } from "@/service/toast.service";

import TopBar from "@/components/general/TopBar.vue";
import ProfileCard from "@/components/profile/ProfileCard.vue";
import ProfileCardSkeleton from "@/components/profile/ProfileCardSkeleton.vue";
import ProfilePost from "@/components/profile/ProfilePost.vue";
import { useMenuStore } from "@/store/menu.store";
import { Menu } from "@/draw/types/draw.types";

const router = useIonRouter();
const authStore = useAuthStore();
const postStore = usePostStore();
const { toast } = useToast();

const { user } = storeToRefs(authStore);
const { userPosts, hasMoreUserPosts, isProfileDirty } = storeToRefs(postStore);
const { openMenu } = useMenuStore();

const loadingAccount = ref(true);
const loadingPosts = ref(false);

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
	await authStore.waitUntilInitialized();
	loadingAccount.value = false;
	if (userPosts.value.length === 0 || isProfileDirty.value) loadPosts();
});

const goToNetwork = (tab: string) =>
	router.push(`/network?tab=${tab}`, masterAnimation);
const goToSettings = () => router.push("/settings", masterAnimation);
const goToCustomize = () => router.push("/customize", masterAnimation);
</script>