<template>
  <ion-header class="ion-no-border" v-if="user">
    <ion-toolbar color="tertiary">
      <ion-title v-if="props.title">{{ props.title }}</ion-title>
      <ion-buttons slot="end">
        <ion-button fill="clear" @click="() => (open = true)">
          <ion-avatar class="flex justify-center items-center w-[35px]"
            ><img :src="user.img" alt="" class="aspect-square"
          /></ion-avatar>
        </ion-button>
      </ion-buttons>
    </ion-toolbar>
  </ion-header>
  <Settings :presenting-element="presentingElement" v-model:open="open" />
</template>

<script lang="ts" setup>
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/store/app.store'
import { IonAvatar, IonButton, IonButtons, IonHeader, IonTitle, IonToolbar } from '@ionic/vue'
import Settings from '@/components/settings/Settings.vue'
import { ref } from 'vue'

const open = ref(false)

const { user } = storeToRefs(useAppStore())
// const {goTo} = useRouterService()
const props = defineProps({
  title: {
    type: String,
    required: false
  },
  presentingElement: {
    type: HTMLElement,
    required: false
  }
})
</script>

<style scoped>
ion-avatar {
  width: 32px;
  height: 32px;
}
</style>
