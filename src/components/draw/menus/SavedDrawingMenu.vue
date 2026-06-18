<template>
  <BaseSheetModal
    :is-open="stickerMenuOpen"
    title="Saved Drawings"
    subtitle="Your personal sketch library"
    @close="onDismiss"
  >
    <template #header>
      <div class="flex justify-end items-center w-full px-2 mt-2 h-8">
        <transition name="fade">
          <ion-button
            v-if="combinedSaved.length > 0"
            @click="deleteMode = !deleteMode"
            fill="clear"
            :disabled="isLoading"
            :color="deleteMode ? 'danger' : 'secondary'"
            class="h-8 text-[11px] font-black uppercase tracking-widest bg-white/40 border border-white/50 backdrop-blur-md rounded-full shadow-sm"
          >
            <ion-icon :icon="svg(deleteMode ? mdiCancel : mdiDeleteOutline)" slot="start" class="mr-1.5 text-sm" />
            {{ deleteMode ? 'Done' : 'Manage' }}
          </ion-button>
        </transition>
      </div>
    </template>

    <div class="space-y-4 animate-fade-in pt-1 pb-4">
      <div class="bg-white/30 border border-white/50 rounded-[2.5rem] p-4 min-h-[45vh] max-h-[60vh] backdrop-blur-md shadow-inner relative flex flex-col mx-1">

        <transition name="fade">
          <div v-if="isLoading" class="absolute inset-0 flex flex-col items-center justify-center bg-white/40 backdrop-blur-sm z-20 rounded-[2.5rem]">
            <ion-spinner name="bubbles" color="secondary" class="scale-150 mb-4" />
            <span class="text-[10px] font-black tracking-widest uppercase opacity-50">Fetching Library...</span>
          </div>
        </transition>

        <transition name="fade">
          <div v-if="!isLoading && combinedSaved.length === 0" class="flex flex-col items-center justify-center flex-1 opacity-70 text-center px-6">
            <div class="w-16 h-16 bg-white/50 rounded-full flex items-center justify-center mb-4 shadow-sm">
              <ion-icon :icon="svg(mdiDrawPen)" class="text-3xl text-black/50" />
            </div>
            <h3 class="text-sm font-black uppercase tracking-widest mb-2">Your Library Is Empty</h3>
            <p class="text-[11px] font-bold leading-relaxed max-w-[240px] mx-auto">
              Saved Drawings are <span class="italic">reusable sketches</span> — stamps, characters, doodles — that you can drop onto any canvas, anytime.
            </p>
            <p class="text-[11px] font-bold leading-relaxed max-w-[240px] mx-auto mt-2 opacity-80 italic">
              Select an object while drawing and tap the save icon to stash it here.
            </p>
          </div>
        </transition>

        <div v-if="!isLoading && combinedSaved.length > 0" class="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 overflow-y-auto hide-scrollbar pb-2 pt-1 px-1">
          <div
            v-for="(saved, index) in combinedSaved"
            :key="saved._id || saved.drawing || index"
            class="relative aspect-square transition-transform active:scale-95"
          >
            <StickerEmblemSavedItem
              :img="saved.img"
              :delete-mode="deleteMode"
              class="w-full h-full shadow-sm rounded-2xl bg-white/60 border border-white"
              @click="handleSelect(saved)"
              @long-press="deleteMode = true"
              @cancel-delete="deleteMode = false"
            />
          </div>
        </div>
      </div>
    </div>
  </BaseSheetModal>
</template>

<script lang="ts" setup>
import { ref, computed, watch } from "vue";
import { IonButton, IonIcon, IonSpinner, alertController } from "@ionic/vue";
import { storeToRefs } from "pinia";
import { mdiCancel, mdiDeleteOutline, mdiDrawPen } from "@mdi/js";

import BaseSheetModal from "@/components/general/BaseSheetModal.vue";
import StickerEmblemSavedItem from "@/components/draw/menus/stickersEmblemsSavedMenu/StickerEmblemSavedItem.vue";

import { useAuthStore } from "@/store/auth.store";
import { useMenuStore } from "@/store/menu.store";
import { useDrawStore } from "@/draw/store/draw.store";
import { useToast } from "@/service/toast.service";

