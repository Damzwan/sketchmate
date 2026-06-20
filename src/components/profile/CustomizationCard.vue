<template>
  <div
    class="bg-white/60 backdrop-blur-3xl border-2 border-secondary/30 rounded-[2.5rem] shadow-sm transition-all duration-500"
  >
    <!-- Header / Toggle -->
    <div
      class="flex items-center justify-between p-5 cursor-pointer active:bg-secondary/5 transition-colors rounded-[2.5rem]"
      @click="isOpen = !isOpen"
    >
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-2xl bg-secondary/10 flex items-center justify-center">
          <ion-icon :icon="svg(mdiPalette)" class="text-xl text-secondary" />
        </div>
        <div>
          <h3 class="text-sm font-black uppercase tracking-widest text-black/80">Pro Studio</h3>
          <p class="text-[10px] font-bold text-black/40 uppercase tracking-widest mt-0.5">
            Colors · Fonts · Signature
          </p>
        </div>
      </div>
      <ion-icon :icon="svg(isOpen ? mdiChevronUp : mdiChevronDown)" class="text-2xl text-black/40" />
    </div>

    <transition name="accordion">
      <div v-show="isOpen" class="border-t-2 border-secondary/10 overflow-hidden">
        <div class="p-5 space-y-8">

          <!-- ① Title & Signature -->
          <div class="grid grid-cols-2 gap-3">
            <button
              class="bg-white border-2 border-secondary/20 rounded-2xl p-4 flex flex-col items-center justify-center gap-1 active:scale-95 transition-all"
              @click="$emit('open-titles')"
            >
              <span class="text-[9px] font-black uppercase tracking-widest text-black/40">Title</span>
              <span class="text-sm font-black text-secondary truncate max-w-full">
                {{ resolveTitle(draft.titleId) || '+ Select' }}
              </span>
            </button>

            <button
              class="bg-white border-2 border-secondary/20 rounded-2xl p-4 flex flex-col items-center justify-center gap-1 active:scale-95 transition-all"
              @click="$emit('open-signature')"
            >
              <span class="text-[9px] font-black uppercase tracking-widest text-black/40">Signature</span>
              <svg
                v-if="draft.signaturePath"
                class="w-16 h-8"
                :viewBox="draft.signatureViewBox || '0 0 300 150'"
                preserveAspectRatio="xMidYMid meet"
              >
                <path
                  :d="draft.signaturePath"
                  fill="none"
                  :stroke="draft.signatureColor || '#18181b'"
                  stroke-width="8"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
              <span v-else class="text-sm font-black text-black/50">✍️ Draw</span>
            </button>
          </div>

          <!-- ② Color Palette (Updated with Custom Picker) -->
          <div>
            <h4 class="text-[10px] font-black uppercase tracking-widest text-black/40 mb-4">Color Palette</h4>
            <div class="grid grid-cols-3 gap-y-5 gap-x-2">
              <div v-for="color in COLORS" :key="color.field" class="flex flex-col items-center gap-1.5">
                <button
                  class="w-11 h-11 rounded-2xl border-4 shadow-sm active:scale-90 transition-all duration-200"
                  :style="{
                    backgroundColor: draft[color.field] || color.default,
                    borderColor: 'white'
                  }"
                  @click="openColorPicker(color)"
                ></button>
                <span class="text-[9px] font-black uppercase tracking-widest text-black/60 text-center leading-tight">
                  {{ color.label }}
                </span>
              </div>
            </div>
          </div>

          <!-- ③ Typography -->
          <div>
            <h4 class="text-[10px] font-black uppercase tracking-widest text-black/40 mb-3">Typography</h4>
            <div class="grid grid-cols-2 gap-2">
              <button
                v-for="f in FONTS"
                :key="f.value"
                class="px-3 py-3 rounded-2xl border-2 text-left active:scale-95 transition-all overflow-hidden"
                :class="draft.fontFamily === f.value
                  ? 'bg-secondary/10 border-secondary text-secondary'
                  : 'bg-white border-black/10 text-black'"
                @click="updateField('fontFamily', f.value)"
              >
                <span class="block text-base font-bold leading-tight truncate" :style="{ fontFamily: f.family }">
                  {{ f.preview }}
                </span>
                <span class="block text-[9px] font-black uppercase tracking-widest opacity-50 mt-1">
                  {{ f.label }}
                </span>
              </button>
            </div>
          </div>

          <!-- ④ Text effects -->
          <div>
            <h4 class="text-[10px] font-black uppercase tracking-widest text-black/40 mb-3">Text Effect</h4>
            <div class="grid grid-cols-2 gap-2">
              <button
                v-for="e in EFFECTS"
                :key="e.value"
                class="px-3 py-3 rounded-2xl border-2 text-left active:scale-95 transition-all overflow-hidden"
                :class="draft.fontEffect === e.value
                  ? 'bg-secondary/10 border-secondary'
                  : 'bg-white border-black/10'"
                @click="updateField('fontEffect', e.value)"
              >
                <!-- Preview of the effect -->
                <span
                  class="block text-base font-black leading-tight truncate"
                  :class="FONT_EFFECT_MAP[e.value] || 'text-black'"
                  :style="{ fontFamily: resolvedFontFamily }"
                >
                  {{ e.label === 'None' ? 'Plain' : e.label }}
                </span>
                <span
                  class="block text-[9px] font-black uppercase tracking-widest opacity-50 mt-1"
                  :class="draft.fontEffect === e.value ? 'text-secondary' : 'text-black'"
                >
                  Visual Style
                </span>
              </button>
            </div>
          </div>

        </div>

        <!-- Save / Revert bar -->
        <transition name="fade">
          <div
            v-if="isDirty"
            class="p-4 bg-white/80 backdrop-blur-2xl border-t-2 border-secondary/20 flex items-center justify-between rounded-b-[2.5rem]"
          >
            <ion-button fill="clear" color="dark" class="font-black tracking-widest text-xs" @click="revertChanges">
              Revert
            </ion-button>
            <ion-button shape="round" color="secondary"
                        @click="$emit('save', draft)">
              Save ✓
            </ion-button>
          </div>
        </transition>
      </div>
    </transition>

    <!-- Custom Color Picker Modal -->
    <ProfileColorPicker
      :is-open="colorPickerState.isOpen"
      :current-color="colorPickerState.currentColor"
      :title="colorPickerState.title"
      @close="colorPickerState.isOpen = false"
      @save="handleColorSave"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, reactive } from 'vue'
