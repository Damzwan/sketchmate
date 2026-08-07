<template>
  <ion-popover
    class="mgmt-more-popover"
    :is-open="isOpen"
    :event="event"
    side="bottom"
    alignment="start"
    :show-backdrop="false"
    @didDismiss="isOpen = false"
  >
    <ion-content>
      <div class="p-3 w-[230px] bg-tertiary">
        <div class="flex items-center gap-2">
          <ion-icon :icon="svg(saveIcon)" :class="saveIconClass" class="w-5 h-5" />
          <span class="text-lg font-black text-heading">{{ saveStatusText }}</span>
        </div>
        <p class="text-base text-black/80 mt-1 mb-3 cabin-sketch-regular leading-snug">
          Your drawing autosaves to this device every {{ AUTOSAVE_SECONDS }}s.
        </p>
        <ion-button
          @click="onSaveNow"
          shape="round"
          color="secondary"
          :disabled="!isDirty || isSaving || cooling"
        >
          {{ isSaving ? 'Saving…' : !isDirty ? 'All saved' : 'Save now' }}
        </ion-button>
      </div>
    </ion-content>
  </ion-popover>
</template>

<script setup lang="ts">
import { IonButton, IonContent, IonIcon, IonPopover } from "@ionic/vue";
import {
	mdiCloudCheckOutline,
	mdiCloudSyncOutline,
	mdiContentSaveEditOutline,
} from "@mdi/js";
import { storeToRefs } from "pinia";
import { computed, ref } from "vue";
import { useDocumentStore } from "@/draw/document/document.store";
import { svg } from "@/helper/general.helper";

const AUTOSAVE_SECONDS = 20;

const { isSaving, isDirty } = storeToRefs(useDocumentStore());
const { saveNow } = useDocumentStore();

const isOpen = ref(false);
const event = ref<Event | undefined>();
// Manual-save throttle so the button visibly disables between presses; the
// store enforces the hard floor and no-ops if a save is already running.
const cooling = ref(false);

const saveState = computed<"saving" | "dirty" | "saved">(() =>
	isSaving.value ? "saving" : isDirty.value ? "dirty" : "saved",
);
const saveIcon = computed(
	() =>
		({
			saving: mdiCloudSyncOutline,
			dirty: mdiContentSaveEditOutline,
			saved: mdiCloudCheckOutline,
		})[saveState.value],
);
const saveIconClass = computed(
	() =>
		({
			saving: "text-black/80",
			dirty: "text-amber-500",
			saved: "text-secondary",
		})[saveState.value],
);
const saveStatusText = computed(
	() =>
		({
			saving: "Saving…",
			dirty: "Unsaved changes",
			saved: "All changes saved",
		})[saveState.value],
);

function open(e: Event) {
	event.value = e;
	isOpen.value = true;
}

async function onSaveNow() {
	if (!isDirty.value || isSaving.value || cooling.value) return;
	cooling.value = true;
	setTimeout(() => (cooling.value = false), 3000);
	await saveNow();
}

defineExpose({ open });
</script>

<style scoped>
ion-popover {
  --width: auto;
}
</style>
