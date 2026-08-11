<template>
	<BaseSheetModal
		:is-open="isOpen"
		scrollable
		:title="title"
		@close="$emit('close')"
	>
		<template #sub-header>
			<div class="px-3">
				<ChatWidgetStylePager
					v-if="previewMode === 'chat'"
					:customization="previewCustomization"
					:user="user"
				/>
				<PreviewSurfacePager
					v-else
					:user="user"
					:customization="previewCustomization"
					:active="isOpen"
					v-bind="pickerPreview"
				/>
			</div>
		</template>

		<slot />

		<template #footer>
			<div class="px-1 pt-2 pb-1 bg-background">
				<ion-button
					v-if="selectionLocked"
					expand="block"
					color="secondary"
					shape="round"
					size="large"
					:disabled="purchasing"
					@click="$emit('unlock')"
				>
					<ion-icon :icon="svg(mdiLock)" slot="start" class="mr-1" />
					{{ purchasing ? "Unlocking…" : `Unlock ${selectionName}` }}
				</ion-button>
				<ion-button
					v-else
					expand="block"
					color="secondary"
					shape="round"
					size="large"
					@click="$emit('apply')"
				>
					{{ applyLabel }}
				</ion-button>
			</div>
		</template>
	</BaseSheetModal>
</template>

<script setup lang="ts">
import { IonButton, IonIcon } from "@ionic/vue";
import { mdiLock } from "@mdi/js";
import { defineAsyncComponent } from "vue";
import BaseSheetModal from "@/components/general/BaseSheetModal.vue";
import PreviewSurfacePager from "@/components/profile/PreviewSurfacePager.vue";
import { usePickerPreview } from "@/config/preview.config";
import type { Customization } from "@/config/profile_options.config";
import { svg } from "@/helper/general.helper";

defineProps<{
	isOpen: boolean;
	title: string;
	user?: unknown;
	previewCustomization: Partial<Customization>;
	previewMode?: "profile" | "chat";
	selectionLocked: boolean;
	selectionName: string;
	purchasing: boolean;
	applyLabel: string;
}>();

defineEmits<{
	close: [];
	apply: [];
	unlock: [];
}>();

const ChatWidgetStylePager = defineAsyncComponent(
	() => import("@/components/chat/ChatWidgetStylePager.vue"),
);
const pickerPreview = usePickerPreview();
</script>
