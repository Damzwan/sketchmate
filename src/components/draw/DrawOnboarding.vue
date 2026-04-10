<template>
  <div
    @click="handleTap"
    class="fixed inset-0 z-[100] cursor-pointer pointer-events-auto select-none safe-area top-safe"
    style="font-family: 'Cabin Sketch', cursive;"
  >
    <div class="absolute inset-0 bg-slate-900/5" />

    <svg class="absolute inset-0 w-full h-full fill-none stroke-[2.5] stroke-linecap-round">
      <g v-if="phase === 1" class="text-teal-400 stroke-teal-400">
        <path d="M 110,140 Q 80,100 60,55" class="draw-path" />
        <path d="M 50,70 L 60,55 L 75,65" class="draw-path" />
      </g>

      <g v-if="phase === 2">
        <g class="text-rose-300 stroke-rose-300">
          <path :d="`M ${screenWidth - 210},140 Q ${screenWidth - 200},110 ${screenWidth - 195},65`" class="draw-path" />
          <path :d="`M ${screenWidth - 205},75 L ${screenWidth - 195},65 L ${screenWidth - 185},75`" class="draw-path" />
        </g>

        <g class="text-amber-300 stroke-amber-300">
          <path :d="`M ${screenWidth - 50},195 Q ${screenWidth - 45},110 ${screenWidth - 35},65`" class="draw-path" />
          <path :d="`M ${screenWidth - 45},75 L ${screenWidth - 35},65 L ${screenWidth - 25},75`" class="draw-path" />
        </g>
      </g>
    </svg>

    <div class="absolute inset-0 text-2xl tracking-wide">
      <div v-if="phase === 1" class="absolute top-[150px] left-[60px] animate-in fade-in slide-in-from-top-4">
        <span class="bg-teal-50 border-2 border-teal-200 text-teal-700 px-4 py-1 rounded-lg rotate-[-1.5deg] inline-block shadow-sm">
          Create
        </span>
      </div>

      <template v-if="phase === 2">
        <div class="absolute top-[150px] right-[140px] animate-in fade-in slide-in-from-top-4">
          <span class="bg-rose-50 border-2 border-rose-200 text-rose-600 px-4 py-1 rounded-lg rotate-[2deg] inline-block shadow-sm">
            Draw with friends!
          </span>
        </div>
        <div class="absolute top-[205px] right-[10px] animate-in fade-in slide-in-from-top-4 delay-150">
          <span class="bg-amber-50 border-2 border-amber-200 text-amber-600 px-4 py-1 rounded-lg rotate-[-2deg] inline-block shadow-sm">
            Save & Send
          </span>
        </div>
      </template>
    </div>

    <div class="absolute bottom-12 w-full text-center">
      <p class="text-slate-400 text-sm font-sans tracking-widest uppercase animate-pulse">
        Tap to continue
      </p>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue';

const emit = defineEmits(['close']);

const phase = ref(1);
const screenWidth = ref(typeof window !== 'undefined' ? window.innerWidth : 1200);

const updateWidth = () => {
  screenWidth.value = window.innerWidth;
};

onMounted(() => {
  updateWidth();
  window.addEventListener('resize', updateWidth);
});

onUnmounted(() => window.removeEventListener('resize', updateWidth));

const handleTap = () => {
  if (phase.value === 1) {
    phase.value = 2;
  } else {
    emit('close');
  }
};
</script>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Cabin+Sketch:wght@400;700&display=swap');

.draw-path {
  stroke-dasharray: 400;
  stroke-dashoffset: 400;
  animation: draw 0.7s cubic-bezier(0.22, 1, 0.36, 1) forwards;
}

@keyframes draw {
  to { stroke-dashoffset: 0; }
}

.animate-in {
  animation-duration: 500ms;
  animation-fill-mode: both;
}
.fade-in { animation-name: fadeIn; }
.slide-in-from-top-4 { animation-name: slideIn; }

@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
@keyframes slideIn { from { transform: translateY(-1rem); } to { transform: translateY(0); } }
</style>