<template>
  <VTour :steps="tutorialSteps" ref="tour" :autoStart="true" />

  <transition name="slide">
    <div
      class="w-[300px] absolute top-[50px] right-2 bg-primary z-10 rounded-md p-3 text-black"
      v-show="showTipBox"
      ref="tooltip"
    >
      <div class="flex justify-between">
        <p class="text-xl font-semibold">{{ tipBoxTitle }}</p>
        <ion-icon :icon="svg(mdiClose)" class="w-5 h-5 cursor-pointer" @click="clearTip" />
      </div>
      <p class="text-base">{{ tipBoxContent }}</p>
    </div>
  </transition>
</template>

<script setup lang="ts">

import { svg } from '@/helper/general.helper'
import { mdiClose } from '@mdi/js'
import { IonIcon } from '@ionic/vue'
import { tutorialSteps } from '@/draw/config/tutorial.config'
import { VTour } from '@globalhive/vuejs-tour'
import { ref, watch } from 'vue'
import { useSwipe } from '@vueuse/core/index'
import { LocalStorage } from '@/types/storage.types'
import { DrawTool } from '@/draw/types/draw.types'
import { useDrawStore } from '@/draw/store/draw.store'
import { useSelect } from '@/draw/store/tools/select.store'
import { storeToRefs } from 'pinia'

const drawStore = useDrawStore()
const { selectedTool } = storeToRefs(drawStore)
const { selectedObjectsRef } = storeToRefs(useSelect())

const showTipBox = ref(false)
const tipBoxTitle = ref('')


const tipBoxContent = ref('')

let didShowEnterSelectTip = false
let didShowSelectTip = false
let didShowMultiSelectTip = false
let hideTipTimeout: any = undefined

const tooltip = ref()
useSwipe(tooltip, {
  onSwipeEnd() {
    clearTip()
  }
})

function showTip(content: string, title = 'Tip', duration = 8000) {
  clearTimeout(hideTipTimeout)
  showTipBox.value = true
  tipBoxContent.value = content
  tipBoxTitle.value = title
  hideTipTimeout = setTimeout(() => (showTipBox.value = false), duration)
}

function clearTip() {
  clearTimeout(hideTipTimeout)
  hideTipTimeout = undefined
  showTipBox.value = false
}


if (!localStorage.getItem(LocalStorage.selectTip)) localStorage.setItem(LocalStorage.selectTip, '2')
if (parseInt(localStorage.getItem(LocalStorage.selectTip)!) > 0) {
  watch(selectedObjectsRef, () => {
    if (didShowSelectTip || parseInt(localStorage.getItem(LocalStorage.selectTip)!) == 0) return
    if (selectedObjectsRef.value.length > 0) {
      showTip(
        'Move, rotate, scale objects and more! Exit by tapping outside or pressing the \'X\' in the upper left.',
        'Select Mode',
        10000
      )
      localStorage.setItem(LocalStorage.selectTip, `${parseInt(localStorage.getItem(LocalStorage.selectTip)!) - 1}`)
      didShowSelectTip = true
    }
  })
}

if (!localStorage.getItem(LocalStorage.selectHint)) localStorage.setItem(LocalStorage.selectHint, '2')
if (parseInt(localStorage.getItem(LocalStorage.selectHint)!) > 0) {
  watch(selectedTool, () => {
    if (didShowEnterSelectTip || parseInt(localStorage.getItem(LocalStorage.selectHint)!) == 0) return
    if (selectedTool.value == DrawTool.Select)
      if (drawStore.getCanvas().getObjects().length > 0) {
        showTip('Tap on an object to select it')
        localStorage.setItem(LocalStorage.selectHint, `${parseInt(localStorage.getItem(LocalStorage.selectHint)!) - 1}`)
        didShowEnterSelectTip = true
      } else {
        showTip('Create an object before you can select it')
      }
  })
}

let t1: any
if (!localStorage.getItem(LocalStorage.multiSelectHint)) localStorage.setItem(LocalStorage.multiSelectHint, '2')
if (parseInt(localStorage.getItem(LocalStorage.multiSelectHint)!) > 0) {
  clearTimeout(t1)
  watch(selectedObjectsRef, () => {
    if (didShowMultiSelectTip || parseInt(localStorage.getItem(LocalStorage.multiSelectHint)!) == 0) return
    if (selectedObjectsRef.value.length == 1 && drawStore.getCanvas().getObjects().length > 1 && !showTipBox.value) {
      t1 = setTimeout(() => {
        // if (showTipBox.value) return
        // if (isMobile()) showTip('Long tap object to enter multi select mode')
        // else showTip('Hold shift while tapping on an object to multi select')
        // localStorage.setItem(
        //   LocalStorage.multiSelectHint,
        //   `${parseInt(localStorage.getItem(LocalStorage.multiSelectHint)!) - 1}`
        // )
        // didShowMultiSelectTip = true
      }, 50)
    }
  })
}


</script>


<style scoped>
/* Starting state (entering) */
.slide-enter-active,
.slide-leave-active {
  transition: opacity 0.5s ease, transform 0.5s ease;
}

.slide-enter-from {
  opacity: 0;
  transform: translateX(-20px);
}

/* Enter end state */
.slide-enter-to {
  opacity: 1;
  transform: translateX(0);
}

/* Leave start state */
.slide-leave-from {
  opacity: 1;
  transform: translateX(0);
}

/* Leave end state */
.slide-leave-to {
  opacity: 0;
  transform: translateX(20px);
}
</style>