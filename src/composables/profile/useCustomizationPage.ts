import { onIonViewDidEnter } from "@ionic/vue";
import { storeToRefs } from "pinia";
import { computed, onBeforeUnmount, ref, watch } from "vue";
import {
	type Customization,
	FONT_EFFECTS,
	FONTS,
	hydrateCustomization,
	resolveDecoration,
	resolveEffect,
	resolveFontEffectClass,
	resolveFontFamily,
	resolveTheme,
	resolveTitle,
	resolveWorld,
} from "@/config/profile_options.config";
import { updateProfile, uploadProfileImg } from "@/service/api/user.api";
import { mixpanelEvents, trackEvent } from "@/service/mixpanel";
import { useToast } from "@/service/toast.service";
import { useAmbientPause } from "@/store/ambientPause.store";
import { useAuthStore } from "@/store/auth.store";
import { useSubscriptionStore } from "@/store/subscription.store";

export function useCustomizationPage() {
	const { user } = storeToRefs(useAuthStore());
	const subStore = useSubscriptionStore();
	const { toast } = useToast();
	const ambient = useAmbientPause();
	const isSaving = ref(false);

	const identityModalOpen = ref(false);
	const themeModalOpen = ref(false);
	const fontModalOpen = ref(false);
	const fontEffectModalOpen = ref(false);
	const decorationModalOpen = ref(false);
	const effectModalOpen = ref(false);
	const worldModalOpen = ref(false);
	const titlesModalOpen = ref(false);
	const signatureModalOpen = ref(false);
	const sketchModalOpen = ref(false);
	const chatStyleModalOpen = ref(false);
	const modalStates = [
		identityModalOpen,
		themeModalOpen,
		fontModalOpen,
		fontEffectModalOpen,
		decorationModalOpen,
		effectModalOpen,
		worldModalOpen,
		titlesModalOpen,
		signatureModalOpen,
		sketchModalOpen,
		chatStyleModalOpen,
	];
	const anyModalOpen = computed(() => modalStates.some((state) => state.value));
	watch(anyModalOpen, (open) => (open ? ambient.hold() : ambient.release()));
	onBeforeUnmount(() => {
		if (anyModalOpen.value) ambient.release();
	});
	onIonViewDidEnter(() => trackEvent(mixpanelEvents.customizationOpen));

	const initial = () => hydrateCustomization(user.value?.customization);
	const saved = ref<Customization>(initial());
	const draft = ref<Customization>(initial());
	const initialProfile = () => ({
		name: user.value?.name || "",
		description: user.value?.description || "",
	});
	const profileDraft = ref(initialProfile());
	const savedProfileDraft = ref(initialProfile());
	const pendingImg = ref<string | null>(null);
	const previewImg = computed(() => pendingImg.value ?? user.value?.img ?? "");

	watch(
		user,
		(value) => {
			if (!value) return;
			saved.value = hydrateCustomization(value.customization);
			draft.value = hydrateCustomization(value.customization);
			savedProfileDraft.value = {
				name: value.name,
				description: value.description || "",
			};
			profileDraft.value = { ...savedProfileDraft.value };
		},
		{ immediate: true },
	);

	const isDirty = computed(
		() =>
			JSON.stringify(saved.value) !== JSON.stringify(draft.value) ||
			JSON.stringify(savedProfileDraft.value) !==
				JSON.stringify(profileDraft.value) ||
			pendingImg.value !== null,
	);
	const currentTheme = computed(() => resolveTheme(draft.value.themeId));
	const currentThemeName = computed(() => currentTheme.value.name);
	const currentDecorationName = computed(
		() => resolveDecoration(draft.value.decorationId).name,
	);
	const currentEffectName = computed(
		() => resolveEffect(draft.value.effectId).name,
	);
	const currentWorldName = computed(
		() => resolveWorld(draft.value.worldId).name,
	);
	const currentTitleName = computed(() => resolveTitle(draft.value.titleId));
	const currentFontLabel = computed(
		() =>
			FONTS.find((font) => font.value === draft.value.fontId)?.label ||
			"Sketch",
	);
	const currentFontEffectLabel = computed(
		() =>
			FONT_EFFECTS.find((effect) => effect.value === draft.value.fontEffectId)
				?.label || "None",
	);
	const resolvedFontFamily = computed(() =>
		resolveFontFamily(draft.value.fontId),
	);
	const currentFontEffectClass = computed(() =>
		resolveFontEffectClass(draft.value.fontEffectId),
	);

	function updateField<K extends keyof Customization>(
		field: K,
		value: Customization[K],
	) {
		draft.value = { ...draft.value, [field]: value };
	}

	function handleIdentitySave(data: {
		name: string;
		description: string;
		img: string | null;
	}) {
		profileDraft.value = { name: data.name, description: data.description };
		if (data.img) pendingImg.value = data.img;
		if (user.value) {
			user.value.name = data.name;
			user.value.description = data.description;
		}
		identityModalOpen.value = false;
	}

	function handleSaveSignature(data: { path: string; viewBox: string }) {
		draft.value = {
			...draft.value,
			signaturePath: data.path,
			signatureViewBox: data.viewBox,
		};
		signatureModalOpen.value = false;
	}

	function handleSaveSketch(data: { path: string; viewBox: string }) {
		draft.value = {
			...draft.value,
			backgroundSketchPath: data.path,
			backgroundSketchViewBox: data.viewBox,
		};
		sketchModalOpen.value = false;
	}

	function revert() {
		draft.value = structuredClone(saved.value);
		profileDraft.value = structuredClone(savedProfileDraft.value);
		pendingImg.value = null;
		if (user.value) {
			user.value.name = savedProfileDraft.value.name;
			user.value.description = savedProfileDraft.value.description;
		}
	}

	async function save() {
		if (profileDraft.value.name.trim().length < 4) {
			toast("Name should be at least 4 characters", { color: "danger" });
			return;
		}
		isSaving.value = true;
		try {
			const profileUpdate = updateProfile({
				name: profileDraft.value.name.trim(),
				description: profileDraft.value.description.trim(),
				customization: draft.value,
			});
			const imageUpdate = pendingImg.value
				? fetch(pendingImg.value)
						.then((response) => response.blob())
						.then((blob) => uploadProfileImg(blob, user.value?.img || ""))
				: null;
			const [, uploadedImage] = await Promise.all([profileUpdate, imageUpdate]);

			if (user.value) {
				user.value.customization = structuredClone(draft.value);
				const previousName = savedProfileDraft.value.name;
				const nameChanged = profileDraft.value.name.trim() !== previousName;
				if (nameChanged && !subStore.isPro && previousName !== "Anonymous") {
					user.value.last_name_change = new Date().toISOString();
				}
				user.value.name = profileDraft.value.name.trim();
				user.value.description = profileDraft.value.description.trim();
				if (uploadedImage?.url) user.value.img = uploadedImage.url;
			}
			saved.value = structuredClone(draft.value);
			savedProfileDraft.value = structuredClone(profileDraft.value);
			pendingImg.value = null;
			toast("Look and details saved! ✨", { color: "success" });
		} catch (error: any) {
			console.error(error);
			toast(error?.response?.data?.error || "Failed to save profile", {
				color: "danger",
			});
		} finally {
			isSaving.value = false;
		}
	}

	return {
		user,
		subStore,
		isSaving,
		identityModalOpen,
		themeModalOpen,
		fontModalOpen,
		fontEffectModalOpen,
		decorationModalOpen,
		effectModalOpen,
		worldModalOpen,
		titlesModalOpen,
		signatureModalOpen,
		sketchModalOpen,
		chatStyleModalOpen,
		saved,
		draft,
		profileDraft,
		pendingImg,
		previewImg,
		isDirty,
		currentTheme,
		currentThemeName,
		currentDecorationName,
		currentEffectName,
		currentWorldName,
		currentTitleName,
		currentFontLabel,
		currentFontEffectLabel,
		resolvedFontFamily,
		currentFontEffectClass,
		updateField,
		handleIdentitySave,
		handleSaveSignature,
		handleSaveSketch,
		revert,
		save,
	};
}
