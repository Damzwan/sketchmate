<template>
  <ion-page class="slide-page">
    <ion-nav ref="navRef" :root="DrawMain" :animation="slideTransition" />
  </ion-page>
</template>

<script setup lang="ts">
import {
	IonNav,
	IonPage,
	onIonViewDidLeave,
	onIonViewWillLeave,
	useBackButton,
} from "@ionic/vue";
import { ref } from "vue";
import DrawMain from "@/components/draw/DrawMain.vue";
import { useDrawStore } from "@/draw/session/draw.store";
import { performRoomExit } from "@/draw/sync/syncStatus";
import { slideTransition } from "@/helper/animation.helper";

const navRef = ref<InstanceType<typeof IonNav> | null>(null);

useBackButton(10, async (processNextHandler) => {
	const nav = navRef.value?.$el;
	if (nav) {
		const canGoBack = await nav.canGoBack();

		if (canGoBack) {
			await nav.pop();
		} else {
			processNextHandler();
		}
	} else {
		processNextHandler();
	}
});

onIonViewWillLeave(() => {
	performRoomExit();
});

// Ionic may retain a page instance after navigation. DrawMain normally performs
// this teardown on unmount; this hook is the cache-safe final backstop.
onIonViewDidLeave(() => {
	useDrawStore().disposeSession();
});
</script>
