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
      label="Logout"
      tone="danger"
      @click="logoutHelper"
    />

    <IosPwaInstructions :trigger="pwaInstructionId" v-if="showIosSafariInstructions()" />

    <ConfirmationAlert
      v-model:is-open="logoutWarningOpen"
      confirmationtext="Logout"
      :header="isGuest ? `Wait! Don't Lose Your Art` : 'Log out?'"
      :message="isGuest
        ? `You're drawing as a guest. Logging out will delete your progress forever! Are you sure?`
        : `You'll need to sign back in to access your account.`"
      @confirm="logout"
    />
  </div>
</template>

<script lang="ts" setup>
import { v4 as uuidv4 } from "uuid";
import { IonIcon, useIonRouter } from "@ionic/vue";
import {
	mdiCellphoneArrowDown,
	mdiChevronRight,
	mdiEmailOutline,
	mdiFlagOutline,
	mdiPartyPopper,
	mdiLogoutVariant,
	mdiMessageStarOutline,
	mdiNewspaperVariantOutline,
	mdiOpenInNew,
} from "@mdi/js";
import { logoDiscord } from "ionicons/icons";
import { storeToRefs } from "pinia";
import { computed, ref } from "vue";
import { useAuthStore } from "@/store/auth.store";
import {
	installPWA,
	isIOS,
	isNative,
	showIosSafariInstructions,
	svg,
} from "@/helper/general.helper";
import IosPwaInstructions from "@/components/general/IosPwaInstructions.vue";
import SettingCard from "@/components/settings/SettingCard.vue";
import { useMenuStore } from "@/store/menu.store";
import { Menu } from "@/types/menu.types";
import { contact_mail, discord_link } from "@/config/general.config";
import { useSessionStore } from "@/store/session.store";
import ConfirmationAlert from "@/components/general/ConfirmationAlert.vue";
import { FRONTEND_ROUTES } from "@/types/router.types";
import { masterAnimation } from "@/helper/animation.helper";

const { installPrompt } = storeToRefs(useSessionStore());
const { logout } = useAuthStore();
const { firebaseUser } = storeToRefs(useAuthStore());

const { openMenu } = useMenuStore();

const r = useIonRouter();

const pwaInstructionId = uuidv4();
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
	logoutWarningOpen.value = true;
}
</script>
