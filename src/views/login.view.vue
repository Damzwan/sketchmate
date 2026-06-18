<template>
  <ion-page>
    <ion-nav :root="markRaw(LoginMainPage)" ref="nav" />
  </ion-page>
</template>

<script setup lang="ts">
import { IonNav, IonPage, useIonRouter } from "@ionic/vue";
import { storeToRefs } from "pinia";
import { useAuthStore } from "@/store/auth.store";
import { markRaw, ref, watch } from "vue";
import LoginMainPage from "@/components/login/LoginMainPage.vue";
import LoginAccountCustomizationPage from "@/components/login/LoginAccountCustomizationPage.vue";
import LoginNotificationPage from "@/components/login/LoginNotificationPage.vue";
import { useNotificationStore } from "@/store/notification.store";
import { isNative } from "@/helper/general.helper";
import { FRONTEND_ROUTES } from "@/types/router.types";

const { isNewAccount } = storeToRefs(useAuthStore());
const { showEnableNotificationsAfterLogin } = storeToRefs(
	useNotificationStore(),
);
const nav = ref<any>();

watch(isNewAccount, () => {
	if (isNewAccount.value && nav.value) {
		nav.value.$el.push(markRaw(LoginAccountCustomizationPage));
	}
});

const ionRouter = useIonRouter();
watch(showEnableNotificationsAfterLogin, () => {
	if (
		showEnableNotificationsAfterLogin.value &&
		nav.value &&
		!isNewAccount.value
	) {
		if (isNative()) {
			nav.value.$el.push(markRaw(LoginNotificationPage));
		} else {
			ionRouter.push(FRONTEND_ROUTES.home);
		}
	}
});
</script>

<style scoped>

</style>