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

          <!-- Extracted Posts Component -->
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
import { reactive, ref } from "vue";
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
import { updateProfile, uploadProfileImg } from "@/service/api/user.api";
import { useToast } from "@/service/toast.service";

import TopBar from "@/components/general/TopBar.vue";
import ProfileCard from "@/components/profile/ProfileCard.vue";
import ProfilePost from "@/components/profile/ProfilePost.vue";
import { useMenuStore } from "@/store/menu.store";
import { Menu } from "@/draw/types/draw.types";

const router = useIonRouter();
const authStore = useAuthStore();
const postStore = usePostStore();
const { toast } = useToast();

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

		if (newName === oldName && newDesc === oldDesc) {
			isEditing.value = false;
			return;
		}
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

<style scoped>

</style>