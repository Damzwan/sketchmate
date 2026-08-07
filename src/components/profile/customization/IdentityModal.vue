<template>
  <BaseSheetModal
    :is-open="isOpen"
    title="Identity"
    subtitle="Update your public profile"
    @close="handleDismiss"
  >
    <div class="flex flex-col items-center">
      <ProfilePictureSelector
        :img="displayImg"
        :customization="customization"
        @update:img="uploadImage"
        class="mb-6"
      />

      <div class="w-full mb-4">
        <div class="flex justify-between items-center px-2 mb-1.5 text-xs font-bold uppercase tracking-widest">
          <span class="text-black/80">Artist Name</span>
        </div>
        <ion-input
          type="text"
          color="secondary"
          :counter="true"
          v-model="localName"
          placeholder="Artist Name"
          :minlength="4"
          :maxlength="40"
          :readonly="nameLocked"
          class="w-full text-center text-2xl font-bold text-black bg-tertiary border border-primary/40 rounded-[1.5rem] px-4"
          :class="{ 'opacity-60': nameLocked }"
        />

        <!-- One-time rename notice -->
        <div class="px-2 mt-2 flex items-start gap-1.5 text-xs leading-snug">
          <ion-icon
            :icon="nameLocked ? svg(mdiLockClock) : svg(mdiInformationOutline)"
            class="text-sm shrink-0 mt-px"
            :class="nameLocked ? 'text-amber-600' : 'text-black/40'"
          />
          <span v-if="nameLocked" class="font-bold text-amber-700">
            Your name is locked — it can't be changed anymore.
          </span>
          <span v-else class="text-black/70">
            Choose carefully — you can change your name only once.
          </span>
        </div>
      </div>

      <div class="w-full">
        <span class="px-2 mb-1.5 block text-xs font-bold uppercase tracking-widest text-black/80">Bio</span>
        <ion-textarea
          v-model="localDesc"
          color="secondary"
          placeholder="Add a short bio or description..."
          :counter="true"
          :maxlength="80"
          :auto-grow="true"
          :rows="3"
          class="text-black italic text-lg bg-tertiary border border-primary/40 rounded-[1.5rem] px-4"
        />
      </div>
    </div>

    <template #footer>
      <ion-button
        expand="block"
        color="secondary"
        shape="round"
        size="large"
        @click="confirm"
      >
        Apply Identity
      </ion-button>
    </template>
  </BaseSheetModal>
</template>

<script setup lang="ts">
import { IonButton, IonIcon, IonInput, IonTextarea } from "@ionic/vue";
import { mdiInformationOutline, mdiLockClock } from "@mdi/js";
import { computed, ref, watch } from "vue";
import ProfilePictureSelector from "@/components/account/ProfilePictureSelector.vue";
import BaseSheetModal from "@/components/general/BaseSheetModal.vue";
import { useProfileUpload } from "@/composables/general/useProfileUpload";
import { type Customization } from "@/config/profile_options.config";
import { svg } from "@/helper/general.helper";
import { useSubscriptionStore } from "@/store/subscription.store";

const props = defineProps<{
	isOpen: boolean;
	user: any;
	customization: Partial<Customization>;
	initialName: string;
	initialDesc: string;
	previewImg: string | null;
}>();

const emit = defineEmits(["close", "save"]);

const localName = ref(props.initialName);
const localDesc = ref(props.initialDesc);
const localImg = ref<string | null>(null);

const displayImg = computed(
	() => localImg.value ?? props.previewImg ?? props.user.img,
);

// One-time rename lock. The signup name (from the default 'Anonymous') is free;
// the first real rename stamps `last_name_change` server-side, which locks it.
// Pro/Lifetime are exempt. `last_name_change` present ⇒ the one edit was used.
const subStore = useSubscriptionStore();
const nameLocked = computed(
	() => !subStore.isPro && Boolean(props.user?.last_name_change),
);

watch(
	() => props.isOpen,
	(open) => {
		if (open) {
			localName.value = props.initialName;
			localDesc.value = props.initialDesc;
			localImg.value = null;
		}
	},
);

const { uploadImage } = useProfileUpload();

const confirm = () => {
	emit("save", {
		// While locked, never submit a changed name (the input is read-only, but
		// guard here too so the cooldown can't be bypassed).
		name: (nameLocked.value ? props.initialName : localName.value).trim(),
		description: localDesc.value.trim(),
		img: localImg.value,
	});
};

const handleDismiss = () => emit("close");
</script>

<style scoped>
ion-input {
  --padding-end: 10px;
}
</style>