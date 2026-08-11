<template>
	<button
		class="relative cursor-pointer border-2 bg-tertiary active:scale-95 transition-all overflow-hidden"
		:class="
			selected
				? 'border-secondary shadow-lg ring-2 ring-secondary/30'
				: 'border-primary/40 shadow-sm'
		"
		@click="$emit('select')"
	>
		<slot />

		<div
			v-if="!owned"
			class="absolute inset-0 bg-black/25 backdrop-blur-[1px] flex items-center justify-center pointer-events-none"
		>
			<div
				class="bg-white/95 rounded-full w-9 h-9 flex items-center justify-center shadow-lg"
			>
				<ion-icon :icon="svg(mdiLock)" class="text-base text-black/70" />
			</div>
		</div>

		<div
			v-else-if="selected"
			class="absolute top-2 right-2 w-6 h-6 rounded-full bg-secondary shadow-lg flex items-center justify-center"
		>
			<ion-icon :icon="svg(mdiCheck)" class="text-white text-sm" />
		</div>
	</button>
</template>

<script setup lang="ts">
import { IonIcon } from "@ionic/vue";
import { mdiCheck, mdiLock } from "@mdi/js";
import { svg } from "@/helper/general.helper";

defineProps<{ selected: boolean; owned: boolean }>();
defineEmits<{ select: [] }>();
</script>
