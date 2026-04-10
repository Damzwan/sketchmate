<template>
  <div v-for="(item, index) in toolbarItems" @click="item.type == 'button' ? onClick(item, $event) : null"
       :key="`l-${index}`" class="relative">
    <p v-if="item.type == 'title' " class="text-lg text-black cabin-sketch-regular">{{ item.title }}</p>


    <div v-else-if="item.type =='button' &&  item.isVisibleCondition == undefined || item.isVisibleCondition"  :data-step="item.tour_step">
      <div v-if="item.custom != undefined">
        <div class="w-5 h-[43px] text-center flex justify-center items-center"
             v-if="item.custom == ToolbarCustomUI.multiSelectCount &&  multiSelectMode">
          <p class="text-xl">
            {{ selectedObjectsRef.length }}
          </p>
        </div>

        <ion-button id="font" class="font_text" v-else-if="item.custom == ToolbarCustomUI.fontSelect && isText">
          <div class="flex justify-between w-full h-full items-center">
            <p class="text-sm2 truncate" :style="{ fontFamily: fontFamily }">{{
                fontFamily
              }}</p>
            <ion-icon :icon="svg(mdiMenuSwapOutline)" />
          </div>
        </ion-button>
      </div>

      <ion-button fill="clear" :id="item.isDisabled ? null : item.id" v-else :disabled="item.isDisabled"
                  :class="{ selected: item && item.isActive || (item.tool != undefined && item.tools != undefined && item.tools.includes(selectedTool) )}">
        <ion-icon slot="icon-only" :icon="svg(item.icon)" class="fill-black" />

      </ion-button>

      <p class="absolute bottom-0.75 -right-0.5 text-xl cabin-sketch-regular text-black" v-if="item.badge">
        {{ item.badge }}
      </p>

      <div class="w-2 h-2 rounded-full absolute bottom-2.5 right-2.5"
           :style="{backgroundColor: brushColor}" v-if="item.id == ToolbarIds.pen" />

      <div class="selected_chevron"
           v-if="item && item.tool != undefined && item.tools != undefined && item.tools.includes(selectedTool)">
        <ion-icon :icon="svg(mdiChevronDown)" class="w-5 h-5 fill-black" />
      </div>


    </div>
  </div>

</template>


<script setup lang="ts">

import { ToolbarButton, ToolbarCustomUI, ToolbarIds, ToolbarItem, ToolbarSection } from '@/draw/config/toolbar.config'
import { svg } from '@/helper/general.helper'
import { IonButton, IonIcon } from '@ionic/vue'
import { useMenuStore } from '@/store/menu.store'
import { useDrawStore } from '@/draw/store/draw.store'
import { mdiChevronDown, mdiMenuSwapOutline } from '@mdi/js'
import { DrawTool, ObjectType } from '@/draw/types/draw.types'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { usePen } from '@/draw/store/tools/pen.store'
import { useSelect } from '@/draw/store/tools/select.store'
import { useToolSelection } from '@/draw/store/tools/toolSelection.store'

defineProps<{
  toolbarItems: ToolbarItem[]
}>()

const { openMenu } = useMenuStore()
const { selectTool } = useToolSelection()
const { selectAction } = useDrawStore()
const { selectedTool } = storeToRefs(useToolSelection())

const { selectedObjectsRef, multiSelectMode } = storeToRefs(useSelect())
const { brushColor } = storeToRefs(usePen())

const isText = computed(
  () => selectedObjectsRef.value.length == 1 && selectedObjectsRef.value[0].type == ObjectType.text
)

const fontFamily = computed(() => selectedObjectsRef.value[0] ? selectedObjectsRef.value[0]['fontFamily'] as string : undefined)

function onClick(item: ToolbarButton, e: any) {
  if (item.isDisabled) {
    return
  }
  if (item.menu) openMenu(item.menu, e)
  else if (item.customAction) item.customAction()
  else if (item.action) selectAction(item.action, undefined)
  else if (item.tool != undefined && !!item.tools) {
    selectTool(item.tool, { openMenu: true, e })
  }
}
</script>
<style scoped>
@reference "@/theme/main.css";
.selected::after {
  content: '';
  display: block;
  position: relative;
  bottom: 3px;
  left: 10%;
  width: 80%;
  height: 3px;
  background-color: var(--ion-color-secondary);
}

.selected_chevron {
  @apply cursor-pointer w-5 h-5 absolute right-[-5px] bottom-[15px];
}

.font_text {
  @apply border border-black h-9 rounded w-10 md:w-20 lg:w-32
}

.font_text::part(native) {
  padding: 0 !important;
}

.font_text ion-icon {
  width: 20px !important;
  height: 20px !important;
  color: black;
}
</style>