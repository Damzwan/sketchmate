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
          <section class="mt-16 bg-primary/10 rounded-[3rem] border border-primary/20 shadow-sm relative px-6 pb-8 pt-4">
            <div class="flex flex-col items-center -mt-20 relative z-20">
              <div class="w-32 h-32 rounded-[2.5rem] bg-primary/20 animate-pulse shadow-sm"></div>
              <div class="mt-6 h-8 w-48 bg-primary/20 rounded-xl animate-pulse"></div>
              <div class="mt-4 h-4 w-64 bg-primary/10 rounded-md animate-pulse"></div>
            </div>
          </section>
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
            :is-editing="isEditing"
            :edit-form="editForm"
            @toggle-edit="toggleEdit"
            @go-settings="goToSettings"
            @go-customize="goToCustomize"
            @update-img="handleImgUpdate"
            @go-network="goToNetwork"
            @open-connection="openMenu(Menu.ConnectionMenu)"
            @update:edit-form-name="editForm.name = $event"
            @update:edit-form-desc="editForm.description = $event"
          />

          <!-- My Posts -->
          <section class="mt-10">
            <div class="flex items-center justify-between px-2 mb-4">
              <h3 class="text-xl font-black text-black italic drop-shadow-sm">My Posts</h3>
              <span class="text-xs font-bold text-black/40">{{ userPosts.length }} Sketches</span>
            </div>

            <div v-if="loadingPosts && userPosts.length === 0" class="grid grid-cols-2 gap-3">
              <div
                v-for="i in 4"
                :key="i"
                class="aspect-square bg-primary/10 rounded-[2rem] animate-pulse border border-primary/20"
              ></div>
            </div>

            <div
              v-else-if="userPosts.length === 0"
              class="text-center py-10 bg-primary/5 rounded-[2.5rem] border-2 border-dashed border-primary/20"
            >
              <span class="text-4xl grayscale block mb-2 opacity-30">🎨</span>
              <p class="text-sm font-bold text-black/40">You haven't posted any sketches yet.</p>
            </div>

            <div v-else class="grid grid-cols-2 gap-3">
              <div
                v-for="(post, index) in userPosts"
                :key="post._id"
                class="aspect-square bg-primary/5 rounded-[2rem] border border-primary/20 shadow-sm relative overflow-hidden active:scale-95 transition-transform group cursor-pointer"
                @click="openPostSwiper(userPosts, index)"
              >
                <img
                  :src="post.image_url"
                  class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                  loading="lazy"
                />
                <div
                  v-if="getTotalReactions(post.reaction_counts) > 0"
                  class="absolute bottom-2 left-2 flex items-center space-x-1 bg-black/40 backdrop-blur-md px-2 py-1 rounded-full border border-white/20 shadow-sm"
                >
                  <ion-icon :icon="svg(mdiHeart)" class="text-[10px] text-white" />
                  <span class="text-[10px] font-black text-white">
                    {{ formatNumber(getTotalReactions(post.reaction_counts)) }}
                  </span>
                </div>
              </div>
            </div>
          </section>

          <ion-infinite-scroll @ionInfinite="loadMorePosts" :disabled="!hasMoreUserPosts">
            <ion-infinite-scroll-content loading-spinner="bubbles" />
          </ion-infinite-scroll>
        </div>
      </transition>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { reactive, ref, watch } from "vue";
import {
	IonContent,
	IonIcon,
	IonInfiniteScroll,
	IonInfiniteScrollContent,
	IonPage,
	onIonViewDidEnter,
	useIonRouter,
} from "@ionic/vue";
import { storeToRefs } from "pinia";
import { useAuthStore } from "@/store/auth.store";
import { usePostStore } from "@/store/post.store";
import { svg } from "@/helper/general.helper";
import { mdiHeart } from "@mdi/js";
import { masterAnimation } from "@/helper/animation.helper";
import { updateProfile, uploadProfileImg } from "@/service/api/user.api";
import { usePostSwiper } from "@/composables/home/usePostSwiper";
import { useToast } from "@/service/toast.service";

