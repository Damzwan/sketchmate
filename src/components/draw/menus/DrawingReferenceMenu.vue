<template>
  <!-- Not `scrollable`: that pins the sheet at full height, so an empty or
       one-image list opened as a full-screen panel. Auto height grows with the
       rows and the inner scroller takes over at the 95vh cap. -->
  <BaseSheetModal
    :is-open="referenceMenuOpen"
    @close="closeMenu(Menu.Reference)"
  >
    <template #header>
      <h1 class="reference-sheet-title cabin-sketch-regular">References</h1>
    </template>
    <input
      ref="fileInput"
      type="file"
      accept="image/*"
      multiple
      class="hidden"
      @change="onFilesSelected"
    />

    <div class="space-y-3 pb-3">
      <section class="reference-actions">
        <!-- At the TIER limit the button sells the upgrade instead of sitting
             disabled; at the hard cap there is nothing to sell, so it disables.
             Same contract as the layer sheet. -->
        <ion-button
          expand="block"
          :color="atTierLimit ? 'warning' : 'secondary'"
          class="add-reference-button"
          :disabled="isAdding || (!canAddReference && !atTierLimit)"
          @click="atTierLimit ? upgrade() : fileInput?.click()"
        >
          <ion-spinner v-if="isAdding" name="crescent" slot="start" />
          <ion-icon v-else :icon="svg(atTierLimit ? mdiStar : mdiImagePlusOutline)" slot="start" />
          {{ isAdding ? 'Preparing…' : atTierLimit ? 'More references' : 'Add reference images' }}
        </ion-button>

        <p class="reference-quota">
          {{ localCount }} of {{ maxReferences }} references used<span v-if="atTierLimit">
            · Pro gets {{ maxPro }}</span>
        </p>

        <label v-if="inRoom" class="share-new-row">
          <span>Share new images</span>
          <ion-toggle v-model="shareNewReferences" color="secondary" />
        </label>
      </section>

      <div v-if="references.length === 0" class="empty-references">
        <ion-icon :icon="svg(mdiImageMultipleOutline)" />
        <strong>Add an image to draw from</strong>
      </div>

      <section
        v-for="reference in references"
        :key="reference.id"
        class="reference-row"
      >
        <img
          :src="reference.dataUrl"
          :alt="reference.name"
          :style="{ transform: reference.flipped ? 'scaleX(-1)' : undefined }"
          decoding="async"
        />

        <div class="min-w-0 flex-1">
          <div class="flex items-start gap-2">
            <div class="min-w-0 flex-1">
              <strong class="block truncate text-xs">{{ reference.name }}</strong>
              <span class="reference-owner">
                {{ reference.isLocal ? 'Yours' : ownerName(reference.ownerId) }}
              </span>
            </div>
            <label v-if="reference.isLocal && inRoom" class="room-toggle" aria-label="Share with room">
              <span>Room</span>
              <ion-toggle
                :checked="reference.shared"
                color="secondary"
                @ionChange="setShared(reference.id, $event.detail.checked)"
              />
            </label>
            <span v-else-if="reference.shared" class="shared-badge">Room</span>
          </div>

          <div class="opacity-control">
            <ion-icon :icon="svg(mdiOpacity)" />
            <ion-range
              :value="reference.opacity * 100"
              :min="15"
              :max="100"
              :step="1"
              color="secondary"
              aria-label="Reference opacity"
              @ionInput="setOpacity(reference.id, $event)"
            />
            <span>{{ Math.round(reference.opacity * 100) }}%</span>
          </div>

          <div class="reference-controls">
            <ion-button
              size="small"
              fill="clear"
              color="dark"
              aria-label="Flip reference horizontally"
              @click="referencesStore.updateAppearance(reference.id, { flipped: !reference.flipped })"
            >
              <ion-icon :icon="svg(mdiFlipHorizontal)" slot="icon-only" />
            </ion-button>
            <ion-button
              size="small"
              fill="clear"
              color="dark"
              :aria-label="reference.hidden ? 'Show reference' : 'Hide reference'"
              @click="referencesStore.updateAppearance(reference.id, { hidden: !reference.hidden })"
            >
              <ion-icon :icon="svg(reference.hidden ? mdiEyeOutline : mdiEyeOffOutline)" slot="icon-only" />
            </ion-button>
            <!-- Owner: removes it for the room. Everyone else: removes it for
                 THEMSELVES, permanently — no confirm, and no waiting on the
                 owner or on a moderator. Someone who just got an unwanted image
                 pushed at them gets it off their screen in one tap. -->
            <ion-button
              size="small"
              fill="clear"
              color="danger"
              :aria-label="reference.isLocal ? 'Remove reference' : 'Remove for me'"
              @click="removeReference(reference)"
            >
              <!-- Same delete icon for both: the eye-with-a-slash variant read
                   as another hide toggle sitting next to the actual one. -->
              <ion-icon :icon="svg(mdiDeleteOutline)" slot="icon-only" />
            </ion-button>
            <ion-button
              v-if="!reference.isLocal"
              size="small"
              fill="clear"
              color="dark"
              aria-label="Report reference"
              @click="reportReference(reference)"
            >
              <ion-icon :icon="svg(mdiFlagOutline)" slot="icon-only" />
            </ion-button>
          </div>
        </div>
      </section>

      <p class="reference-note">
        References are not included in your finished drawing.
      </p>
    </div>
  </BaseSheetModal>
