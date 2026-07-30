<template>
  <BaseSheetModal
    :is-open="textEditMenuOpen"
    title="Edit Text"
    @close="handleDismiss"
  >
    <div class="space-y-6 animate-fade-in pt-1 pb-4">

      <div class="relative">
        <textarea
          ref="textInput"
          v-model="localText"
          class="w-full bg-white/50 border border-white rounded-[2rem] p-5 text-lg font-black text-black focus:outline-none focus:ring-2 focus:ring-secondary/50 transition-all min-h-[200px] resize-none"
          placeholder="Type your text here..."
        ></textarea>
      </div>

      <div class="pt-2">
        <ion-button
          expand="block"
          color="secondary"
          shape="round"
          size="large"
          @click="confirmText"
        >
          Confirm
        </ion-button>
      </div>

    </div>
  </BaseSheetModal>
</template>

<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import { IonButton } from '@ionic/vue'
import { useSelect } from '@/draw/tools/select.store'
import { useDrawStore } from '@/draw/session/draw.store'
import { IText } from 'fabric'
import { storeToRefs } from 'pinia'
import { useMenuStore } from '@/store/menu.store'
import BaseSheetModal from '@/components/general/BaseSheetModal.vue'

const localText = ref('')
let oldText = localText.value
const textInput = ref<HTMLTextAreaElement | null>(null)
const { unSelect } = useSelect()

const { selectedObjectsRef } = storeToRefs(useSelect())
const { getCanvas } = useDrawStore()
const { textEditMenuOpen } = storeToRefs(useMenuStore())

// Replaces Ionic's will-present/did-present to handle focus and setup
watch(textEditMenuOpen, async (isOpen) => {
  if (isOpen) {
    if (selectedObjectsRef.value.length === 1) {
      const textObj = selectedObjectsRef.value[0] as IText
      localText.value = textObj.text || ''
      oldText = textObj.text
    }

    // Allow DOM to update and modal to mount before focusing
    await nextTick()
    setTimeout(() => {
      if (textInput.value) {
        textInput.value.focus()
      }
    }, 150)
  }
})

const confirmText = () => {
  if (oldText == localText.value) {
    textEditMenuOpen.value = false
    if (localText.value === '') unSelect()
    return
  }
  if (selectedObjectsRef.value.length === 1) {
    const textObj = selectedObjectsRef.value[0] as IText
    const c = getCanvas()

    if (localText.value === '') {
      c.remove(textObj)
      c.fire("objectsDeleted", { target: [textObj] })
      unSelect()
      textEditMenuOpen.value = false
      return
    }

    textObj.set({ text: localText.value })
    // Recompute glyph metrics NOW so getBoundingRect is correct the moment the
    // object is indexed/baked — a stale ~0 rect would drop it from the tiles.
    textObj.initDimensions?.()
    textObj.setCoords()

    if (textObj.init) {
      textObj.init = false
      c.add(textObj)
      c.setActiveObject(textObj)
      c.clearContext(c.getTopContext())
      textObj._renderControls(c.getTopContext())
    } else {
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
  if (localText.value === '') {
    unSelect()
  }
}
</script>

<style scoped>
.animate-fade-in {
  animation: fadeIn 0.3s ease-out forwards;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

textarea {
  /* Applying the custom sketch font seen in your other inputs */
  font-family: 'cabin-sketch-regular', sans-serif;
}
</style>
