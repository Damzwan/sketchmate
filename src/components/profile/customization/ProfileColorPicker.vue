<template>
  <ion-modal
    :is-open="isOpen"
    @did-dismiss="handleDismiss"
    @ionModalWillPresent="initPicker"
    :initial-breakpoint="1"
    :breakpoints="[0, 1]"
    handle-behavior="cycle"
    class="liquid-color-modal"
  >
    <div class="h-full flex flex-col p-5 bot-pad-safe bg-background cabin-sketch-regular overflow-hidden">
      <!-- Header -->
      <div class="shrink-0 pt-2 mb-4 text-center relative">
        <h1 class="text-3xl text-secondary font-black tracking-tighter italic leading-none">
          {{ title || 'Studio Color' }}
        </h1>
      </div>

      <div class="flex-1 overflow-y-auto px-1 space-y-4 hide-scrollbar flex flex-col items-center pt-2">
        <!-- LIVE PREVIEW CARD -->
        <div class="w-full h-16 rounded-3xl border-4 border-white shadow-md flex items-center justify-center transition-colors duration-200 shrink-0 relative overflow-hidden">
          <div class="absolute inset-0 opacity-10" style="background-image: repeating-conic-gradient(#000 0% 25%, #fff 0% 50%); background-size: 10px 10px;"></div>
          <div class="absolute inset-0" :style="{ backgroundColor: localColor }"></div>
          <span class="relative z-10 px-4 py-1 bg-black/20 backdrop-blur-md rounded-full text-white font-black text-[10px] uppercase tracking-widest">
            {{ localColor }}
          </span>
        </div>

        <!-- THE PICKER (Now with a smooth fade-in) -->
        <div
          ref="pickerContainer"
          class="shrink-0 drop-shadow-2xl py-2 transition-opacity duration-500"
          :class="pickerReady ? 'opacity-100' : 'opacity-0'"
        ></div>

        <!-- QUICK SWATCHES -->
        <div class="w-full">
          <h4 class="text-[9px] font-black uppercase tracking-widest text-black/30 mb-3 text-center">Artist Palette</h4>
          <div class="flex gap-3 justify-center flex-wrap">
            <button
              v-for="swatch in ['#18181b', '#ffffff', '#ff512f', '#4a00e0', '#22c55e', '#ff00bd']"
              :key="swatch"
              class="w-9 h-9 rounded-xl border-2 border-white shadow-sm active:scale-90 transition-transform"
              :style="{ backgroundColor: swatch }"
              @click="setFromSwatch(swatch)"
            ></button>
          </div>
        </div>
      </div>

      <div class="pt-4 pb-2 shrink-0">
        <ion-button expand="block" color="secondary" shape="round" class="h-16 font-black uppercase tracking-widest shadow-lg" @click="confirmSelection">
          Confirm Color
        </ion-button>
        <ion-button fill="clear" color="dark" expand="block" class="font-black uppercase tracking-widest text-xs mt-2 opacity-60" @click="handleDismiss">
          Cancel
        </ion-button>
      </div>
    </div>
  </ion-modal>
</template>

<script setup lang="ts">
import { ref, watch, shallowRef, nextTick } from 'vue'
import { IonModal, IonButton } from '@ionic/vue'
import iro from '@jaames/iro'

const props = defineProps<{ isOpen: boolean, currentColor: string, title: string }>()
const emit = defineEmits(['close', 'save'])

const localColor = ref(props.currentColor)
const pickerContainer = ref<HTMLElement | null>(null)
const colorPicker = shallowRef<any>(null)
const pickerReady = ref(false) // Controls the fade-in

const initPicker = async () => {
  pickerReady.value = false

  // Wait for the modal DOM to exist
  await nextTick()
  if (!pickerContainer.value) return

  // Clean slate
  pickerContainer.value.innerHTML = ''
  if (colorPicker.value) {
    colorPicker.value.off('color:change', onColorChange)
  }

  const IroPicker = (iro as any).ColorPicker

  colorPicker.value = new IroPicker(pickerContainer.value, {
    width: 210, // Slightly smaller for better layout
    color: props.currentColor,
    borderWidth: 4,
    borderColor: '#ffffff',
    layout: [
      { component: (iro as any).ui.Wheel },
      { component: (iro as any).ui.Slider, options: { sliderType: 'value', margin: 15 } },
      { component: (iro as any).ui.Slider, options: { sliderType: 'alpha', margin: 15 } }
    ]
  })

  colorPicker.value.on('color:change', onColorChange)

  // Fade in slightly after mount to hide the "pop"
  setTimeout(() => {
    pickerReady.value = true
  }, 100)
}

const onColorChange = (color: any) => {
  if (color.alpha < 0.2) color.alpha = 0.2
  localColor.value = color.hex8String
}

const setFromSwatch = (hex: string) => {
  localColor.value = hex
  if (colorPicker.value) {
    colorPicker.value.color.hexString = hex
    colorPicker.value.color.alpha = 1
  }
}

const confirmSelection = () => {
  emit('save', localColor.value)
  handleDismiss()
}

const handleDismiss = () => {
  pickerReady.value = false
  if (colorPicker.value) {
    colorPicker.value.off('color:change', onColorChange)
  }
  emit('close')
}

watch(() => props.isOpen, (open) => {
  if (open) localColor.value = props.currentColor
})
</script>

<style scoped>
ion-modal.liquid-color-modal {
  --border-radius: 2.5rem 2.5rem 0 0;
  --background: var(--ion-color-tertiary);
  --height: auto;
  --max-height: 92vh;
}

/* Ensure the modal handle looks nice */
ion-modal.liquid-color-modal::part(handle) {
  background: var(--ion-color-secondary);
  opacity: 0.3;
  width: 40px;
}

.hide-scrollbar::-webkit-scrollbar { display: none; }

:deep(.IroSliderHandle), :deep(.IroHandle) {
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.2) !important;
  border: 3px solid white !important;
}
</style>