</template>

<script setup lang="ts">
import {
	IonButton,
	IonIcon,
	IonRange,
	IonSpinner,
	IonToggle,
} from "@ionic/vue";
import {
	mdiDeleteOutline,
	mdiEyeOffOutline,
	mdiEyeOutline,
	mdiFlagOutline,
	mdiFlipHorizontal,
	mdiImageMultipleOutline,
	mdiImagePlusOutline,
	mdiOpacity,
	mdiStar,
} from "@mdi/js";
import { storeToRefs } from "pinia";
import { computed, ref, watch } from "vue";
import BaseSheetModal from "@/components/general/BaseSheetModal.vue";
import { useConfirm } from "@/composables/useConfirm";
import {
	type DrawingReference,
	MAX_DRAWING_REFERENCES,
	useDrawingReferenceStore,
} from "@/draw/references/reference.store";
import { useDrawSyncer } from "@/draw/sync/session.store";
import { svg } from "@/helper/general.helper";
import { useToast } from "@/service/toast.service";
import { useMenuStore } from "@/store/menu.store";
import { useModerationStore } from "@/store/moderation.store";
import { useSubscriptionStore } from "@/store/subscription.store";
import { Menu } from "@/types/menu.types";

const menuStore = useMenuStore();
const { closeMenu } = menuStore;
const { referenceMenuOpen } = storeToRefs(menuStore);
const drawSyncer = useDrawSyncer();
const { roomId, roomMembers } = storeToRefs(drawSyncer);
const referencesStore = useDrawingReferenceStore();
const { references, localCount, maxReferences, canAddReference, atTierLimit } =
	storeToRefs(referencesStore);
const maxPro = MAX_DRAWING_REFERENCES;
const fileInput = ref<HTMLInputElement>();
const isAdding = ref(false);
const shareNewReferences = ref(true);
const inRoom = computed(() => !!roomId.value);
const { confirm } = useConfirm();

watch(inRoom, (active) => {
	shareNewReferences.value = active;
});

function reportReference(reference: DrawingReference) {
	closeMenu(Menu.Reference);
	useModerationStore().openReport({
		type: "lobby_reference",
		id: reference.id,
		blockUserId: reference.ownerId,
		// The image lives in the room, not in any database.
		contextRoomId: roomId.value,
	});
}

function upgrade() {
	closeMenu(Menu.Reference);
	useSubscriptionStore().openPaywall();
}

function ownerName(ownerId: string) {
	return (
		roomMembers.value.find((member) => String(member._id) === ownerId)?.name ??
		"another artist"
	);
}

async function onFilesSelected(event: Event) {
	const input = event.target as HTMLInputElement;
	const files = Array.from(input.files ?? []);
	input.value = "";
	if (files.length === 0) return;

	isAdding.value = true;
	try {
		await referencesStore.addFiles(
			files,
			inRoom.value && shareNewReferences.value,
		);
	} catch (error) {
		console.error("Failed to add drawing reference", error);
		void useToast().toast(
			error instanceof Error ? error.message : "Reference could not be added",
			{ color: "warning" },
		);
	} finally {
		isAdding.value = false;
	}
}

