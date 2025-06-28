<template>
  <ion-content class="bg-primary">
    <div class="w-full h-full flex flex-col justify-between items-center">
      <div class="py-4 px-6">
        <p class="cabin-sketch-regular text-4xl text-center">Let's create your profile</p>
        <ProfileCustomization />
      </div>
      <ion-nav-link router-direction="forward" :component="LoginNotificationPage">
        <ion-button shape="round" color="secondary" size="large" class="pb-12"
        >

          Continue
        </ion-button>
      </ion-nav-link>

    </div>

  </ion-content>
</template>

<script setup lang="ts">
import {
  IonButton,
  IonContent, IonNavLink
} from '@ionic/vue'
import ProfileCustomization from '@/components/account/ProfileCustomization.vue'
import LoginNotificationPage from '@/components/login/LoginNotificationPage.vue'

</script>

<style scoped>

</style>