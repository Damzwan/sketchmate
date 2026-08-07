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
      <ChatWidgetStylePager
        v-show="!pickerIsOpen"
        v-model="previewPage"
        :customization="draft"
        :user="user"
      />

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
        <CustomizeOptionRow
          class="col-span-2"
          :icon="mdiImageOutline"
          label="Chat Sketch"
          :value="draft.backgroundImageUrl ? 'Preview selected' : (isPro ? 'Choose a background' : 'Try it · Pro')"
          @click="openBackgroundPicker"
        >
          <template #preview>
            <img
              v-if="draft.backgroundImageUrl"
              :src="draft.backgroundImageUrl"
              alt=""
              class="w-10 h-8 object-contain"
            />
            <ion-icon v-else-if="!isPro" :icon="svg(mdiCrownOutline)" class="text-xl text-secondary" />
          </template>
        </CustomizeOptionRow>
      </div>

      <div v-if="draft.backgroundImageUrl" class="mt-4 rounded-2xl bg-black/5 px-4 py-3">
        <div class="flex items-center justify-between mb-1">
          <span class="text-xs font-black uppercase tracking-wider text-black/60">Sketch strength</span>
          <span class="text-xs font-black text-secondary">{{ Math.round(draft.backgroundImageOpacity * 100) }}%</span>
        </div>
        <!-- Bounds come from the config, never literals: hydration clamps to the
             same numbers, and a wider track is a third of a slider that does
             nothing. -->
        <ion-range
          :min="CHAT_BACKGROUND_OPACITY_MIN"
          :max="CHAT_BACKGROUND_OPACITY_MAX"
          :step="0.01"
          :value="draft.backgroundImageOpacity"
          @ionInput="draft.backgroundImageOpacity = Number($event.detail.value)"
          color="secondary"
        />
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
        {{ saving ? 'Saving…' : pendingBackground ? (isPro ? 'Confirm Chat Style' : 'Unlock & Confirm') : 'Save Chat Style' }}
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
  <ChatBackgroundPickerModal
    v-if="backgroundPickerLoaded"
    :is-open="backgroundPickerOpen"
    :current-url="draft.backgroundImageUrl"
    @close="backgroundPickerOpen = false"
    @selected="onBackgroundSelected"
    @cleared="onBackgroundCleared"
  />
</template>

<script setup lang="ts">
import { IonButton, IonIcon, IonRange } from "@ionic/vue";
import {
	mdiCrownOutline,
	mdiFormatColorText,
	mdiFormatFont,
	mdiImageOutline,
	mdiPalette,
	mdiShoppingOutline,
} from "@mdi/js";
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from "vue";
import BaseSheetModal from "@/components/general/BaseSheetModal.vue";
import CustomizeOptionRow from "@/components/profile/customization/CustomizeOptionRow.vue";
import FontEffectModal from "@/components/profile/customization/FontEffectModal.vue";
import FontModal from "@/components/profile/customization/FontModal.vue";
import ThemeModal from "@/components/profile/customization/ThemeModal.vue";
import {
	CHAT_BACKGROUND_OPACITY_MAX,
	CHAT_BACKGROUND_OPACITY_MIN,
	type ChatCustomization,
	FONT_EFFECTS,
	FONTS,
	hydrateChatCustomization,
	resolveFontEffectClass,
	resolveFontFamily,
	resolveTheme,
} from "@/config/profile_options.config";
import { svg } from "@/helper/general.helper";
import {
	clearChatBackground,
	confirmChatBackground,
	updateProfile,
} from "@/service/api/user.api";
import { useToast } from "@/service/toast.service";
import { useAuthStore } from "@/store/auth.store";
import { useMenuStore } from "@/store/menu.store";
import { useSubscriptionStore } from "@/store/subscription.store";
import ChatBackgroundPickerModal from "./ChatBackgroundPickerModal.vue";
import ChatWidgetStylePager from "./ChatWidgetStylePager.vue";

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ "update:open": [value: boolean] }>();
const authStore = useAuthStore();
const menuStore = useMenuStore();
const { toast } = useToast();
const subscriptionStore = useSubscriptionStore();
const isPro = computed(() => subscriptionStore.isPro);
const user = computed(() => authStore.user);
const saved = ref(
	hydrateChatCustomization((user.value as any)?.chat_customization),
);
const draft = ref<ChatCustomization>({ ...saved.value });
const saving = ref(false);
const previewPage = ref<"overview" | "conversation">("overview");
const pendingBackground = ref<{
	url: string;
	type: "inbox" | "post";
	id: string;
} | null>(null);
const previewStaged = ref(false);
const backgroundRemovalPending = ref(false);
const confirmAfterUpgrade = ref(false);
type PickerKey = "theme" | "font" | "fontEffect";
const pickers = reactive<Record<PickerKey, { open: boolean; loaded: boolean }>>(
	{
		theme: { open: false, loaded: false },
		font: { open: false, loaded: false },
		fontEffect: { open: false, loaded: false },
	},
);
const openPicker = async (picker: PickerKey) => {
	if (!pickers[picker].loaded) {
		pickers[picker].loaded = true;
		await nextTick();
	}
	pickers[picker].open = true;
};
const backgroundPickerOpen = ref(false);
const backgroundPickerLoaded = ref(false);
const pickerIsOpen = computed(
	() =>
		Object.values(pickers).some((picker) => picker.open) ||
		backgroundPickerOpen.value,
);
const openBackgroundPicker = async () => {
	backgroundPickerLoaded.value = true;
	await nextTick();
	backgroundPickerOpen.value = true;
};
const onBackgroundSelected = (preview: {
	url: string;
	type: "inbox" | "post";
	id: string;
}) => {
	pendingBackground.value = preview;
	previewStaged.value = true;
	backgroundRemovalPending.value = false;
	draft.value = { ...draft.value, backgroundImageUrl: preview.url };
	previewPage.value = "conversation";
};
const discardPendingBackground = async () => {
	if (!previewStaged.value) return;
	pendingBackground.value = null;
	previewStaged.value = false;
	draft.value = {
		...draft.value,
		backgroundImageUrl: saved.value.backgroundImageUrl,
	};
};
const onBackgroundCleared = async () => {
	await discardPendingBackground();
	backgroundRemovalPending.value = !!saved.value.backgroundImageUrl;
	draft.value = { ...draft.value, backgroundImageUrl: "" };
};

