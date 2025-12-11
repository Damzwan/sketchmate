<template>
  <ion-popover
    :keepContentsMounted="true"
    :showBackdrop="false"
    :is-open="selectMenuOpen"
    :event="menuEvent"
    @didDismiss="() => (selectMenuOpen = false)"
  >
    <ion-content>
      <ion-list lines="none" class="divide-y divide-primary p-0">
        <ion-item color="tertiary" :button="true" :detail="true" @click="select(DrawTool.Select)">
          <ion-icon :icon="svg(mdiCursorDefaultClickOutline)" />
          <p class="pl-2 text-base">Select</p>
        </ion-item>

        <ion-item color="tertiary" :button="true" :detail="true" @click="select(DrawTool.Lasso)">
          <ion-icon :icon="svg(mdiLasso)" />
          <p class="pl-2 text-base">Lasso</p>
        </ion-item>
      </ion-list>
    </ion-content>
  </ion-popover>
</template>

<script lang="ts" setup>
import { svg } from '@/helper/general.helper'
import { mdiCursorDefaultClickOutline, mdiLasso } from '@mdi/js'
import { IonContent, IonIcon, IonItem, IonList, IonPopover, popoverController } from '@ionic/vue'
import { useMenuStore } from '@/store/menu.store'
import { storeToRefs } from 'pinia'
import { useDrawStore } from '@/draw/store/draw.store'
import { DrawTool, SelectTool } from '@/draw/types/draw.types'
import { useToolSelection } from '@/draw/store/tools/toolSelection.store'

const { selectMenuOpen, menuEvent } = storeToRefs(useMenuStore())
const { selectTool } = useToolSelection()

function select(tool: SelectTool) {
  selectTool(tool)
  popoverController.dismiss()
}
</script>

<style scoped>
ion-list {
  padding: 0;
}
</style>