<template>
  <BaseSheetModal
    :is-open="open"
    keep-contents-mounted
    scrollable
    title="Chat Style"
    subtitle="Make the widget yours"
    @close="close"
  >
    <div data-content-scroll="true" @touchmove.stop class="pb-3">
      <ChatWidgetStylePager v-show="!pickerIsOpen" :customization="draft" :user="user" />

      <div class="grid grid-cols-2 gap-3 mt-4">
        <CustomizeOptionRow :icon="mdiPalette" label="Theme" :value="theme.name" @click="openPicker('theme')">
          <template #preview>
            <div class="flex -space-x-1">
              <span v-for="color in theme.swatches" :key="color" class="w-4 h-4 rounded-full border border-white" :style="{ backgroundColor: color }" />
            </div>
          </template>
        </CustomizeOptionRow>

        <CustomizeOptionRow :icon="mdiFormatFont" label="Font" :value="fontLabel" @click="openPicker('font')">
          <template #preview><span class="text-xl font-black" :style="{ fontFamily }">Aa</span></template>
        </CustomizeOptionRow>
        <CustomizeOptionRow class="col-span-2" :icon="mdiFormatColorText" label="Text Effect" :value="fontEffectLabel" @click="openPicker('fontEffect')">
          <template #preview><span class="text-xl font-black" :class="fontEffectClass" :style="{ fontFamily }">Aa</span></template>
        </CustomizeOptionRow>
      </div>

      <div class="flex gap-2 mt-4">
        <ion-button expand="block" fill="outline" color="secondary" shape="round" class="flex-1 m-0" @click="reset">
          Reset
        </ion-button>
        <ion-button expand="block" fill="clear" color="secondary" shape="round" class="flex-1 m-0" @click="browseShop">
          <ion-icon :icon="svg(mdiShoppingOutline)" slot="start" />
          Shop
        </ion-button>
      </div>
      <p class="text-xs text-black/60 text-center mt-3 px-4">
        Items you unlock are shared with your profile collection, but this look is saved separately.
      </p>
    </div>

    <template #footer>
      <ion-button expand="block" color="secondary" shape="round" size="large" :disabled="saving || !dirty" @click="save">
        {{ saving ? 'Saving…' : 'Save Chat Style' }}
      </ion-button>
    </template>
  </BaseSheetModal>

  <!-- Mount a picker one update before asking Ionic to present it, then retain
       both its Vue component and Ionic portal contents for the session. This
       avoids insert/remove work during every dismissal without eagerly paying
       for pickers the user never opens. -->
  <ThemeModal v-if="pickers.theme.loaded" keep-contents-mounted preview-mode="chat" :is-open="pickers.theme.open" :user="user" :customization="draft" @close="pickers.theme.open = false" @select="setField('themeId', $event)" />
  <FontModal v-if="pickers.font.loaded" keep-contents-mounted preview-mode="chat" :is-open="pickers.font.open" :user="user" :customization="draft" @close="pickers.font.open = false" @select="setField('fontId', $event)" />
  <FontEffectModal v-if="pickers.fontEffect.loaded" keep-contents-mounted preview-mode="chat" :is-open="pickers.fontEffect.open" :user="user" :customization="draft" @close="pickers.fontEffect.open = false" @select="setField('fontEffectId', $event)" />
</template>

<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from "vue";
import { IonButton, IonIcon } from "@ionic/vue";
import {
	mdiFormatColorText,
	mdiFormatFont,
	mdiPalette,
	mdiShoppingOutline,
} from "@mdi/js";
import { svg } from "@/helper/general.helper";
import BaseSheetModal from "@/components/general/BaseSheetModal.vue";
import CustomizeOptionRow from "@/components/profile/customization/CustomizeOptionRow.vue";
import ThemeModal from "@/components/profile/customization/ThemeModal.vue";
import FontModal from "@/components/profile/customization/FontModal.vue";
import FontEffectModal from "@/components/profile/customization/FontEffectModal.vue";
import ChatWidgetStylePager from "./ChatWidgetStylePager.vue";
import {
	FONTS,
	FONT_EFFECTS,
	hydrateChatCustomization,
	resolveFontEffectClass,
	resolveFontFamily,
	resolveTheme,
	type ChatCustomization,
} from "@/config/profile_options.config";
import { updateProfile } from "@/service/api/user.api";
import { useAuthStore } from "@/store/auth.store";
import { useMenuStore } from "@/store/menu.store";
import { useToast } from "@/service/toast.service";

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ "update:open": [value: boolean] }>();
const authStore = useAuthStore();
const menuStore = useMenuStore();
const { toast } = useToast();
const user = computed(() => authStore.user);
const saved = ref(hydrateChatCustomization((user.value as any)?.chat_customization));
const draft = ref<ChatCustomization>({ ...saved.value });
const saving = ref(false);
type PickerKey = "theme" | "font" | "fontEffect";
const pickers = reactive<Record<PickerKey, { open: boolean; loaded: boolean }>>({
	theme: { open: false, loaded: false },
	font: { open: false, loaded: false },
	fontEffect: { open: false, loaded: false },
});
const openPicker = async (picker: PickerKey) => {
	if (!pickers[picker].loaded) {
		pickers[picker].loaded = true;
		await nextTick();
	}
	pickers[picker].open = true;
};
const pickerIsOpen = computed(() =>
	Object.values(pickers).some((picker) => picker.open),
);

watch(
	() => props.open,
	(open) => {
		if (!open) return;
		saved.value = hydrateChatCustomization((user.value as any)?.chat_customization);
		draft.value = { ...saved.value };
	},
);

const dirty = computed(() => JSON.stringify(draft.value) !== JSON.stringify(saved.value));
const theme = computed(() => resolveTheme(draft.value.themeId));
const fontFamily = computed(() => resolveFontFamily(draft.value.fontId));
const fontEffectClass = computed(() => resolveFontEffectClass(draft.value.fontEffectId));
const fontLabel = computed(() => FONTS.find((font) => font.value === draft.value.fontId)?.label || "Sketch");
const fontEffectLabel = computed(() => FONT_EFFECTS.find((item) => item.value === draft.value.fontEffectId)?.label || "None");

const setField = <K extends keyof ChatCustomization>(field: K, value: ChatCustomization[K]) => {
	draft.value = { ...draft.value, [field]: value };
	if (field === "themeId") pickers.theme.open = false;
	if (field === "fontId") pickers.font.open = false;
	if (field === "fontEffectId") pickers.fontEffect.open = false;
};
const reset = () => (draft.value = hydrateChatCustomization());
const close = () => emit("update:open", false);
const browseShop = () => {
	close();
	menuStore.openShop(undefined, "chat");
};
const save = async () => {
	if (!user.value || saving.value || !dirty.value) return;
	saving.value = true;
	const previous = (user.value as any).chat_customization;
	(user.value as any).chat_customization = { ...draft.value };
	try {
		await updateProfile({ chat_customization: draft.value });
		saved.value = { ...draft.value };
		toast("Chat style saved! ✨", { color: "success" });
		close();
	} catch {
		(user.value as any).chat_customization = previous;
		toast("Couldn't save your chat style.", { color: "danger" });
	} finally {
		saving.value = false;
	}
};
</script>
