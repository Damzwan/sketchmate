<template>
  <div class="w-full flex justify-center items-center pt-4">
    <ProfilePictureSelector
      :img="user!.img"
      @update:img="uploadImage"
    />
  </div>

  <div class="w-full justify-center flex pt-6">
    <ion-input
      ref="nameRef"
      v-model="name"
      class="w-1/2 max-w-xs"
      color="secondary"
      helperText="Name"
      type="text"
      :maxlength="30"
      fill="outline"
      placeholder="e.g. Skelur"
      @ionBlur="onNameBlur"
      @keyup.enter="onEnter"
      enterkeyhint="done"
      autocapitalize="sentences"
    ></ion-input>
  </div>
</template>

<script setup lang="ts">
import ProfilePictureSelector from "@/components/account/ProfilePictureSelector.vue";
import { IonInput } from "@ionic/vue";
import { storeToRefs } from "pinia";
import { useAuthStore } from "@/store/auth.store";
import { ref } from "vue";
import { useToast } from "@/service/toast.service";
import { blurIonInput } from "@/helper/general.helper";
import { EventBus } from "@/main";
import { changeUserName, uploadProfileImg } from "@/service/api/user.api";

const props = defineProps<{
	skipToast?: boolean;
}>();

const { user } = storeToRefs(useAuthStore());
const { toast } = useToast();

const name = ref(user.value!.name);
const nameRef = ref<HTMLIonInputElement>();

function changeName() {
	changeUserName({
		_id: user.value!._id,
		name: name.value,
	});
	user.value!.name = name.value;
	if (!props.skipToast) toast("Changed name", { color: "success" });
}

function onNameBlur() {
	if (name.value !== "" && name.value !== user.value?.name) {
		changeName();
	} else {
		name.value = user.value!.name;
	}
}

function onEnter() {
	blurIonInput(nameRef.value);
}

async function uploadImage(newImgBase64: string) {
	if (!user.value) return;

	try {
		const blob = await fetch(newImgBase64).then((r) => r.blob());
		const res = await uploadProfileImg(blob, user.value.img);

		if (res.url) {
			user.value.img = res.url;
			if (!props.skipToast)
				toast("Changed profile picture", { color: "success" });
		}
	} catch (error) {
		toast("Failed to upload image", { color: "danger" });
		console.error("Profile picture upload failed:", error);
	}
}

EventBus.on("reset-name", () => (name.value = user.value!.name)); // TODO sketchy, remove this
</script>

<style scoped>
</style>