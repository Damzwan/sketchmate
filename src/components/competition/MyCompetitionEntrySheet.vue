<template>
  <ion-modal
    :is-open="open"
    :initial-breakpoint="0.78"
    :breakpoints="[0, 0.56, 0.78, 0.94]"
    class="my-entry-sheet"
    @did-dismiss="$emit('close')"
  >
    <div v-if="entry" class="h-full overflow-y-auto bg-background px-4 pt-3 pb-safe cabin-sketch-regular">
      <div class="flex items-center justify-between gap-3 mb-3">
        <div>
          <p class="text-[10px] uppercase tracking-widest font-black text-black/80">Your competition entry</p>
          <h2 class="text-xl font-black text-black mt-0.5">One drawing, all yours</h2>
        </div>
        <ion-button fill="clear" color="dark" class="m-0" @click="$emit('close')">
          <ion-icon :icon="svg(mdiClose)" slot="icon-only" />
        </ion-button>
      </div>

      <button
        type="button"
        class="relative block w-full overflow-hidden rounded-[1.75rem] border border-primary/35 bg-tertiary shadow-sm cursor-pointer transition-all active:scale-[0.99] md:hover:scale-[1.01] md:hover:shadow-md"
        @click="$emit('fullscreen', entry)"
      >
        <img
          :src="entry.image_url || entry.thumbnail_url"
          alt="Your competition entry"
          class="w-full max-h-[46vh] object-contain bg-primary/10"
        />
        <span class="absolute right-3 top-3 h-10 w-10 rounded-full bg-black/50 text-white backdrop-blur-sm flex items-center justify-center border border-white/20">
          <ion-icon :icon="svg(mdiArrowExpand)" class="text-xl" />
        </span>
      </button>

      <p v-if="entry.caption" class="text-sm font-bold text-black/80 mt-3 px-1">{{ entry.caption }}</p>

      <div
        v-if="entry.total_votes !== undefined"
        class="mt-3 rounded-2xl border border-primary/35 bg-tertiary px-4 py-3 flex items-center gap-3"
      >
        <span class="w-10 h-10 rounded-xl bg-secondary text-white flex items-center justify-center shrink-0">
          <ion-icon :icon="svg(mdiVoteOutline)" class="text-xl" />
        </span>
        <span>
          <span class="block text-lg font-black text-black leading-none">
            {{ entry.total_votes }} {{ entry.total_votes === 1 ? 'vote' : 'votes' }}
          </span>
          <span class="block text-xs font-bold text-black/80 mt-1">Final competition total</span>
        </span>
      </div>

      <div class="grid grid-cols-2 gap-2 mt-4">
        <ion-button expand="block" color="secondary" shape="round" class="m-0" @click="$emit('remix', entry)">
          <ion-icon :icon="svg(mdiPencilOutline)" slot="start" />
          Remix
        </ion-button>
        <ion-button
          expand="block"
          color="danger"
          fill="outline"
          shape="round"
          class="m-0"
          :disabled="!canDelete"
          @click="$emit('delete', entry)"
        >
          <ion-icon :icon="svg(mdiDeleteOutline)" slot="start" />
          Delete entry
        </ion-button>
      </div>
      <p v-if="!canDelete" class="text-center text-xs text-black/80 mt-3">
        Entries can only be deleted while submissions are open.
      </p>
    </div>
  </ion-modal>
</template>

<script setup lang="ts">
import { IonButton, IonIcon, IonModal } from "@ionic/vue";
import {
	mdiArrowExpand,
	mdiClose,
	mdiDeleteOutline,
	mdiPencilOutline,
	mdiVoteOutline,
} from "@mdi/js";
import { svg } from "@/helper/general.helper";
import type { CompetitionEntry } from "@/service/api/competition.api";

defineProps<{
	open: boolean;
	entry: CompetitionEntry | null;
	canDelete: boolean;
}>();

defineEmits<{
	(e: "close"): void;
	(e: "delete", entry: CompetitionEntry): void;
	(e: "fullscreen", entry: CompetitionEntry): void;
	(e: "remix", entry: CompetitionEntry): void;
}>();
</script>

<style scoped>
.pb-safe { padding-bottom: calc(env(safe-area-inset-bottom, 0px) + 1rem); }
ion-modal.my-entry-sheet { --border-radius: 2rem 2rem 0 0; }
</style>