import TopBar from "@/components/general/TopBar.vue";
import ProfileCard from "@/components/profile/ProfileCard.vue";
import { useMenuStore } from "@/store/menu.store";
import { Menu } from "@/draw/types/draw.types";

const router = useIonRouter();
const authStore = useAuthStore();
const postStore = usePostStore();
const { toast } = useToast();
const { openPostSwiper } = usePostSwiper();

const { user } = storeToRefs(authStore);
const { userPosts, hasMoreUserPosts, isProfileDirty } = storeToRefs(postStore);

const loadingAccount = ref(true);
const loadingPosts = ref(false);
const isEditing = ref(false);
const { openMenu } = useMenuStore();

const editForm = reactive({ name: "", description: "" });

const toggleEdit = async () => {
	if (isEditing.value) {
		const newName = editForm.name.trim();
		const newDesc = editForm.description.trim();
		const oldName = user.value?.name || "";
		const oldDesc = user.value?.description || "";

		// No-op if nothing changed — skip the API call and the success toast
		if (newName === oldName && newDesc === oldDesc) {
			isEditing.value = false;
			return;
		}

		// Don't allow saving an empty name (would create UX weirdness later)
		if (!newName) {
			toast("Name cannot be empty", { color: "danger" });
			return;
		}

		try {
			await updateProfile({ name: newName, description: newDesc });
			if (user.value) {
				if (newName !== oldName)
					user.value.last_name_change = new Date().toISOString();
				user.value.name = newName;
				user.value.description = newDesc;
			}
			toast("Profile updated!", { color: "success" });
			isEditing.value = false;
		} catch (err: any) {
			const errorMsg = err.response?.data?.error || "Failed to update profile";
			toast(errorMsg, { color: "danger" });
		}
	} else {
		editForm.name = user.value?.name || "";
		editForm.description = user.value?.description || "";
		isEditing.value = true;
	}
};

const handleImgUpdate = async (newImgBase64: string) => {
	if (!user.value) return;
	try {
		const blob = await fetch(newImgBase64).then((r) => r.blob());
		const res = await uploadProfileImg(blob, user.value.img);
		if (res.url) {
			user.value.img = res.url;
			toast("Profile picture updated!", { color: "success" });
		}
	} catch {
		toast("Failed to upload image", { color: "danger" });
	}
};

const loadPosts = async (reset = true) => {
	if (!user.value) return;
	loadingPosts.value = true;
	try {
		await postStore.getUserPosts(user.value._id, reset);
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

onIonViewDidEnter(() => {
	if (!user.value) return;
	loadingAccount.value = false;
	if (userPosts.value.length === 0 || isProfileDirty.value) loadPosts(true);
});

watch(
	user,
	(val) => {
		if (val) {
			loadingAccount.value = false;
			if (userPosts.value.length === 0) loadPosts(true);
		}
	},
	{ immediate: true },
);

const goToNetwork = (tab: string) =>
	router.push(`/network?tab=${tab}`, masterAnimation);
const goToSettings = () => router.push("/settings", masterAnimation);
const goToCustomize = () => router.push("/customize", masterAnimation);
const getTotalReactions = (counts?: Record<string, number>) =>
	Object.values(counts || {}).reduce((a, b) => a + b, 0);
const formatNumber = (n: number) =>
	n >= 1000 ? (n / 1000).toFixed(1) + "k" : n;
</script>

<style scoped>
@reference "@/theme/main.css";

.liquid-fade-enter-active,
.liquid-fade-leave-active {
  transition: all 0.5s cubic-bezier(0.16, 1, 0.3, 1);
}
.liquid-fade-enter-from {
  opacity: 0;
  transform: translateY(20px);
}
.liquid-fade-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}
</style>