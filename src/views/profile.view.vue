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
            :preview-img="displayImg"
            :edit-form="editForm"
            @toggle-edit="toggleEdit"
            @go-settings="goToSettings"
            @go-customize="goToCustomize"
            @update-img="handleImgUpdate"
            @go-network="goToNetwork"
            @cancel-edit="cancelEdit"
            @open-connection="openMenu(Menu.ConnectionMenu)"
            @update:edit-form-name="(newName: string) => editForm.name = newName"
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
import { computed, reactive, ref } from "vue";
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
const isSaving = ref(false);
const { openMenu } = useMenuStore();

const editForm = reactive({ name: "", description: "" });

// Staged image while editing. null = no pending change (show the real user.img).
// A non-null value is the cropped base64 awaiting confirmation.
const pendingImg = ref<string | null>(null);

// What the avatar shows in edit mode: the staged crop if present, else current.
const displayImg = computed(() => pendingImg.value ?? user.value?.img ?? "");

// Cropper applied — just stage it. No upload, no store mutation yet.
const handleImgUpdate = (newImgBase64: string) => {
	pendingImg.value = newImgBase64;
};

const enterEdit = () => {
	editForm.name = user.value?.name || "";
	editForm.description = user.value?.description || "";
	pendingImg.value = null;
	isEditing.value = true;
};

const cancelEdit = () => {
	// Drop the staged image — preview reverts to the real user.img.
	pendingImg.value = null;
	isEditing.value = false;
};

const saveEdit = () => {
	if (!user.value) return;

	const newName = editForm.name.trim();
	const newDesc = editForm.description.trim();
	const oldName = user.value.name || "";
	const oldDesc = user.value.description || "";

	const nameChanged = newName !== oldName;
	const descChanged = newDesc !== oldDesc;
	const imgChanged = pendingImg.value !== null;

	// Nothing to do.
	if (!nameChanged && !descChanged && !imgChanged) {
		isEditing.value = false;
		return;
	}

	// Validate name only if it actually changed. (Stays synchronous — we want
	// to block the close on bad input, not on the network.)
	if (nameChanged) {
		if (!newName) {
			toast("Name cannot be empty", { color: "danger" });
			return;
		}
		if (newName.length < 4) {
			toast("Name should be at least 4 characters", { color: "danger" });
			return;
		}
	}

	// --- Snapshot everything the background task needs BEFORE we mutate/clear. ---
	const u = user.value;
	const previousImg = u.img;
	const previousName = oldName;
	const previousDesc = oldDesc;
	const previousNameChange = u.last_name_change;
	const stagedImg = imgChanged ? pendingImg.value : null;

	// --- Apply ALL changes optimistically + close edit mode RIGHT NOW. ---
	if (nameChanged) {
		u.last_name_change = new Date().toISOString();
		u.name = newName;
	}
	if (descChanged) u.description = newDesc;
	if (stagedImg) u.img = stagedImg; // store watcher → tab bar updates this tick

	pendingImg.value = null;
	isEditing.value = false; // ← UI exits edit mode immediately, no lag

	// --- Reconcile in the background. No await in the handler's main path. ---
	void persistProfile({
		nameChanged,
		descChanged,
		newName,
		newDesc,
		stagedImg,
		previousImg,
		previousName,
		previousDesc,
		previousNameChange,
	});
};

interface PersistArgs {
	nameChanged: boolean;
	descChanged: boolean;
	newName: string;
	newDesc: string;
	stagedImg: string | null;
	previousImg: string;
	previousName: string;
	previousDesc: string;
	previousNameChange: string | undefined;
}

const persistProfile = async (a: PersistArgs) => {
	if (!user.value) return;
	const u = user.value;

	const tasks: Promise<unknown>[] = [];

	if (a.nameChanged || a.descChanged) {
		tasks.push(updateProfile({ name: a.newName, description: a.newDesc }));
	}

	let uploadPromise: Promise<{ url?: string }> | null = null;
	if (a.stagedImg) {
		const staged = a.stagedImg;
		uploadPromise = fetch(staged)
			.then((r) => r.blob())
			.then((blob) => uploadProfileImg(blob, a.previousImg));
		tasks.push(uploadPromise);
	}

	try {
		await Promise.all(tasks);

		// Reconcile optimistic base64 → canonical S3 URL.
		if (uploadPromise) {
			const res = await uploadPromise;
			// Only swap if the user hasn't changed their image again in the meantime.
			if (res.url && u.img === a.stagedImg) {
				u.img = res.url;
			} else if (!res.url) {
				if (u.img === a.stagedImg) u.img = a.previousImg;
				toast("Failed to upload image", { color: "danger" });
			}
		}
	} catch (err: any) {
		// Roll back whatever we optimistically applied — but only if it's still
		// the value we set (guards against a newer edit racing this one).
		if (a.stagedImg && u.img === a.stagedImg) u.img = a.previousImg;
		if (a.nameChanged && u.name === a.newName) {
			u.name = a.previousName;
			u.last_name_change = a.previousNameChange;
		}
		if (a.descChanged && u.description === a.newDesc) {
			u.description = a.previousDesc;
		}
		const errorMsg = err?.response?.data?.error || "Failed to update profile";
		toast(errorMsg, { color: "danger" });
	}
};

// ProfileCard's single toggle button routes to enter vs save.
const toggleEdit = () => {
	if (isEditing.value) saveEdit();
	else enterEdit();
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