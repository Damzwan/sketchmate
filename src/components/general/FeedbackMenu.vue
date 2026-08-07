<template>
  <ion-modal :is-open="feedbackMenuOpen" @didDismiss="feedbackMenuOpen = false" class="z-2000 sketch-modal">
    <div class="bg-background p-4 report-modal">
      <ion-button fill="clear" class="absolute right-0 top-0" @click="feedbackMenuOpen = false">
        <ion-icon slot="icon-only" class="fill-black" :icon="svg(mdiClose)" />
      </ion-button>
      <p class="text-xl cabin-sketch-regular">Share your thoughts</p>
      <p class="text-md cabin-sketch-regular">SketchMate was made by one single person. I need your help!</p>

      <div class="py-2" />
      <ion-textarea
        v-model="likeText"
        helper-text="What do you think about SketchMate?"
        fill="outline"
        placeholder="I think that..."
        color="secondary"
      />

      <ion-textarea
        class="py-2"
        v-model="dislikeText"
        helper-text="What do you dislike about SketchMate?"
        fill="outline"
        placeholder="I wish that..."
        color="secondary"
      />

      <p class="cabin-sketch-regular pt-4">Do you like SketchMate?</p>
      <ion-radio-group v-model="score" mode="md">
        <ion-radio :value="FeedbackOptions.like" class="cabin-sketch-regular" color="secondary">I like it</ion-radio>
        <br />
        <ion-radio :value="FeedbackOptions.neutral" class="cabin-sketch-regular" color="secondary">No strong opinion
        </ion-radio>
        <br />
        <ion-radio :value="FeedbackOptions.dislike" class="cabin-sketch-regular" color="secondary">I do not like it
        </ion-radio>
        <br />
      </ion-radio-group>


      <div class="flex justify-end">
        <ion-button color="secondary" @click="submit" :disabled="isSubmitting">Submit</ion-button>
      </div>

      <div class="flex flex-col mt-2">
        <ion-button size="small" fill="clear" class="pt-3" :href="discord_link" target="_blank">
          <ion-icon slot="start" :icon="discordSvg" class="pr-2" />
          <p class="cabin-sketch-regular text-black">Chat with me on Discord</p>
        </ion-button>
      </div>

      <div class="flex justify-center pt-2">
        <ion-button
          size="small"
          fill="clear"
          @click="handleOptOut"
          :disabled="isOptingOut"
        >
          <p class="cabin-sketch-regular text-xs text-gray-500">Don't ask me again</p>
        </ion-button>
      </div>
    </div>
  </ion-modal>
</template>


<script setup lang="ts">
import { AppReview } from "@capawesome/capacitor-app-review";
import {
	IonButton,
	IonIcon,
	IonModal,
	IonRadio,
	IonRadioGroup,
	IonTextarea,
	modalController,
} from "@ionic/vue";
import { mdiClose } from "@mdi/js";
import {
	addDoc,
	collection,
	getFirestore,
	serverTimestamp,
} from "firebase/firestore";
import { storeToRefs } from "pinia";
import { ref } from "vue";
import discordSvg from "@/assets/discord.svg";
import { discord_link } from "@/config/general.config";
import { useShareToastStore } from "@/draw/sharing/shareToast.store";
import { svg } from "@/helper/general.helper";
import { isNative } from "@/helper/platform.helper";
import { setFeedbackOptOut, submitFeedback } from "@/service/api/user.api";
import { useToast } from "@/service/toast.service";
import { useAuthStore } from "@/store/auth.store";
import { useInventoryStore } from "@/store/inventory.store";
import { useMenuStore } from "@/store/menu.store";
import { useSubscriptionStore } from "@/store/subscription.store";

enum FeedbackOptions {
	like = "like",
	neutral = "neutral",
	dislike = "dislike",
	empty = "empty",
}

const { feedbackMenuOpen } = storeToRefs(useMenuStore());

const likeText = ref("");
const dislikeText = ref("");
const score = ref<FeedbackOptions>(FeedbackOptions.empty);

const subscriptionStore = useSubscriptionStore();
const { isPro } = storeToRefs(subscriptionStore);

const isSubmitting = ref(false);
const isOptingOut = ref(false);

async function submit() {
	if (isSubmitting.value) return;
	isSubmitting.value = true;

	const { toast } = useToast();
	if (
		likeText.value == "" &&
		dislikeText.value == "" &&
		score.value == FeedbackOptions.empty
	) {
		toast("Fill at least one field", { color: "warning" });
		isSubmitting.value = false;
		return;
	}

	const db = getFirestore();
	const { user } = useAuthStore();

	if (!user) {
		isSubmitting.value = false;
		return;
	}

	modalController.dismiss();

	const feedbackData = {
		likeText: likeText.value,
		dislikeText: dislikeText.value,
		score: score.value,
		userId: user.auth_id,
		version: __APP_VERSION__,
	};

	resetForm();

	try {
		await addDoc(collection(db, "feedback"), {
			...feedbackData,
			timestamp: serverTimestamp(),
		});

		toast("Thank you for your feedback :)", { color: "success" });

		// Earn the Contributor title. Backend is authoritative; reflect it
		// locally and celebrate anything newly granted.
		try {
			const message = [
				feedbackData.likeText && `LIKE: ${feedbackData.likeText}`,
				feedbackData.dislikeText && `DISLIKE: ${feedbackData.dislikeText}`,
				`SCORE: ${feedbackData.score}`,
			]
				.filter(Boolean)
				.join("\n");
			const { granted } = await submitFeedback({ message });
			if (granted?.length) {
				useInventoryStore().grantOptimistic(granted);
				for (const id of granted) useShareToastStore().pushTitleToast(id);
			}
		} catch (e) {
			console.error("[feedback] title grant failed", e);
		}

		if (feedbackData.score === FeedbackOptions.like && isNative()) {
			await AppReview.requestReview();
		}
	} catch (e) {
		console.error("Error adding feedback: ", e);
		toast("Failed to send feedback. Please try again later.", {
			color: "danger",
		});
	} finally {
		isSubmitting.value = false;
	}
}

async function handleOptOut() {
	if (isOptingOut.value) return;
	isOptingOut.value = true;

	const { toast } = useToast();

	try {
		await setFeedbackOptOut(true);
		toast("Got it, I won't ask again", { color: "success" });
		feedbackMenuOpen.value = false;
	} catch (e) {
		console.error("Failed to opt out:", e);
		toast("Something went wrong. Please try again.", { color: "danger" });
	} finally {
		isOptingOut.value = false;
	}
}

function resetForm() {
	dislikeText.value = "";
	likeText.value = "";
	score.value = FeedbackOptions.empty;
}
</script>

<style scoped>

ion-modal {
  --width: fit-content;
  --min-width: 250px;
  --max-width: 80%;
  --height: fit-content;
  --border-radius: 6px;
  --box-shadow: 0 28px 48px rgba(0, 0, 0, 0.4);
  --backdrop-opacity: 0.4 !important;
}

</style>
