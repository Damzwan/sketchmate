<template>
  <ion-header class="ion-no-border">
    <ion-toolbar color="tertiary" v-if="!selectedMode" class="shadow px-2">
      <ion-title v-if="props.title">{{ props.title }}</ion-title>
      <ion-buttons slot="end">
        <ion-button @click="() => openMenu(Menu.FeedbackMenu)" size="large">
          <ion-icon slot="icon-only" :icon="svg(mdiMessageAlertOutline)" />
        </ion-button>

        <ion-button fill="clear" @click="() => (open = true)">
          <ion-avatar class="flex justify-center items-center w-[35px]"
          ><img :src="user?.img || localUserImg" alt="Profile picture" class="aspect-square"
          /></ion-avatar>
        </ion-button>
      </ion-buttons>
    </ion-toolbar>

    <ion-toolbar color="tertiary" v-else class="shadow">
      <ion-buttons slot="start">
        <ion-button @click="emits('cancel')" size="large">
          <ion-icon slot="icon-only" :icon="svg(mdiClose)" />
        </ion-button>
        <p class="text-lg">
          {{ selectedItems.length }}
        </p>
      </ion-buttons>

      <ion-buttons slot="end">
        <ion-button @click="emits('delete')" size="large" v-if="selectedItems?.length > 0">
          <ion-icon slot="icon-only" :icon="svg(mdiDeleteOutline)" />
        </ion-button>
      </ion-buttons>
    </ion-toolbar>
  </ion-header>
  <Settings :presenting-element="presentingElement" v-model:open="open" v-if="user" />
</template>

<script lang="ts" setup>
import { storeToRefs } from 'pinia'
import { useAuthStore } from '@/store/auth.store'
import { IonAvatar, IonButton, IonButtons, IonHeader, IonIcon, IonTitle, IonToolbar } from '@ionic/vue'
import Settings from '@/components/settings/Settings.vue'
import { ref } from 'vue'
import { svg } from '@/helper/general.helper'
import { mdiClose, mdiDeleteOutline, mdiMessageAlertOutline } from '@mdi/js'
import { useMenuStore } from '@/store/draw/menu.store'
import { Menu } from '@/types/draw.types'

const open = ref(false)

const { openMenu } = useMenuStore()

const { user, localUserImg } = storeToRefs(useAuthStore())
// const {goTo} = useRouterService()
const props = defineProps({
  title: {
    type: String,
    required: false
  },
  presentingElement: {
    type: HTMLElement,
    required: false
  },
  selectedItems: {
    type: Array<string>,
    required: false
  },
  selectedMode: {
    type: Boolean,
    required: false
  }
})
const emits = defineEmits(['cancel', 'delete'])
</script>

<style scoped>
ion-avatar {
  width: 32px;
  height: 32px;
}
</style>
