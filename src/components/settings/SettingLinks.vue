<template>
  <div class="w-full flex flex-col gap-2 cabin-sketch-regular">

    <!-- Report status -->
    <SettingCard
      v-if="form"
      :icon="mdiFlagOutline"
      label="Report status"
      @click="() => r.push(FRONTEND_ROUTES.moderation, masterAnimation)"
    >
      <template #trailing>
        <ion-icon :icon="svg(mdiChevronRight)" class="text-xl text-black/30" />
      </template>
    </SettingCard>

    <SettingCard
      v-if="form"
      :icon="mdiPartyPopper"
      label="What's New"
      @click="useMenuStore().isWhatsNewOpen = true"
    >
      <template #trailing>
        <ion-icon :icon="svg(mdiChevronRight)" class="text-xl text-black/30" />
      </template>
    </SettingCard>

    <!-- Feedback -->
    <SettingCard
      v-if="form"
      :icon="mdiMessageStarOutline"
      label="Feedback"
      @click="openMenu(Menu.FeedbackMenu)"
    >
      <template #trailing>
        <ion-icon :icon="svg(mdiChevronRight)" class="text-xl text-black/30" />
      </template>
    </SettingCard>

    <!-- Contact: email -->
    <SettingCard
      v-if="contact"
      :icon="mdiEmailOutline"
      label="Email me"
      :sublabel="contact_mail"
      :href="`mailto:${contact_mail}`"
    >
      <template #trailing>
        <ion-icon :icon="svg(mdiChevronRight)" class="text-xl text-black/30" />
      </template>
    </SettingCard>

    <!-- Contact: discord -->
    <SettingCard
      v-if="contact"
      :icon="logoDiscord"
      raw-icon
      label="Discord community"
      :href="discord_link"
    >
      <template #trailing>
        <ion-icon :icon="svg(mdiOpenInNew)" class="text-lg text-black/30" />
      </template>
    </SettingCard>

    <!-- Blog -->
    <SettingCard
      v-if="blog"
      :icon="mdiNewspaperVariantOutline"
      label="Blog"
      href="https://sketchmate.ninja/blog/"
    >
      <template #trailing>
        <ion-icon :icon="svg(mdiOpenInNew)" class="text-lg text-black/30" />
      </template>
    </SettingCard>

    <!-- Install PWA -->
    <SettingCard
      v-if="!isNative() && installPrompt && !isIOS()"
      :icon="mdiCellphoneArrowDown"
      label="Install SketchMate"
      @click="onInstallPWAClick"
    >
      <template #trailing>
        <ion-icon :icon="svg(mdiChevronRight)" class="text-xl text-black/30" />
      </template>
    </SettingCard>

    <SettingCard
      v-if="showIosSafariInstructions()"
      :id="pwaInstructionId"
      :icon="mdiCellphoneArrowDown"
      label="Install SketchMate"
    >
      <template #trailing>
        <ion-icon :icon="svg(mdiChevronRight)" class="text-xl text-black/30" />
      </template>
    </SettingCard>

    <!-- Logout -->
    <SettingCard
      v-if="form"
      :icon="mdiLogoutVariant"
      :label="isGuest ? 'Protect guest account' : 'Logout'"
      :tone="isGuest ? undefined : 'danger'"
      @click="logoutHelper"
    />

    <IosPwaInstructions :trigger="pwaInstructionId" v-if="showIosSafariInstructions()" />
    <UpgradeAccountModal :trigger="guestProtectionTriggerId" />

    <ConfirmationAlert
      v-model:is-open="logoutWarningOpen"
      confirmationtext="Logout"
      header="Log out?"
      message="You'll need to sign back in to access your account."
      @confirm="logout"
    />
  </div>
</template>

<script lang="ts" setup>
import { IonIcon, useIonRouter } from "@ionic/vue";
import {
	mdiCellphoneArrowDown,
	mdiChevronRight,
	mdiEmailOutline,
	mdiFlagOutline,
	mdiLogoutVariant,
	mdiMessageStarOutline,
	mdiNewspaperVariantOutline,
	mdiOpenInNew,
	mdiPartyPopper,
} from "@mdi/js";
import { logoDiscord } from "ionicons/icons";
import { storeToRefs } from "pinia";
import { computed, ref } from "vue";
import ConfirmationAlert from "@/components/general/ConfirmationAlert.vue";
import IosPwaInstructions from "@/components/general/IosPwaInstructions.vue";
import SettingCard from "@/components/settings/SettingCard.vue";
import UpgradeAccountModal from "@/components/settings/UpgradeAccountModal.vue";
import { contact_mail, discord_link } from "@/config/general.config";
import { masterAnimation } from "@/helper/animation.helper";
import { installPWA, svg } from "@/helper/general.helper";
import {
	isIOS,
	isNative,
	showIosSafariInstructions,
} from "@/helper/platform.helper";
import { useAuthStore } from "@/store/auth.store";
import { useMenuStore } from "@/store/menu.store";
import { useSessionStore } from "@/store/session.store";
import { Menu } from "@/types/menu.types";
import { FRONTEND_ROUTES } from "@/types/router.types";
import { uuidv4 } from "@/utils/uuid";

const { installPrompt } = storeToRefs(useSessionStore());
const { logout } = useAuthStore();
const { firebaseUser } = storeToRefs(useAuthStore());

const { openMenu } = useMenuStore();

const r = useIonRouter();

const pwaInstructionId = uuidv4();
const guestProtectionTriggerId = uuidv4();
const logoutWarningOpen = ref(false);

const isGuest = computed(() => !!firebaseUser.value?.isAnonymous);

export interface Props {
	docs?: boolean;
	form?: boolean;
	blog?: boolean;
	contact?: boolean;
}

withDefaults(defineProps<Props>(), {
	docs: true,
	form: true,
	blog: true,
	contact: true,
});

function onInstallPWAClick() {
	installPWA(installPrompt);
}

function logoutHelper() {
	// Anonymous Firebase credentials cannot be recreated after sign-out. Do not
	// offer a destructive action for a guest; take them straight to the flow
	// that upgrades this exact Firebase identity instead.
	if (isGuest.value) {
		document.getElementById(guestProtectionTriggerId)?.click();
		return;
	}
	logoutWarningOpen.value = true;
}
</script>