import { IonButton, IonIcon } from '@ionic/vue'
import { mdiChevronDown, mdiChevronUp, mdiPalette } from '@mdi/js'
import { svg } from '@/helper/general.helper'
import {
  COLORS,
  EFFECTS,
  FONT_EFFECT_MAP,
  FONTS,
  resolveFontFamily,
  resolveTitle
} from '@/config/profile_options.config'
import ProfileColorPicker from '@/components/profile/customization/ProfileColorPicker.vue'

const props = defineProps<{
  baseSettings: Record<string, any>
  draft: Record<string, any>
}>()

const emit = defineEmits(['update:draft', 'save', 'open-titles', 'open-signature'])

const isOpen = ref(false)

// --- Color Picker State ---
const colorPickerState = reactive({
  isOpen: false,
  field: '',
  title: '',
  currentColor: '#000000'
})

const isDirty = computed(() =>
  JSON.stringify(props.baseSettings) !== JSON.stringify(props.draft)
)

const resolvedFontFamily = computed(() => resolveFontFamily(props.draft.fontFamily))

const openColorPicker = (colorConfig: any) => {
  colorPickerState.isOpen = true
  colorPickerState.field = colorConfig.field
  colorPickerState.title = colorConfig.label
  colorPickerState.currentColor = props.draft[colorConfig.field] || colorConfig.default
}

const handleColorSave = (newHex: string) => {
  updateField(colorPickerState.field, newHex)
  colorPickerState.isOpen = false
}

const updateField = (field: string, value: any) => {
  emit('update:draft', {
    ...props.draft,
    [field]: value
  })
}

const revertChanges = () => {
  emit('update:draft', JSON.parse(JSON.stringify(props.baseSettings)))
}
</script>

<style scoped>
.fade-enter-active, .fade-leave-active {
  transition: opacity 0.25s ease;
}

.fade-enter-from, .fade-leave-to {
  opacity: 0;
}

.accordion-enter-active, .accordion-leave-active {
  transition: max-height 0.4s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.3s ease;
  max-height: 1200px;
}

.accordion-enter-from, .accordion-leave-to {
  max-height: 0;
  opacity: 0;
}

/* Hide scrollbar for cleaner look if content overflows */
.hide-scrollbar::-webkit-scrollbar {
  display: none;
}
</style>