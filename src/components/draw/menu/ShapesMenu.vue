<template>
  <ion-popover :is-open="shapesMenuOpen" side="left" @willDismiss="shapesMenuOpen = false" :event="menuEvent">
    <ion-content>
      <ion-list lines="none" class="divide-y divide-primary p-0">
        <ion-item color="tertiary" :button="true" @click="addShape(Shape.Circle)">
          <ion-icon :icon="svg(mdiCircleOutline)" />
          <p class="pl-2 text-base">Circle</p>
        </ion-item>

        <ion-item color="tertiary" :button="true" @click="addShape(Shape.Ellipse)">
          <ion-icon :icon="svg(mdiEllipseOutline)" />
          <p class="pl-2 text-base">Ellipse</p>
        </ion-item>

        <ion-item color="tertiary" :button="true" @click="addShape(Shape.Rectangle)">
          <ion-icon :icon="svg(mdiRectangleOutline)" />
          <p class="pl-2 text-base">Rectangle</p>
        </ion-item>

        <ion-item color="tertiary" :button="true" @click="addShape(Shape.Triangle)">
          <ion-icon :icon="svg(mdiTriangleOutline)" />
          <p class="pl-2 text-base">Triangle</p>
        </ion-item>

        <ion-item color="tertiary" :button="true" @click="addShape(Shape.Line)">
          <ion-icon :icon="svg(mdiVectorLine)" />
          <p class="pl-2 text-base">Line</p>
        </ion-item>

        <ion-item color="tertiary" :button="true" @click="addShape(Shape.Polyline)">
          <ion-icon :icon="svg(mdiVectorBezier)" />
          <p class="pl-2 text-base">Polyline</p>
        </ion-item>

        <ion-item color="tertiary" :button="true" @click="addShape(Shape.Polygon)">
          <ion-icon :icon="svg(mdiVectorPolygon)" />
          <p class="pl-2 text-base">Polygon</p>
        </ion-item>
      </ion-list>
    </ion-content>
  </ion-popover>
</template>

<script lang="ts" setup>
import { IonContent, IonIcon, IonItem, IonList, IonPopover, popoverController } from '@ionic/vue'
import { svg } from '@/helper/general.helper'
import {
  mdiCircleOutline,
  mdiEllipseOutline,
  mdiRectangleOutline,
  mdiTriangleOutline,
  mdiVectorBezier,
  mdiVectorLine,
  mdiVectorPolygon
} from '@mdi/js'
import { DrawAction, Shape } from '@/types/draw.types'
import { useDrawStore } from '@/store/draw/draw.store'
import { storeToRefs } from 'pinia'
import { useMenuStore } from '@/store/draw/menu.store'

const { selectAction } = useDrawStore()
const { shapesMenuOpen, menuEvent } = storeToRefs(useMenuStore())

function addShape(shape: Shape) {
  selectAction(DrawAction.AddShape, { shape: shape })
  closePopover()
}

function closePopover() {
  return popoverController.dismiss()
}
</script>

<style scoped></style>
