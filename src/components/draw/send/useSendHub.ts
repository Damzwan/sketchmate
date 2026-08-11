import { useIonRouter } from "@ionic/vue";
import dayjs from "dayjs";
import duration from "dayjs/plugin/duration";
import { storeToRefs } from "pinia";
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { formatRemaining, resolveAccent } from "@/config/competition.config";
import { useDocumentStore } from "@/draw/document/document.store";
import { useDrawStore } from "@/draw/session/draw.store";
import { useShareService } from "@/draw/sharing/shareService.store";
import { useDrawSyncer } from "@/draw/sync/session.store";
import { useDrawUIStore } from "@/draw/ui/drawUI.store";
import { masterAnimation } from "@/helper/animation.helper";
import { shareImg } from "@/helper/share.helper";
import { useAuthStore } from "@/store/auth.store";
import { useCompetitionStore } from "@/store/competition.store";
import { useMenuStore } from "@/store/menu.store";
import { useParentalStore } from "@/store/parental.store";
import { useQuotaStore } from "@/store/quota.store";
import { Menu } from "@/types/menu.types";
import { FRONTEND_ROUTES } from "@/types/router.types";
import { useSendMatePicker } from "./useSendMatePicker";

dayjs.extend(duration);

export function useSendHub() {
	const router = useIonRouter();
	const auth = useAuthStore();
	const { user, isUnderAge } = storeToRefs(auth);
	const parental = useParentalStore();
	const drawStore = useDrawStore();
	const { preview, newPreview, isLoadingPreview } = storeToRefs(drawStore);
	const shareService = useShareService();
	const quotaStore = useQuotaStore();
	const drawUI = useDrawUIStore();
	const competitionStore = useCompetitionStore();
	const matePicker = useSendMatePicker();
	const { selected, resetMates, hasMates } = matePicker;

	const competitionPreselected = shareService.preSelected === "competition";
	const isSaveAndSend = ref(
		!competitionPreselected &&
			(isUnderAge.value || shareService.preSelected !== "balloon"),
	);
	const isBalloon = ref(
		!isUnderAge.value && shareService.preSelected === "balloon",
	);
	const isCompetition = ref(competitionPreselected);
	const isPublicPost = ref(false);
	const competitionCaption = ref("");
	const postCaption = ref("");
	const postEnableComments = ref(true);
	const postEnableRemix = ref(true);
	const balloonNote = ref("");
	const now = ref(Date.now());
	let ticker: ReturnType<typeof setInterval> | undefined;

	const showCompetition = computed(
		() =>
			!isUnderAge.value &&
			!!competitionStore.competition &&
			competitionStore.canSubmit,
	);
	const competitionDisabled = computed(() => competitionStore.hasEntered);
	const competitionAccent = computed(() =>
		resolveAccent(competitionStore.accent),
	);
	const competitionSectionStyle = computed(() => {
		const accent = competitionAccent.value;
		return {
			background: `linear-gradient(135deg, ${accent.from}33 0%, ${accent.to}33 100%)`,
			borderColor: `${accent.ink}40`,
			"--tw-ring-color": `${accent.ink}80`,
		};
	});
	const competitionCountdown = computed(() => {
		const close = competitionStore.competition?.submissions_close_at;
		return close ? formatRemaining(close, now.value) : "";
	});

	function formatQuotaCountdown(resetAt?: string) {
		if (!resetAt) return "0m 0s";
		const difference = dayjs(resetAt).diff(dayjs(now.value));
		if (difference <= 0) return "0m 0s";
		const remaining = dayjs.duration(difference);
		const hours = Math.floor(remaining.asHours());
		return hours
			? `${hours}h ${remaining.minutes()}m`
			: `${remaining.minutes()}m ${remaining.seconds()}s`;
	}
	const balloonResetCountdown = computed(() =>
		formatQuotaCountdown(quotaStore.balloons.reset_at),
	);
	const postResetCountdown = computed(() =>
		formatQuotaCountdown(quotaStore.posts.reset_at),
	);
	const sendButtonLabel = computed(() =>
		isUnderAge.value && !hasMates.value ? "Save" : "Send",
	);
	const noActionSelected = computed(
		() =>
			!isSaveAndSend.value &&
			!isPublicPost.value &&
			!isBalloon.value &&
			!isCompetition.value,
	);
	// A pending preview/crop is awaited before we read the image, so this is
	// only about telling the user why the tap didn't fire yet.
	const isPreparing = computed(
		() => isLoadingPreview.value && !shareService.isSending,
	);

	watch(competitionDisabled, (disabled) => {
		if (disabled) isCompetition.value = false;
	});
	onMounted(() => {
		drawUI.chatToastsSilenced = true;
		if (isBalloon.value && (!quotaStore.canSendBalloon || isUnderAge.value)) {
			isBalloon.value = false;
			isSaveAndSend.value = true;
		}
		if (!isUnderAge.value) void competitionStore.refresh();
		ticker = setInterval(() => (now.value = Date.now()), 1_000);
		const canvas = drawStore.getCanvas();
		setTimeout(
			() => drawStore.createPreview(canvas),
			canvas.getObjects().length > 1_000 ? 250 : 50,
		);
	});
	onUnmounted(() => {
		clearInterval(ticker);
		drawStore.resetPreview();
		drawUI.chatToastsSilenced = false;
	});

	function goBack(event: Event) {
		(event.target as HTMLElement).closest("ion-nav")?.pop();
	}
	function toggleSection(
		section: "direct" | "post" | "balloon" | "competition",
	) {
		if (section !== "direct" && isUnderAge.value) return;
		if (section === "direct") isSaveAndSend.value = !isSaveAndSend.value;
		if (section === "post") isPublicPost.value = !isPublicPost.value;
		if (section === "balloon") isBalloon.value = !isBalloon.value;
		if (section === "competition") isCompetition.value = !isCompetition.value;
	}
	function goToPro() {
		useMenuStore().openMenu(Menu.Shop);
	}
	function leaveShare() {
		if (useDrawSyncer().isLobby) {
			void document.querySelector("ion-nav")?.popToRoot();
		} else if (router.canGoBack()) {
			router.back();
		} else {
			void router.replace(FRONTEND_ROUTES.home, masterAnimation);
		}
	}
	async function shareOutsideApp() {
		// A crop started moments ago may still be rendering; without this the
		// share sheet gets the pre-crop image.
		await drawStore.waitForPendingPreview();
		const image = newPreview.value || preview.value;
		if (!image) return;
		try {
			await shareImg(image, undefined, undefined, "Share drawing");
		} catch (error) {
			console.error("Failed to trigger native share:", error);
		}
	}

	async function executeShares() {
		if (noActionSelected.value || shareService.isSending) return;
		const mateRecipients = isSaveAndSend.value ? [...selected.value] : [];
		if (
			mateRecipients.length &&
			!(await parental.ensureCanExchange("mate_send"))
		)
			return;

		const directRecipients =
			isSaveAndSend.value && user.value
				? [...mateRecipients, user.value._id]
				: [];
		const wantsPost = isPublicPost.value && !isUnderAge.value;
		const wantsBalloon = isBalloon.value && !isUnderAge.value;
		const wantsCompetition = isCompetition.value && showCompetition.value;
		const postOptions = {
			caption: postCaption.value,
			enable_comments: postEnableComments.value,
			enable_remix: postEnableRemix.value,
		};
		const balloonMessage = balloonNote.value;
		const competitionOptions = { caption: competitionCaption.value };

		shareService.setSending(true);
		let drawing: Awaited<ReturnType<typeof drawStore.getDataToSend>>;
		try {
			drawing = await drawStore.getDataToSend();
		} catch (error) {
			console.error("Failed to prepare drawing to share:", error);
			shareService.setSending(false);
			return;
		}

		const isLobby = useDrawSyncer().isLobby;
		const documents = useDocumentStore();
		const draftId = documents.currentDraftId;
		if (!isLobby && draftId) documents.markDraftRemoved(draftId);
		if (!isLobby) drawStore.reset();
		shareService.preSelected = "mate";
		drawUI.isForceExiting = true;
		leaveShare();
		resetMates();

		setTimeout(async () => {
			try {
				const tasks: Array<() => Promise<void>> = [];
				if (directRecipients.length)
					tasks.push(() => shareService.sendToMates(drawing, directRecipients));
				if (wantsPost)
					tasks.push(() =>
						shareService.publishCommunityPost(drawing, postOptions).then(() => {
							quotaStore.decrementPost();
						}),
					);
				if (wantsCompetition)
					tasks.push(() =>
						shareService.submitCompetitionEntry(drawing, competitionOptions),
					);
				if (wantsBalloon)
					tasks.push(() =>
						shareService.releaseBalloon(drawing, balloonMessage).then(() => {
							quotaStore.decrementBalloon();
						}),
					);
				await shareService.runBatch(tasks);
				if (!isLobby) void documents.removeDraft(draftId);
			} catch (error) {
				console.error("Background sharing failed:", error);
			} finally {
				shareService.setSending(false);
			}
		}, 400);
	}

	return {
		preview,
		newPreview,
		getAspectRatio: drawStore.getAspectRatio,
		crop: drawStore.crop,
		isUnderAge,
		shareService,
		quotaStore,
		competitionStore,
		matePicker,
		isSaveAndSend,
		isBalloon,
		isCompetition,
		isPublicPost,
		competitionCaption,
		postCaption,
		postEnableComments,
		postEnableRemix,
		balloonNote,
		showCompetition,
		competitionDisabled,
		competitionAccent,
		competitionSectionStyle,
		competitionCountdown,
		balloonResetCountdown,
		postResetCountdown,
		sendButtonLabel,
		noActionSelected,
		isPreparing,
		goBack,
		toggleSection,
		goToPro,
		shareOutsideApp,
		executeShares,
	};
}
