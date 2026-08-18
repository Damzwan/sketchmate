<template>
  <!-- Only exists when someone else actually drew on this canvas. Solo drawings
       never see it. -->
  <div v-if="hasCollaborators" class="bg-primary/10 rounded-xl p-3">
    <div class="flex items-center justify-between">
      <div class="flex-1 pr-3">
        <p class="text-sm font-black text-black leading-none">
          Drew this together
          <span class="font-bold text-black/50">· {{ selected.size }}/{{ collaborators.length }}</span>
        </p>
        <p class="text-xs text-black/80 mt-1 leading-none">
          Tap anyone who actually drew part of this.
        </p>
      </div>
      <button
        type="button"
        class="text-xs cursor-pointer font-black uppercase tracking-wider text-secondary active:opacity-50"
        @click.stop="selected.size ? clearCollaborators() : selectAll()"
      >
        {{ selected.size ? 'None' : 'All' }}
      </button>
    </div>

    <div class="flex overflow-x-auto gap-2 pb-1 hide-scrollbar mt-2.5">
      <CreditChip
        v-for="mate in collaborators"
        :key="mate._id"
        :user="mate"
        :selected="selected.has(mate._id)"
        @toggle="toggleCollaborator(mate._id)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import CreditChip from "./CreditChip.vue";
import type { useCollaboratorPicker } from "./useCollaboratorPicker";

const props = defineProps<{
	picker: ReturnType<typeof useCollaboratorPicker>;
}>();
const {
	collaborators,
	hasCollaborators,
	selected,
	toggleCollaborator,
	selectAll,
	clearCollaborators,
} = props.picker;
</script>

<style scoped>
.hide-scrollbar::-webkit-scrollbar { display: none; }
.hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
</style>
