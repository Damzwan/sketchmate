<template>
  <ion-page>
    <ion-nav :root="markRaw(LoginMainPage)" ref="nav" />
  </ion-page>
</template>

<script setup lang="ts">
import { IonNav, IonPage } from '@ionic/vue'
import { storeToRefs } from 'pinia'
import { useAuthStore } from '@/store/auth.store'
import { markRaw, ref, watch } from 'vue'
import LoginMainPage from '@/components/login/LoginMainPage.vue'
import LoginAccountCustomizationPage from '@/components/login/LoginAccountCustomizationPage.vue'
import LoginNotificationPage from '@/components/login/LoginNotificationPage.vue'
import { useNotificationStore } from '@/store/notification.store'

const { isNewAccount } = storeToRefs(useAuthStore())
const { showEnableNotificationsAfterLogin } = storeToRefs(useNotificationStore())
const nav = ref<any>()

watch(isNewAccount, () => {
  if (isNewAccount.value && nav.value) {
    nav.value.$el.push(markRaw(LoginAccountCustomizationPage))
  }
})

watch(showEnableNotificationsAfterLogin, () => {
  if (showEnableNotificationsAfterLogin.value && nav.value) {
    nav.value.$el.push(markRaw(LoginNotificationPage))
  }
})


</script>

<style scoped>

</style>