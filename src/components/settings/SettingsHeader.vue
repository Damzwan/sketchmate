<template>
  <ion-header class="ion-no-border">
    <ion-toolbar color="tertiary" v-if="!selectedMode">
      <ion-title v-if="props.title">{{ props.title }}</ion-title>
      <ion-buttons slot="end">
        <ion-button fill="clear" @click="() => (open = true)">
          <ion-avatar class="flex justify-center items-center w-[35px]"
            ><img :src="user?.img || localUserImg" alt="Profile picture" class="aspect-square"
          /></ion-avatar>
        </ion-button>
      </ion-buttons>
    </ion-toolbar>

    <ion-toolbar color="tertiary" v-else>
      <ion-buttons slot="start">
        <ion-button @click="emits('cancel')" size="large">
          <ion-icon slot="icon-only" :icon="svg(mdiClose)" />
        </ion-button>
        <p class="text-lg">
          {{ selectedItems.length }}
        </p>
      </ion-buttons>

      <ion-buttons slot="end">
        <ion-button @click="emits('delete')" size="large">
          <ion-icon slot="icon-only" :icon="svg(mdiDeleteOutline)" />
        </ion-button>
      </ion-buttons>
    </ion-toolbar>
  </ion-header>
  <Settings :presenting-element="presentingElement" v-model:open="open" v-if="user" />
</template>

<script lang="ts" setup>
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/store/app.store'
import { IonAvatar, IonButton, IonButtons, IonHeader, IonTitle, IonToolbar, IonIcon } from '@ionic/vue'
import Settings from '@/components/settings/Settings.vue'
import { ref } from 'vue'
import { svg } from '@/helper/general.helper'
import { mdiClose, mdiDeleteOutline } from '@mdi/js'

const open = ref(false)

const { user, localUserImg } = storeToRefs(useAppStore())
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
