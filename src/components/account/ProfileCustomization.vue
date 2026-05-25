<template>
  <div class="w-full max-w-sm mx-auto flex flex-col items-center gap-6 pt-4 cabin-sketch-regular">

    <!-- Profile Picture Selector -->
    <div class="relative z-30">
      <ProfilePictureSelector
        :img="user!.img"
        :customization="user?.customization"
        @update:img="uploadImage"
      />
    </div>

    <!-- Edit Form -->
    <div class="w-full space-y-4 px-2">

      <!-- Name Input -->
      <div class="w-full rounded-[2.5rem] bg-white/70 border-2 border-white shadow-inner p-5 flex flex-col items-center justify-center relative transition-all duration-300">
        <div class="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-black/40 mb-2">
          <ion-icon :icon="svg(mdiAlertCircleOutline)" class="text-secondary" v-if="hasNameChanged" />
          Artist Name
        </div>
        <ion-input
          ref="nameRef"
          :value="editForm.name"
          @ionInput="editForm.name = ($event.target as HTMLInputElement).value"
          type="text"
          maxlength="30"
          minlength="4"
          placeholder="e.g. Skelur"
          class="w-full text-center text-2xl font-black text-black"
          @ionBlur="onBlur"
          @keyup.enter="onEnter"
          enterkeyhint="done"
          autocapitalize="sentences"
        />
      </div>

      <!-- Description Input -->
      <div class="w-full bg-white/60 border-2 border-white rounded-[2.5rem] shadow-inner overflow-hidden px-6">
        <ion-textarea
          :value="editForm.description"
          @ionInput="editForm.description = ($event.target as HTMLTextAreaElement).value"
          placeholder="Add a short bio or description..."
          maxlength="80"
          :auto-grow="true"
          rows="3"
          class="font-bold text-black italic text-base"
          @ionBlur="onBlur"
        />
      </div>

    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import { storeToRefs } from "pinia";
import { IonIcon, IonInput, IonTextarea } from "@ionic/vue";
import { mdiAlertCircleOutline } from "@mdi/js";

import { useAuthStore } from "@/store/auth.store";
import { useToast } from "@/service/toast.service";
import { updateProfile, uploadProfileImg } from "@/service/api/user.api";
import { svg } from "@/helper/general.helper";

import ProfilePictureSelector from "@/components/account/ProfilePictureSelector.vue";

const props = defineProps<{
	skipToast?: boolean;
}>();

const { user } = storeToRefs(useAuthStore());
const { toast } = useToast();

const nameRef = ref<HTMLInputElement>();

// Reactive form state
const editForm = reactive({
	name: user.value?.name || "",
	description: user.value?.description || "",
});

const hasNameChanged = computed(
	() => editForm.name.trim() !== (user.value?.name || ""),
);

async function saveProfile() {
	const newName = editForm.name.trim();
	const newDesc = editForm.description?.trim() || "";
	const oldName = user.value?.name || "";
	const oldDesc = user.value?.description || "";

	// 1. Validation
	if (!newName) {
		if (!props.skipToast) toast("Name cannot be empty", { color: "danger" });
		editForm.name = oldName;
		return;
	}

	if (newName.length < 4) {
		if (!props.skipToast)
			toast("Name must be at least 4 characters", { color: "danger" });
		editForm.name = oldName;
		return;
	}

	// 2. Prevent unnecessary API calls
	if (newName === oldName && newDesc === oldDesc) {
		return;
	}

	// 3. API Save
	try {
		await updateProfile({ name: newName, description: newDesc });

		if (user.value) {
			user.value.name = newName;
			user.value.description = newDesc;
		}

		if (!props.skipToast) toast("Profile updated!", { color: "success" });
	} catch (err: any) {
		const errorMsg = err.response?.data?.error || "Failed to update profile";
		if (!props.skipToast) toast(errorMsg, { color: "danger" });
	}
}

function onBlur() {
	saveProfile();
}

function onEnter() {
	// Trigger blur to force save
	(nameRef.value as any)?.blur();
}

async function uploadImage(newImgBase64: string) {
	if (!user.value) return;

	try {
		const blob = await fetch(newImgBase64).then((r) => r.blob());
		const res = await uploadProfileImg(blob, user.value.img);

		if (res.url) {
			user.value.img = res.url;
			if (!props.skipToast)
				toast("Profile picture updated!", { color: "success" });
		}
	} catch (error) {
		if (!props.skipToast) toast("Failed to upload image", { color: "danger" });
	}
}
</script>