import { DrawAction } from "@/draw/types/draw.types";
import { svg } from "@/helper/general.helper";
import {
	fetchSavedDrawings,
	deleteSavedDrawing,
	deleteLegacySavedDrawing,
} from "@/service/api/savedDrawing.api";

// Stores
const { user } = storeToRefs(useAuthStore());
const { stickerMenuOpen } = storeToRefs(useMenuStore());
const drawStore = useDrawStore();
const { toast } = useToast();

// State
const isLoading = ref(false);
const deleteMode = ref(false);
const newSavedDrawings = ref<any[]>([]);

// Computed: Merge legacy (embedded in user) with new (from dedicated collection)
const combinedSaved = computed(() => {
	const legacy = user.value?.saved || [];
	return [...newSavedDrawings.value, ...legacy];
});

// Watcher: Fetch new collection lazily when the modal opens
watch(stickerMenuOpen, async (isOpen) => {
	if (isOpen && user.value?._id) {
		isLoading.value = true;
		deleteMode.value = false;
		try {
			newSavedDrawings.value = await fetchSavedDrawings(user.value._id);
		} catch (e) {
			console.error("Failed to fetch saved drawings:", e);
			toast("Could not sync latest drawings", { color: "warning" });
		} finally {
			isLoading.value = false;
		}
	} else {
		setTimeout(() => {
			deleteMode.value = false;
			newSavedDrawings.value = [];
		}, 300);
	}
});

function handleSelect(saved: any) {
	if (deleteMode.value) {
		confirmDelete(saved);
		return;
	}
	loadToCanvas(saved);
}

async function confirmDelete(saved: any) {
	const alert = await alertController.create({
		header: "Delete Drawing?",
		subHeader: "This can't be undone.",
		message: "Remove this drawing from your library?",
		cssClass: "liquid-alert",
		buttons: [
			{ text: "Cancel", role: "cancel", cssClass: "alert-button-cancel" },
			{
				text: "Delete",
				role: "destructive",
				cssClass: "alert-button-confirm",
				// Fire-and-forget: UI updates optimistically, alert dismisses instantly
				handler: () => {
					removeDrawing(saved);
				},
			},
		],
	});
	await alert.present();
}

async function removeDrawing(saved: any) {
	const isLegacy = !!user.value?.saved.find((o: any) => o._id === saved._id);

	// Snapshot for rollback
	const prevNew = [...newSavedDrawings.value];
	const prevLegacy = user.value?.saved ? [...user.value.saved] : [];

	// Optimistic removal
	if (isLegacy) {
		if (user.value) {
			user.value.saved = user.value.saved.filter(
				(item) => item.drawing !== saved.drawing,
			);
		}
	} else {
		newSavedDrawings.value = newSavedDrawings.value.filter(
			(d) => d._id !== saved._id,
		);
	}

	// Drop out of delete mode once the library empties
	if (combinedSaved.value.length === 0) {
		deleteMode.value = false;
	}

	// Persist (rollback on failure)
	try {
		if (isLegacy) {
			await deleteLegacySavedDrawing({
				user_id: user.value!._id,
				img_url: saved.img,
				drawing_url: saved.drawing,
			});
		} else {
			await deleteSavedDrawing(saved._id, user.value!._id);
		}
	} catch (e) {
		console.error("Failed to delete drawing", e);
		toast("Failed to delete drawing", { color: "danger" });
		// Rollback
		newSavedDrawings.value = prevNew;
		if (user.value) user.value.saved = prevLegacy;
	}
}

async function loadToCanvas(saved: any) {
	isLoading.value = true;
	try {
		const response = await fetch(saved.drawing);
		if (!response.ok) throw new Error("Failed to download drawing data");

		const drawingJson = await response.json();

		drawStore.selectAction(DrawAction.AddSavedDrawingToCanvas, {
			json: drawingJson,
		});

		onDismiss();
	} catch (error) {
		console.error("Error loading drawing:", error);
		toast("Failed to load drawing onto canvas", { color: "danger" });
	} finally {
		isLoading.value = false;
	}
}

function onDismiss() {
	stickerMenuOpen.value = false;
}
</script>

<style scoped>
.animate-fade-in {
  animation: fadeIn 0.3s cubic-bezier(0.1, 0.7, 0.1, 1);
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(15px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>