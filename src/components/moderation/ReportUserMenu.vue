<template>
  <div class="bg-[var(--ion-color-tertiary)] p-6 relative flex flex-col rounded-[2.25rem]">
    <!-- Minimal Close Button -->
    <ion-button fill="clear" class="absolute right-2 top-2 ion-no-margin z-30" @click="dismiss">
      <ion-icon slot="icon-only" class="text-[var(--ion-color-dark)]/40 hover:text-[var(--ion-color-dark)] text-xl transition-colors" :icon="svg(mdiClose)" />
    </ion-button>

    <!-- Header Section -->
    <div class="px-1 mb-5 select-none text-center">
      <h2 class="cabin-sketch-regular text-2xl font-black text-[var(--ion-color-dark)] tracking-tight">
        Report Artist
      </h2>
      <p v-if="reportableMembers.length > 0" class="text-[10px] font-black text-[var(--ion-color-dark)]/40 uppercase tracking-widest mt-0.5">
        Select an artist to flag for moderation
      </p>
    </div>

    <!-- Minimalist User List -->
    <div v-if="reportableMembers.length > 0" class="flex flex-col gap-2.5 max-h-[50vh] overflow-y-auto pr-1 hide-scrollbar">
      <div
        v-for="member in reportableMembers"
        :key="member._id"
        class="flex items-center justify-between p-3 bg-white/50 border border-[var(--ion-color-dark)]/10 rounded-[1.5rem] shadow-sm transition-all hover:border-[var(--ion-color-secondary)]/20 active:scale-[0.98]"
      >
        <div class="flex items-center gap-3.5 min-w-0">
          <div class="relative shrink-0 w-11 h-11 flex items-center justify-center select-none">
            <UserAvatar
              :user="member"
              :customization="member.customization"
              size="sm"
              static
            />
          </div>
          <span class="font-black text-[var(--ion-color-dark)] text-base tracking-tight truncate max-w-[140px]">
            {{ member.name }}
          </span>
        </div>

        <ion-button
          size="small"
          color="danger"
          fill="solid"
          class="font-black uppercase text-[10px] tracking-widest ion-no-margin h-9 rounded-xl px-2"
          @click="handleReport(member)"
        >
          Report
        </ion-button>
      </div>
    </div>

    <!-- Thematic Empty State (Only You are in the Room) -->
    <div v-else class="flex flex-col items-center justify-center py-12 text-center select-none">
      <ion-icon :icon="peopleOutline" class="text-4xl text-[var(--ion-color-dark)]/10 mb-3" />
      <p class="cabin-sketch-regular text-lg font-black text-[var(--ion-color-dark)]/40 leading-none mb-1">
        Nobody listed here yet
      </p>
      <p class="text-[11px] font-bold text-[var(--ion-color-dark)]/50 italic max-w-[220px] mx-auto mt-1">
        You can't report yourself. Looks like you're the only artist in this lobby!
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { IonButton, IonIcon, modalController } from "@ionic/vue";
import { mdiClose } from "@mdi/js";
import { peopleOutline } from "ionicons/icons";
import { storeToRefs } from "pinia";

import UserAvatar from "@/components/profile/customization/UserAvatar.vue";
import { useModerationStore } from "@/store/moderation.store";
import { useAuthStore } from "@/store/auth.store";
import { svg } from "@/helper/general.helper";

const props = defineProps<{ roomMembers: any[] }>();

const { user } = storeToRefs(useAuthStore());

// Filter out your own profile from the actionable report queue
const reportableMembers = computed(() => {
	if (!props.roomMembers) return [];
	return props.roomMembers.filter((member) => member._id !== user.value?._id);
});

const handleReport = (member: any) => {
	useModerationStore().openReport({
		type: "user",
		id: member._id,
		label: member.name,
	});
	dismiss();
};

const dismiss = () => modalController.dismiss();
</script>

<style scoped>
.cabin-sketch-regular {
  font-family: var(--ion-font-family, "Cabin Sketch", cursive);
}

/* Custom scroll hiding helper to match slider views */
.hide-scrollbar::-webkit-scrollbar {
  display: none;
}
.hide-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
</style>