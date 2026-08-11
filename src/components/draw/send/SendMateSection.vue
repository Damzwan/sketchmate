<template>
  <section
    v-if="!isUnderAge || canPickMates"
    class="bg-white/60 border border-primary/40 rounded-3xl p-4 shadow-sm transition-all cursor-pointer"
    :class="{ 'ring-2 ring-secondary/50': modelValue }"
    @click="emit('toggle')"
  >
    <div class="flex items-center justify-between">
      <div class="flex-1 pr-4">
        <div class="flex items-center gap-2">
          <ion-icon :icon="imagesOutline" class="text-secondary text-[24px] shrink-0" />
          <p class="text-xl font-bold text-black leading-none pt-1">
            {{ canPickMates ? 'Gallery & Mates' : 'Save to Gallery' }}
          </p>
        </div>
        <p class="text-sm text-black/80 mt-2 pl-[32px]">
          {{ canPickMates ? 'Save your drawing and send it directly to mates.' : 'Store it in your personal gallery.' }}
        </p>
      </div>
      <div
        class="w-7 h-7 rounded-xl border-2 flex items-center justify-center transition-all shrink-0 border-secondary"
        :class="modelValue ? 'bg-secondary scale-105 shadow-sm' : 'bg-secondary/10'"
      >
        <ion-icon v-if="modelValue" :icon="svg(mdiCheck)" class="text-white w-4 h-4 font-black" />
      </div>
    </div>

    <div v-if="modelValue && canPickMates" class="pt-2 border-t border-primary/20 animate-fade-in" @click.stop>
      <div class="flex items-center justify-between">
        <p class="text-sm font-black text-black leading-none">
          Share with mates
          <span class="font-bold text-black/50">· up to {{ MAX_SEND_MATES }}</span>
        </p>
        <button
          v-if="selected.size"
          @click.stop="resetMates"
          class="text-sm cursor-pointer font-black uppercase tracking-wider active:opacity-50"
          :class="mateLimitReached ? 'text-amber-600' : 'text-secondary'"
        >
          Clear ({{ selected.size }}/{{ MAX_SEND_MATES }})
        </button>
      </div>

      <div class="relative mt-2">
        <ion-icon :icon="svg(mdiMagnify)" class="absolute left-3 top-1/2 -translate-y-1/2 text-black/40 text-base pointer-events-none" />
        <input
          v-model="mateSearch"
          @input="onMateSearch"
          type="text"
          placeholder="Search mates..."
          class="w-full bg-primary/10 border border-primary/30 rounded-xl py-2 pl-9 pr-8 text-sm font-bold text-black outline-none placeholder:font-normal placeholder:text-black/70"
        />
        <button
          v-if="mateSearch"
          @click.stop="clearMateSearch"
          class="absolute right-2 cursor-pointer top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded-full bg-black/10 text-black/70 active:scale-90"
        >
          <ion-icon :icon="svg(mdiClose)" class="text-xs" />
        </button>
      </div>

      <div ref="mateScroll" class="flex overflow-x-auto space-x-3 pb-1 hide-scrollbar px-1 mt-2 min-h-[84px] items-center">
        <div v-if="networkLoading && matePage === 1" class="w-full flex items-center justify-center py-6">
          <ion-spinner name="dots" color="secondary" />
        </div>
        <p v-else-if="!displayMates.length" class="w-full text-center text-xs text-black/70 italic py-6 px-1">
          {{ mateSearch.trim() ? 'No mates match your search.' : 'No mates found.' }}
        </p>
        <template v-else>
          <button
            v-for="mate in displayMates"
            :key="mate._id"
            @click.stop="toggleMate(mate._id)"
            class="relative w-[64px] h-[64px] mt-2 cursor-pointer shrink-0 rounded-2xl border-2 transition-all flex flex-col items-center justify-center overflow-visible"
            :class="selected.has(mate._id) ? 'shadow-md scale-105 hover:scale-105' : mateLimitReached ? 'opacity-40' : 'hover:scale-105'"
            :style="mateTileStyle(mate)"
          >
            <div class="relative mb-1">
              <UserAvatar :user="mate" :customization="mateCustomization(mate)" size="xs" static class="shadow-sm rounded-full" />
              <div v-if="isOnline(mate._id)" class="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-green-500 rounded-full border border-white shadow-sm" />
            </div>
            <div v-if="selected.has(mate._id)" class="absolute -top-1.5 -right-1.5 bg-secondary rounded-full w-6 h-6 flex items-center justify-center border-2 border-white shadow-sm z-10">
              <ion-icon :icon="svg(mdiCheck)" class="text-white w-4 h-4" />
            </div>
            <span class="text-[11px] font-black truncate w-full text-center px-1" :style="mateNameStyle(mate)">{{ mate.name }}</span>
          </button>
          <div ref="mateSentinel" class="shrink-0 w-1 h-1" />
          <div v-if="loadingMoreMates" class="flex items-center px-2 shrink-0"><ion-spinner name="dots" color="secondary" /></div>
        </template>
      </div>
    </div>
  </section>

  <section
    v-if="mateSendLocked && hasMates"
    class="bg-amber-50 border border-amber-200 rounded-3xl p-4 flex gap-3 cursor-pointer"
    @click="openParentalControls"
  >
    <ion-icon :icon="svg(mdiShieldLockOutline)" class="text-2xl shrink-0 text-amber-600" />
    <div class="flex-1 min-w-0">
      <p class="font-black text-base text-amber-900 leading-tight">Sending to mates is off</p>
      <p class="text-sm text-amber-900/90 mt-1 leading-snug">A parent or guardian can turn it on in Settings → Parental Controls. Tap here if you're a parent.</p>
    </div>
  </section>

  <section
    v-if="isUnderAge && !canPickMates"
    class="bg-white/60 border border-primary/40 rounded-3xl p-4 shadow-sm transition-all cursor-pointer"
    :class="{ 'ring-2 ring-secondary/50': modelValue }"
    @click="emit('toggle')"
  >
    <div class="flex items-center justify-between">
      <div class="flex-1 pr-4">
        <div class="flex items-center gap-2">
          <ion-icon :icon="imagesOutline" class="text-secondary text-[24px] shrink-0" />
          <p class="text-xl font-bold text-black leading-none pt-1">Save to Gallery</p>
        </div>
        <p class="text-sm text-black/80 mt-2 pl-[32px]">Keep this drawing in your personal gallery.</p>
      </div>
      <div class="w-7 h-7 rounded-xl border-2 flex items-center justify-center transition-all shrink-0 border-secondary" :class="modelValue ? 'bg-secondary scale-105 shadow-sm' : 'bg-secondary/10'">
        <ion-icon v-if="modelValue" :icon="svg(mdiCheck)" class="text-white w-4 h-4 font-black" />
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { IonIcon, IonSpinner } from "@ionic/vue";
import { mdiCheck, mdiClose, mdiMagnify, mdiShieldLockOutline } from "@mdi/js";
import { imagesOutline } from "ionicons/icons";
import UserAvatar from "@/components/profile/customization/UserAvatar.vue";
import { svg } from "@/helper/general.helper";
import type { useSendMatePicker } from "./useSendMatePicker";

const props = defineProps<{
	modelValue: boolean;
	isUnderAge: boolean;
	picker: ReturnType<typeof useSendMatePicker>;
}>();
const emit = defineEmits<{
	"update:modelValue": [value: boolean];
	toggle: [];
}>();
const {
	MAX_SEND_MATES,
	selected,
	mateLimitReached,
	resetMates,
	mateSearch,
	matePage,
	loadingMoreMates,
	mateScroll,
	mateSentinel,
	networkLoading,
	hasMates,
	mateSendLocked,
	canPickMates,
	displayMates,
	toggleMate,
	isOnline,
	mateCustomization,
	mateTileStyle,
	mateNameStyle,
	onMateSearch,
	clearMateSearch,
	openParentalControls,
} = props.picker;
</script>

<style scoped>
.hide-scrollbar::-webkit-scrollbar { display: none; }
.hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
</style>
