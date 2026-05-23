<template>
  <ion-modal
    :is-open="textEditMenuOpen"
    @will-present="willPresent"
    @did-dismiss="handleDismiss"
    :initial-breakpoint="1"
    :breakpoints="[0, 1]"
    handle-behavior="cycle"
    class="liquid-title-modal"
    @ionModalDidPresent="focusTextarea"
  >
    <div class="h-full flex flex-col p-5 bot-pad-safe bg-background overflow-hidden">

      <!-- Header -->
      <div class="shrink-0 pt-2 mb-6 text-center relative">
        <h1 class="text-3xl text-secondary font-black tracking-tighter italic leading-none">
          Edit Text
        </h1>
      </div>

      <!-- Textarea Area -->
      <div class="flex-1 px-1 pb-4">
        <textarea
          ref="textInput"
          v-model="localText"
          class="w-full h-full min-h-[200px] p-4 rounded-[2rem] border-2 border-primary/40 bg-white/80 shadow-inner text-lg font-medium resize-none focus:outline-none focus:border-secondary transition-colors"
          placeholder="Type your text here..."
        ></textarea>
      </div>

      <!-- Action Area -->
      <div class="pt-4 pb-2 shrink-0">
        <ion-button
          expand="block"
          color="secondary"
          shape="round"
          class="h-16 font-black uppercase tracking-widest shadow-lg"
          @click="confirmText"
        >
          Confirm
        </ion-button>
        <ion-button
          fill="clear"
          color="dark"
          expand="block"
          class="font-black uppercase tracking-widest text-xs mt-2 opacity-60"
          @click="handleDismiss"
        >
          Cancel
        </ion-button>
      </div>
    </div>
  </ion-modal>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { IonModal, IonButton } from '@ionic/vue'
import { useSelect } from '@/draw/store/tools/select.store'
import { useDrawStore } from '@/draw/store/draw.store'
import { IText } from 'fabric'
import { storeToRefs } from 'pinia'
import { useMenuStore } from '@/store/menu.store'
import { useDrawEventManager } from '@/draw/store/drawEventManager.store'


const localText = ref('')
let oldText = localText.value
const textInput = ref<HTMLTextAreaElement | null>(null)
const {unSelect} = useSelect()


const { selectedObjectsRef } = storeToRefs(useSelect())
const { getCanvas } = useDrawStore()
const {textEditMenuOpen} = storeToRefs(useMenuStore())

function willPresent(){
  if ( selectedObjectsRef.value.length === 1) {
    const textObj = selectedObjectsRef.value[0] as IText
    localText.value = textObj.text || ''
    oldText = textObj.text
  }
}

const focusTextarea = () => {
  if (textInput.value) {
    textInput.value.focus()
  }
}

const confirmText = () => {
  if (oldText == localText.value) {
    textEditMenuOpen.value = false
    if (localText.value === '') unSelect()
    return
  }
  if (selectedObjectsRef.value.length === 1) {
    const textObj = selectedObjectsRef.value[0] as IText
    const c = getCanvas()

    if (localText.value === ''){
        c.remove(textObj)
        c.fire("objectsDeleted", { target: [textObj] });
        unSelect()
        textEditMenuOpen.value = false
        return
    }

    textObj.set({ text: localText.value })

    if (textObj.init){
      textObj.init = false
      c.add(textObj)
      c.setActiveObject(textObj)
      c.clearContext(c.getTopContext())
      textObj._renderControls(c.getTopContext())
    }
    else {
      c.clearContext(c.getTopContext())
      textObj._renderControls(c.getTopContext())

      // @ts-ignore
      textObj._textBeforeEdit = oldText
      c?.fire('object:modified', { target: textObj })
    }

    textEditMenuOpen.value = false
  }
}

const handleDismiss = () => {
  textEditMenuOpen.value = false
  if (localText.value === ''){
    unSelect()
  }
}
</script>

<style scoped>
ion-modal.liquid-title-modal {
  --border-radius: 2.5rem 2.5rem 0 0;
  --height: auto;
  --max-height: 90vh;
  --background: var(--ion-color-tertiary);
}
ion-modal.liquid-title-modal::part(handle) {
  background: var(--ion-color-secondary);
  opacity: 0.3;
  width: 40px;
}
</style>