function setOpacity(id: string, event: CustomEvent) {
	const value = Number(event.detail.value);
	if (!Number.isFinite(value)) return;
	referencesStore.updateAppearance(id, { opacity: value / 100 });
}

function setShared(id: string, shared: boolean) {
	referencesStore.setShared(id, shared);
}

async function removeReference(reference: DrawingReference) {
	// A peer's image is removed for YOU only — same confirm dialog as every
	// other destructive action in the app, different copy about the scope.
	const confirmed = await confirm({
		header: "Remove reference?",
		subHeader: !reference.isLocal
			? "It stays visible for everyone else in the room."
			: reference.shared
				? "It will also disappear for everyone in the room."
				: undefined,
		message: "This reference cannot be restored after removal.",
		confirmText: "Remove",
		destructive: true,
	});
	if (!confirmed) return;

	if (reference.isLocal) referencesStore.remove(reference.id);
	else referencesStore.dismiss(reference.id);
}
</script>

<style scoped>
.reference-sheet-title {
  color: var(--ion-color-dark);
  font-size: 2.25rem;
  font-style: italic;
  font-weight: 900;
  line-height: 1;
  letter-spacing: -0.05em;
}

.reference-actions {
  padding: 2px;
}

.reference-quota {
  padding: 6px 8px 0;
  color: var(--ion-color-dark);
  font-size: 10px;
  font-weight: 800;
  text-align: center;
  opacity: 0.66;
}

.share-new-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 8px;
  padding: 6px 8px 0;
  color: var(--ion-color-dark);
  font-size: 11px;
  font-weight: 900;
}

.add-reference-button {
  --border-radius: 14px;
  min-height: 44px;
  margin: 0;
  font-size: 12px;
  font-weight: 900;
  cursor: pointer;
}

.empty-references {
  display: flex;
  min-height: 150px;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  border: 1px dashed rgb(0 0 0 / 25%);
  border-radius: 22px;
  padding: 20px;
  color: var(--ion-color-dark);
  text-align: center;
}

.empty-references ion-icon {
  margin-bottom: 8px;
  font-size: 38px;
  opacity: 0.55;
}

.empty-references strong {
  font-size: 12px;
}

.reference-row {
  display: flex;
  gap: 12px;
  border: 1px solid rgb(0 0 0 / 12%);
  border-radius: 22px;
  padding: 12px;
  background: rgb(0 0 0 / 3%);
}

.reference-row > img {
  width: 68px;
  height: 68px;
  flex: none;
  border: 1px solid rgb(0 0 0 / 18%);
  border-radius: 14px;
  background: transparent;
  object-fit: cover;
  transform-origin: center;
}

.reference-owner {
  display: block;
  margin-top: 2px;
  color: var(--ion-color-dark);
  font-size: 9px;
  font-weight: 800;
  opacity: 0.72;
}

.room-toggle {
  display: flex;
  flex: none;
  align-items: center;
  gap: 4px;
  color: var(--ion-color-dark);
  font-size: 8px;
  font-weight: 900;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.room-toggle ion-toggle,
.share-new-row ion-toggle {
  transform: scale(0.82);
  transform-origin: right center;
}

.shared-badge {
  flex: none;
  border-radius: 999px;
  padding: 2px 7px;
  color: white;
  background: var(--ion-color-secondary);
  font-size: 8px;
  font-weight: 900;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.opacity-control {
  display: grid;
  grid-template-columns: 16px minmax(80px, 1fr) 34px;
  align-items: center;
  gap: 4px;
  margin-top: 7px;
  color: var(--ion-color-dark);
}

.opacity-control > ion-icon {
  font-size: 14px;
}

.opacity-control > span {
  font-size: 9px;
  font-weight: 900;
  text-align: right;
}

.opacity-control ion-range {
  min-height: 22px;
  padding: 0;
}

.reference-controls {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 3px;
}

.reference-controls ion-button {
  --border-radius: 50%;
  --padding-start: 0;
  --padding-end: 0;
  width: 30px;
  min-height: 30px;
  margin: 0;
  font-size: 13px;
  cursor: pointer;
}

.reference-note {
  padding: 3px 12px 0;
  color: var(--ion-color-dark);
  font-size: 9px;
  font-weight: 800;
  text-align: center;
  opacity: 0.64;
}
</style>
