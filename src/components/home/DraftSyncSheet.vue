<template>
  <BaseSheetModal
    :is-open="isOpen"
    :title="syncEnabled ? 'Draft Backup' : 'Back Up Your Drafts'"
    :subtitle="syncEnabled ? statusSubtitle : 'Included with Pro'"
    @close="emit('close')"
  >
    <div class="space-y-5 pb-1">

      <!-- The pitch. Free accounts only: Pro users already know what they bought. -->
      <div v-if="!syncEnabled" class="flex flex-col items-center text-center gap-3">
        <div class="w-20 h-20 bg-secondary/10 rounded-[1.75rem] flex items-center justify-center rotate-[-5deg]">
          <ion-icon :icon="svg(mdiCloudSyncOutline)" class="text-4xl text-secondary" />
        </div>
        <p class="text-[15px] text-black/60 leading-relaxed max-w-[260px]">
          Your drafts live on this phone only.
          <span class="font-black text-black/80">Pro backs them up</span>
          and opens them on all your devices.
        </p>
      </div>

      <!-- Icon legend. This is the whole reason the sheet is tappable from the
           badges: a cloud glyph on a card means nothing until it's named. -->
      <div class="rounded-[1.5rem] bg-tertiary border border-primary/30 divide-y divide-black/5">
        <div
          v-for="entry in legend"
          :key="entry.label"
          class="flex items-center gap-3 p-3"
          :class="{ 'opacity-45': !syncEnabled && entry.proOnly }"
        >
          <div class="shrink-0 rounded-full bg-white/90 p-1.5 border border-black/5">
            <!-- In-progress states read as motion, not as another cloud glyph. -->
            <ion-spinner
              v-if="entry.busy"
              name="dots"
              class="w-3.5 h-3.5 text-secondary block"
            />
            <ion-icon
              v-else
              :icon="svg(entry.icon)"
              class="text-sm block"
              :class="entry.accent ? 'text-secondary' : 'text-black/45'"
            />
          </div>
          <h3 class="text-[13px] font-black text-black tracking-tight leading-tight">
            {{ entry.label }}
          </h3>
        </div>
      </div>

      <div
        v-if="syncEnabled && limit > 0"
        class="text-[11px] font-black uppercase tracking-widest text-black/40 text-center"
      >
        {{ used }} of {{ limit }} drafts backed up
      </div>
    </div>

    <template v-if="!syncEnabled || isDev" #footer>
      <ion-button
        v-if="!syncEnabled"
        expand="block"
        color="secondary"
        shape="round"
        @click="emit('upgrade')"
      >
        Get Pro
      </ion-button>

      <!--
        Dev only. Wipes the device's drafts so the cloud-restore path can be
        exercised without reinstalling and losing the signed-in session.
      -->
      <ion-button
        v-if="isDev"
        fill="clear"
        color="danger"
        expand="block"
        size="small"
        @click="confirmWipe"
      >
        Dev · wipe local drafts
      </ion-button>
    </template>
  </BaseSheetModal>
</template>

<script setup lang="ts">
import { alertController, IonButton, IonIcon, IonSpinner } from "@ionic/vue";
import {
	mdiCloudCheckOutline,
	mdiCloudDownloadOutline,
	mdiCloudOffOutline,
	mdiCloudSyncOutline,
	mdiCloudUploadOutline,
} from "@mdi/js";
import { computed } from "vue";
import BaseSheetModal from "@/components/general/BaseSheetModal.vue";
import { svg } from "@/helper/general.helper";
import type { DraftSyncStatus } from "@/store/draftSync.store";

const props = defineProps<{
	isOpen: boolean;
	syncEnabled: boolean;
	syncStatus: DraftSyncStatus;
	used: number;
	limit: number;
}>();

const emit = defineEmits<{
	(e: "close"): void;
	(e: "upgrade"): void;
	(e: "wipe"): void;
}>();

const isDev = import.meta.env.DEV;

async function confirmWipe() {
	const alert = await alertController.create({
		header: "Wipe local drafts?",
		message:
			"Deletes every draft stored on this device. Cloud backups are left alone.",
		buttons: [
			{ text: "Cancel", role: "cancel" },
			{ text: "Wipe", role: "destructive", handler: () => emit("wipe") },
		],
	});
	await alert.present();
}

const statusSubtitle = computed(() => {
	switch (props.syncStatus) {
		case "syncing":
			return "Backing up now";
		case "offline":
			return "Offline — will resume";
		case "error":
			return "Retrying shortly";
		default:
			return "Everything is backed up";
	}
});

const legend = [
	{
		icon: mdiCloudCheckOutline,
		accent: true,
		busy: false,
		proOnly: true,
		label: "Backed up",
	},
	{
		icon: mdiCloudUploadOutline,
		accent: false,
		busy: true,
		proOnly: true,
		label: "Backing up…",
	},
	{
		icon: mdiCloudDownloadOutline,
		accent: false,
		busy: false,
		proOnly: true,
		label: "Tap to download",
	},
	{
		icon: mdiCloudOffOutline,
		accent: false,
		busy: false,
		proOnly: false,
		label: "This device only",
	},
];
</script>