watch(
	() => props.open,
	(open) => {
		if (!open) {
			void discardPendingBackground();
			return;
		}
		saved.value = hydrateChatCustomization(
			(user.value as any)?.chat_customization,
		);
		draft.value = { ...saved.value };
		pendingBackground.value = null;
		backgroundRemovalPending.value = false;
		confirmAfterUpgrade.value = false;
	},
);
onBeforeUnmount(() => {
	void discardPendingBackground();
});

const dirty = computed(
	() => JSON.stringify(draft.value) !== JSON.stringify(saved.value),
);
const theme = computed(() => resolveTheme(draft.value.themeId));
const fontFamily = computed(() => resolveFontFamily(draft.value.fontId));
const fontEffectClass = computed(() =>
	resolveFontEffectClass(draft.value.fontEffectId),
);
const fontLabel = computed(
	() =>
		FONTS.find((font) => font.value === draft.value.fontId)?.label || "Sketch",
);
const fontEffectLabel = computed(
	() =>
		FONT_EFFECTS.find((item) => item.value === draft.value.fontEffectId)
			?.label || "None",
);

const setField = <K extends keyof ChatCustomization>(
	field: K,
	value: ChatCustomization[K],
) => {
	draft.value = { ...draft.value, [field]: value };
	if (field === "themeId") pickers.theme.open = false;
	if (field === "fontId") pickers.font.open = false;
	if (field === "fontEffectId") pickers.fontEffect.open = false;
};
const reset = () => {
	void discardPendingBackground();
	backgroundRemovalPending.value = false;
	draft.value = {
		...hydrateChatCustomization(),
		backgroundImageUrl: saved.value.backgroundImageUrl,
		backgroundImageOpacity: saved.value.backgroundImageOpacity,
	};
};
const close = () => {
	confirmAfterUpgrade.value = false;
	void discardPendingBackground();
	emit("update:open", false);
};
const browseShop = () => {
	close();
	menuStore.openShop(undefined, "chat");
};
const save = async () => {
	if (!user.value || saving.value || !dirty.value) return;
	if (pendingBackground.value && !isPro.value) {
		confirmAfterUpgrade.value = true;
		subscriptionStore.openPaywall();
		return;
	}
	saving.value = true;
	const previous = (user.value as any).chat_customization;
	let committedBackgroundUrl: string | null = null;
	let clearedBackground = false;
	try {
		if (pendingBackground.value) {
			const pending = pendingBackground.value;
			const { url } = await confirmChatBackground(pending.type, pending.id);
			draft.value = { ...draft.value, backgroundImageUrl: url };
			committedBackgroundUrl = url;
			pendingBackground.value = null;
			previewStaged.value = false;
		} else if (backgroundRemovalPending.value) {
			await clearChatBackground();
			clearedBackground = true;
			backgroundRemovalPending.value = false;
		}
		await updateProfile({ chat_customization: draft.value });
		(user.value as any).chat_customization = { ...draft.value };
		saved.value = { ...draft.value };
		toast("Chat style saved! ✨", { color: "success" });
		close();
	} catch {
		if (committedBackgroundUrl || clearedBackground) {
			const persistedUrl = committedBackgroundUrl ?? "";
			const persisted = {
				...previous,
				backgroundImageUrl: persistedUrl,
			};
			(user.value as any).chat_customization = persisted;
			saved.value = hydrateChatCustomization(persisted);
			draft.value = {
				...draft.value,
				backgroundImageUrl: persistedUrl,
			};
			toast("The chat sketch was saved, but another style change failed.", {
				color: "warning",
			});
		} else {
			(user.value as any).chat_customization = previous;
			toast("Couldn't save your chat style.", { color: "danger" });
		}
	} finally {
		saving.value = false;
	}
};
watch(isPro, (pro) => {
	if (
		pro &&
		confirmAfterUpgrade.value &&
		props.open &&
		pendingBackground.value
	) {
		confirmAfterUpgrade.value = false;
		void save();
	}
});
</script>
