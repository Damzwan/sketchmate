<template>
  <div class="bg-tertiary p-6 relative flex flex-col rounded-[2.25rem]">
    <!-- Minimal Close Button -->
    <ion-button fill="clear" class="absolute right-2 top-2 ion-no-margin z-30" @click="dismiss">
      <ion-icon slot="icon-only"
                class="text-black/60 hover:text-black text-xl transition-colors"
                :icon="svg(mdiClose)" />
    </ion-button>

    <!-- Header Section -->
    <div class="px-1 mb-5 select-none text-center">
      <h2 class="cabin-sketch-regular text-2xl font-black text-black tracking-tight">
        Report Artist
      </h2>
      <p v-if="reportableMembers.length > 0"
         class="text-sm text-black/70 uppercase  mt-0.5">
        Select an artist to flag for moderation
      </p>
    </div>

    <!-- Minimalist User List -->
    <div v-if="reportableMembers.length > 0"
         class="flex flex-col gap-2.5 max-h-[50vh] overflow-y-auto pr-1 hide-scrollbar">
      <div
        v-for="member in reportableMembers"
        :key="member._id"
        class="flex items-center justify-between p-3 bg-white/50 border border-black/10 rounded-[1.5rem] shadow-sm transition-all hover:border-secondary/20 active:scale-[0.98]"
      >
        <div class="flex items-center gap-3.5 min-w-0 flex-1">
          <div class="relative shrink-0 w-12 h-12 select-none">
            <UserAvatar
              :user="member"
              :customization="member.customization"
              size="sm"
              static
            />
          </div>
          <span class="font-black text-black text-base tracking-tight truncate flex-1">
            {{ member.name }}
          </span>
        </div>

        <ion-button
          size="small"
          color="danger"
          fill="clear"
          @click="handleReport(member)"
        >
          Report
        </ion-button>
      </div>
    </div>

    <!-- Thematic Empty State (Only You are in the Room) -->
    <div v-else class="flex flex-col items-center justify-center py-12 text-center select-none">
      <ion-icon :icon="peopleOutline" class="text-4xl mb-3 text-black/60" />
      <p class="cabin-sketch-regular text-lg font-black text-black leading-none mb-1">
        Nobody listed here yet
      </p>
      <p class="text-sm text-black/70 italic max-w-[220px] mx-auto mt-1">
        You can't report yourself. Looks like you're the only artist in this lobby!
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { IonButton, IonIcon, modalController } from "@ionic/vue";
import { mdiClose } from "@mdi/js";
import { peopleOutline } from "ionicons/icons";
import { storeToRefs } from "pinia";
import { computed } from "vue";

import UserAvatar from "@/components/profile/customization/UserAvatar.vue";
import { svg } from "@/helper/general.helper";
import { useAuthStore } from "@/store/auth.store";
import { useModerationStore } from "@/store/moderation.store";

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

/* Custom scroll hiding helper to match slider views */
.hide-scrollbar::-webkit-scrollbar {
  display: none;
}

.hide-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
</style>