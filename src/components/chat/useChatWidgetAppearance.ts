import { computed, type Ref } from "vue";
import {
	hydrateChatCustomization,
	resolveFontEffectClass,
	resolveFontFamily,
	resolveReadableCustomizationPalette,
	resolveTheme,
} from "@/config/profile_options.config";
import { useAuthStore } from "@/store/auth.store";
import { useSubscriptionStore } from "@/store/subscription.store";

export function useChatWidgetAppearance(activeTab: Ref<string>) {
	const auth = useAuthStore();
	const subscription = useSubscriptionStore();
	const chatCustomization = computed(() =>
		hydrateChatCustomization((auth.user as any)?.chat_customization),
	);
	const theme = computed(() => resolveTheme(chatCustomization.value.themeId));
	const chatPalette = computed(() =>
		resolveReadableCustomizationPalette(theme.value),
	);
	const fontFamily = computed(() =>
		resolveFontFamily(chatCustomization.value.fontId),
	);

	return {
		chatCustomization,
		chatPalette,
		chatFontEffectClass: computed(() =>
			resolveFontEffectClass(chatCustomization.value.fontEffectId),
		),
		chatWidgetSurfaceStyle: computed(() => ({
			background: theme.value.cardBg,
			borderColor: theme.value.cardBorderColor,
			fontFamily: fontFamily.value,
			"--chat-widget-name": chatPalette.value.name,
			"--chat-widget-desc": chatPalette.value.desc,
			"--chat-widget-utility": chatPalette.value.utility,
			"--chat-widget-scrim": chatPalette.value.scrim,
			"--chat-widget-border": chatPalette.value.controlBorder,
			"--chat-widget-control-bg": chatPalette.value.controlBg,
			"--chat-widget-accent": theme.value.accentColor,
		})),
		chatBackgroundVisible: computed(
			() =>
				subscription.isPro &&
				activeTab.value !== "overview" &&
				!!chatCustomization.value.backgroundImageUrl,
		),
	};
}
