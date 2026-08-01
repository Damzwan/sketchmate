<template>
  <BaseSheetModal
    :is-open="open"
    scrollable
    title="Chat Style"
    subtitle="Make the widget yours"
    @close="close"
  >
    <div data-content-scroll="true" @touchmove.stop class="pb-3">
      <ChatWidgetStylePager v-if="!pickerIsOpen" :customization="draft" :user="user" />

      <div class="grid grid-cols-2 gap-3 mt-4">
        <CustomizeOptionRow :icon="mdiPalette" label="Theme" :value="theme.name" @click="openPicker('theme')">
          <template #preview>
            <div class="flex -space-x-1">
              <span v-for="color in theme.swatches" :key="color" class="w-4 h-4 rounded-full border border-white" :style="{ backgroundColor: color }" />
            </div>
          </template>
        </CustomizeOptionRow>

        <CustomizeOptionRow :icon="mdiWeatherHurricane" label="World" :value="world.name" @click="openPicker('world')" />
        <CustomizeOptionRow :icon="mdiAutoFix" label="Effect" :value="effect.name" @click="openPicker('effect')" />
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

  <!-- Lazy on first use, then retained. Ionic moves modal DOM while dismissing;
       unmounting the Vue component mid-dismiss races that move and can leave
       nextSibling/insertBefore operating on a node Ionic already removed. -->
  <ThemeModal v-if="pickers.theme.loaded" preview-mode="chat" :is-open="pickers.theme.open" :user="user" :customization="draft" @close="pickers.theme.open = false" @select="setField('themeId', $event)" />
  <WorldModal v-if="pickers.world.loaded" preview-mode="chat" :is-open="pickers.world.open" :user="user" :customization="draft" @close="pickers.world.open = false" @select="setField('worldId', $event)" />
  <EffectModal v-if="pickers.effect.loaded" preview-mode="chat" :is-open="pickers.effect.open" :user="user" :customization="draft" @close="pickers.effect.open = false" @select="setField('effectId', $event)" />
  <FontModal v-if="pickers.font.loaded" preview-mode="chat" :is-open="pickers.font.open" :user="user" :customization="draft" @close="pickers.font.open = false" @select="setField('fontId', $event)" />
  <FontEffectModal v-if="pickers.fontEffect.loaded" preview-mode="chat" :is-open="pickers.fontEffect.open" :user="user" :customization="draft" @close="pickers.fontEffect.open = false" @select="setField('fontEffectId', $event)" />
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import { IonButton, IonIcon } from "@ionic/vue";
import {
	mdiAutoFix,
	mdiFormatColorText,
	mdiFormatFont,
	mdiPalette,
	mdiShoppingOutline,
	mdiWeatherHurricane,
} from "@mdi/js";
import { svg } from "@/helper/general.helper";
import BaseSheetModal from "@/components/general/BaseSheetModal.vue";
import CustomizeOptionRow from "@/components/profile/customization/CustomizeOptionRow.vue";
import ThemeModal from "@/components/profile/customization/ThemeModal.vue";
import WorldModal from "@/components/profile/customization/WorldModal.vue";
import EffectModal from "@/components/profile/customization/EffectModal.vue";
import FontModal from "@/components/profile/customization/FontModal.vue";
import FontEffectModal from "@/components/profile/customization/FontEffectModal.vue";
import ChatWidgetStylePager from "./ChatWidgetStylePager.vue";
import {
	FONTS,
	FONT_EFFECTS,
	hydrateChatCustomization,
	resolveEffect,
	resolveFontEffectClass,
	resolveFontFamily,
	resolveTheme,
	resolveWorld,
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
type PickerKey = "theme" | "world" | "effect" | "font" | "fontEffect";
const pickers = reactive<Record<PickerKey, { open: boolean; loaded: boolean }>>({
	theme: { open: false, loaded: false },
	world: { open: false, loaded: false },
	effect: { open: false, loaded: false },
	font: { open: false, loaded: false },
	fontEffect: { open: false, loaded: false },
});
const openPicker = (picker: PickerKey) => {
	pickers[picker].loaded = true;
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
const world = computed(() => resolveWorld(draft.value.worldId));
const effect = computed(() => resolveEffect(draft.value.effectId));
const fontFamily = computed(() => resolveFontFamily(draft.value.fontId));
const fontEffectClass = computed(() => resolveFontEffectClass(draft.value.fontEffectId));
const fontLabel = computed(() => FONTS.find((font) => font.value === draft.value.fontId)?.label || "Sketch");
const fontEffectLabel = computed(() => FONT_EFFECTS.find((item) => item.value === draft.value.fontEffectId)?.label || "None");

const setField = <K extends keyof ChatCustomization>(field: K, value: ChatCustomization[K]) => {
	draft.value = { ...draft.value, [field]: value };
	if (field === "themeId") pickers.theme.open = false;
	if (field === "worldId") pickers.world.open = false;
	if (field === "effectId") pickers.effect.open = false;
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
