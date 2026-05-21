<template>
  <div class="w-full flex flex-col bottom-0">
    <ion-button fill="clear" color="secondary" @click="() => r.push(FRONTEND_ROUTES.moderation, masterAnimation)"
    >Report status
    </ion-button>
    <ion-button v-if="docs" fill="clear" color="secondary" :id="id">User Manual</ion-button>
    <DocsMenu :trigger="id" />
    <ion-button v-if="form" fill="clear" color="secondary" @click="openMenu(Menu.FeedbackMenu)"
    >Feedback
    </ion-button>
    <ion-button v-if="contact" fill="clear" color="secondary" :href="discord_link" target="_blank"
    >Contact
    </ion-button>
    <ion-button v-if="blog" fill="clear" color="secondary" href="https://sketchmate.ninja/blog/" target="_blank"
    >Blog
    </ion-button>
    <ion-button v-if="!isNative() && installPrompt && !isIOS()" fill="clear" color="secondary"
                @click="onInstallPWAClick"
    >Install SketchMate
    </ion-button>
    <ion-button v-if="showIosSafariInstructions()" fill="clear" color="secondary" :id="pwaInstructionId"
    >Install Sketchmate
    </ion-button
    >
    <ion-button v-if="form" fill="clear" color="secondary" @click="logoutHelper"
    >Logout
    </ion-button>
    <IosPwaInstructions :trigger="pwaInstructionId" v-if="showIosSafariInstructions()" />

    <ConfirmationAlert
      v-model:is-open="logoutWarningOpen"
      confirmationtext="Logout"
      header="Wait! Don't Lose Your Art"
      message="You're drawing as a guest. Logging out will delete your progress forever! Are you sure?"
      @confirm="logout"
    />
  </div>
</template>

<script lang="ts" setup>
import { v4 as uuidv4 } from "uuid";
import { IonButton, useIonRouter } from "@ionic/vue";
import { useAuthStore } from "@/store/auth.store";
import { storeToRefs } from "pinia";
import {
	installPWA,
	isIOS,
	isNative,
	showIosSafariInstructions,
} from "@/helper/general.helper";
import IosPwaInstructions from "@/components/general/IosPwaInstructions.vue";
import { useMenuStore } from "@/store/menu.store";
import { Menu } from "@/draw/types/draw.types";
import { discord_link } from "@/config/general.config";
import DocsMenu from "@/components/draw/menus/DocsMenu.vue";
import { useSessionStore } from "@/store/session.store";
import ConfirmationAlert from "@/components/general/ConfirmationAlert.vue";
import { ref } from "vue";
import { FRONTEND_ROUTES } from "@/types/router.types";
import { masterAnimation } from "@/helper/animation.helper";

const { installPrompt } = storeToRefs(useSessionStore());
const { logout } = useAuthStore();
const { firebaseUser } = storeToRefs(useAuthStore());

const { openMenu } = useMenuStore();

const r = useIonRouter();

const pwaInstructionId = uuidv4();
const logoutWarningOpen = ref(false);

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

const id = uuidv4();

function onInstallPWAClick() {
	installPWA(installPrompt);
}

function logoutHelper() {
	if (firebaseUser.value?.isAnonymous) logoutWarningOpen.value = true;
	else logout();
}
</script>

<style scoped>
@media screen and (max-height: 700px) {
  ion-button {
    height: 35px !important;
    min-height: 35px !important;
  }
}
</style>
