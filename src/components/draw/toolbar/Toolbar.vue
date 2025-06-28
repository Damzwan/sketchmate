<template>
  <div class="w-full h-12 top-0 flex justify-center">
    <div class="w-full bg-primary h-full z-50 rounded-b-lg flex justify-center items-center">
      <div class="h-full w-full flex items-center">
        <div v-for="item in config.left" @click="onClick(item, $event)" :key="item.index" class="relative">
          <p v-if="item.type == 'title' " class="text-lg">{{ item.title }}</p>


          <div v-else-if="item.type =='button' &&  item.isVisibleCondition == undefined || item.isVisibleCondition">
            <div v-if="item.custom != undefined">
              <div class="w-[20px] h-[43px] text-center flex justify-center items-center"
                   v-if="item.custom == ToolbarCustomUI.multiSelectCount &&  multiSelectMode">
                <p class="text-xl">
                  {{ selectedObjectsRef.length }}
                </p>
              </div>

              <ion-button id="font" class="font_text" v-else-if="item.custom == ToolbarCustomUI.fontSelect && isText">
                <div class="flex justify-between w-full h-full items-center">
                  <p class="text-sm2 truncate" :style="{ fontFamily: selectedObjectsRef[0]['fontFamily'] }">{{
                      selectedObjectsRef[0]['fontFamily']
                    }}</p>
                  <ion-icon :icon="svg(mdiMenuSwapOutline)" />
                </div>
              </ion-button>
            </div>

            <ion-button fill="clear" :id="item.id" v-else :disabled="item.isDisabled" :data-step="item.tour_step"
                        :class="{ selected: item && item.tool != undefined && item.tools != undefined && item.tools.includes(selectedTool) }">
              <ion-icon slot="icon-only" :icon="svg(item.icon)" class="fill-black" />

            </ion-button>

            <div class="w-2 h-2 rounded-full absolute bottom-[13px] right-[10px]"
                 :style="{backgroundColor: brushColor}" v-if="item.id == ToolbarIds.pen" />

            <div class="selected_chevron"
                 v-if="item && item.tool != undefined && item.tools != undefined && item.tools.includes(selectedTool)">
              <ion-icon :icon="svg(mdiChevronDown)" class="w-[20px] h-[20px]" />
            </div>
          </div>
        </div>


      </div>

      <div class="w-1 h-3/4 bg-primary-shade mx-1 rounded" v-if="config.showDivider" />


      <div class="h-full w-full justify-end flex">
        <div v-for="item in config.right" @click="onClick(item, $event)" :key="item.index" class="relative">
          <p v-if="item.type == 'title' " class="text-lg">{{ item.title }}</p>


          <div v-else-if="item.type =='button' &&  item.isVisibleCondition == undefined || item.isVisibleCondition">
            <div v-if="item.custom != undefined">
              <div class="w-[20px] h-[43px] text-center flex justify-center items-center"
                   v-if="item.custom == ToolbarCustomUI.multiSelectCount &&  multiSelectMode">
                <p class="text-xl">
                  {{ selectedObjectsRef.length }}
                </p>
              </div>

              <ion-button id="font" class="font_text" v-else-if="item.custom == ToolbarCustomUI.fontSelect && isText">
                <div class="flex justify-between w-full h-full items-center">
                  <p class="text-sm2 truncate" :style="{ fontFamily: selectedObjectsRef[0]['fontFamily'] }">{{
                      selectedObjectsRef[0]['fontFamily']
                    }}</p>
                  <ion-icon :icon="svg(mdiMenuSwapOutline)" />
                </div>
              </ion-button>
            </div>

            <ion-button fill="clear" :id="item.id" v-else :disabled="item.isDisabled" :data-step="item.tour_step"
                        :class="{ selected: item && item.tool != undefined && item.tools != undefined && item.tools.includes(selectedTool) }">
              <ion-icon slot="icon-only" :icon="svg(item.icon)" class="fill-black" />
            </ion-button>

            <div class="selected_chevron"
                 v-if="item && item.tool != undefined && item.tools != undefined && item.tools.includes(selectedTool)">
              <ion-icon :icon="svg(mdiChevronDown)" class="w-[20px] h-[20px]" />
            </div>
          </div>
        </div>


      </div>
    </div>
  </div>
</template>


<script setup lang="ts">

import { ToolbarButton, ToolbarCustomUI, ToolbarIds, ToolbarSection } from '@/config/draw/toolbar.config'
import { svg } from '@/helper/general.helper'
import { IonButton, IonIcon } from '@ionic/vue'
import { useMenuStore } from '@/store/draw/menu.store'
import { useDrawStore } from '@/store/draw/draw.store'
import { mdiChevronDown, mdiMenuSwapOutline } from '@mdi/js'
import { DrawTool, ObjectType } from '@/types/draw.types'
import { storeToRefs } from 'pinia'
import { useSelect } from '@/service/draw/tools/select.tool'
import { computed } from 'vue'
import { usePen } from '@/service/draw/tools/pen.tool'

defineProps<{
  config: ToolbarSection,
  selectedTool: DrawTool
}>()

const { openMenu } = useMenuStore()
const { selectAction, selectTool } = useDrawStore()

const { selectedObjectsRef, multiSelectMode } = storeToRefs(useSelect())
const { brushColor } = storeToRefs(usePen())

const isText = computed(
  () => selectedObjectsRef.value.length == 1 && selectedObjectsRef.value[0].type == ObjectType.text
)

function onClick(item: ToolbarButton, e: any) {
  if (item.menu) openMenu(item.menu, e)
  else if (item.customAction) item.customAction()
  else if (item.action) selectAction(item.action)
  else if (item.tool != undefined && !!item.tools) {
    selectTool(item.tool, { openMenu: true, e })
  }
}
</script>

<style scoped>
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
  @apply cursor-pointer w-[20px] h-[20px] absolute right-[-5px] bottom-[15px];
}

.font_text {
  @apply border-[1px] border-black h-[36px] rounded w-10 md:w-20 lg:w-32 !important;
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