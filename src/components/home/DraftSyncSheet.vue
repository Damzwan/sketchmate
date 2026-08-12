<template>
  <BaseSheetModal
    :is-open="isOpen"
    title="Draft Backup"
    :subtitle="syncEnabled ? statusLine : 'Included with Pro'"
    @close="emit('close')"
  >
    <div class="space-y-4 pb-1">

      <!--
        One picture, one sentence. This sheet used to open with a status line,
        then repeat it as a subtitle, then list four icon meanings — three of
        which a Pro account never sees. What a user opening it wants to know is
        what backup DOES, and nothing else.
      -->
      <div class="flex flex-col items-center text-center gap-3">
        <div class="w-20 h-20 bg-secondary/10 rounded-[1.75rem] flex items-center justify-center rotate-[-5deg]">
          <ion-icon
            :icon="svg(syncEnabled ? mdiCloudCheckOutline : mdiCloudSyncOutline)"
            class="text-4xl text-secondary"
          />
        </div>
        <p class="text-[15px] text-black/70 leading-relaxed max-w-[280px]">
          <template v-if="syncEnabled">
            Your drafts save to your account automatically, so you can pick any
            of them up on your other devices.
          </template>
          <template v-else>
            Your drafts live on this device only.
            <span class="font-black text-black/85">Pro backs them up</span>
            and opens them on all your devices.
          </template>
        </p>
      </div>

      <!-- The only number worth showing, and only once there is a real cap. -->
      <p
        v-if="syncEnabled && limit > 0"
        class="text-[11px] font-black uppercase tracking-widest text-black/40 text-center"
      >
        {{ used }} of {{ limit }} drafts backed up
      </p>
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
import { alertController, IonButton, IonIcon } from "@ionic/vue";
import { mdiCloudCheckOutline, mdiCloudSyncOutline } from "@mdi/js";
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

/** Carried by the subtitle, so the body never has to repeat the state. */
const statusLine = computed(() => {
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
</script>
