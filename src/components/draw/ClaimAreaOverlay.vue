<template>
  <div class="absolute inset-0 z-10 pointer-events-none overflow-hidden">
    <!-- Claimed areas -->
    <div
      v-for="b in boxes"
      :key="b.id"
      class="absolute rounded-md"
      :style="{
        left: b.left + 'px',
        top: b.top + 'px',
        width: b.width + 'px',
        height: b.height + 'px',
        border: `2px dashed ${b.mine ? 'rgba(34,197,94,0.95)' : 'rgba(239,68,68,0.95)'}`,
      }"
    >
      <span
        class="absolute top-0 left-0 px-1.5 py-0.5 text-[11px] font-black text-white rounded-br-md whitespace-nowrap max-w-full truncate"
        :style="{ backgroundColor: b.mine ? 'rgba(34,197,94,0.95)' : 'rgba(239,68,68,0.95)' }"
      >
        {{ b.label }}
      </span>
    </div>

    <!-- Placement ghost -->
    <div
      v-if="ghostBox"
      class="absolute rounded-md"
      :style="{
        left: ghostBox.left + 'px',
        top: ghostBox.top + 'px',
        width: ghostBox.width + 'px',
        height: ghostBox.height + 'px',
        border: `2px dashed ${ghostBox.valid ? 'rgba(34,197,94,0.95)' : 'rgba(239,68,68,0.95)'}`,
        backgroundColor: ghostBox.valid ? 'rgba(34,197,94,0.14)' : 'rgba(239,68,68,0.14)',
      }"
    />
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import { storeToRefs } from "pinia";
import { useClaimArea } from "@/draw/claims/claimArea.store";
import { useDrawStore } from "@/draw/session/draw.store";
import { useAuthStore } from "@/store/auth.store";

interface ScreenBox {
  id: string;
  mine: boolean;
  label: string;
  left: number;
  top: number;
  width: number;
  height: number;
}

const claim = useClaimArea();
const { areas, ghost } = storeToRefs(claim);
const drawStore = useDrawStore();
const authStore = useAuthStore();

const boxes = ref<ScreenBox[]>([]);
const ghostBox = ref<{ left: number; top: number; width: number; height: number; valid: boolean } | null>(null);

let raf = 0;
// Idle-skip: only rebuild when the viewport moved or the area/ghost state
// changed. Areas/ghost are replaced by reference on every store mutation.
let lz = NaN, le = NaN, lf = NaN;
let lastAreas: unknown = null;
let lastGhost: unknown = null;

// World → canvas-local CSS px via the fabric viewport transform (vpt is already
// in CSS px, and this overlay shares the canvas element's box).
function project(a: { x: number; y: number; w: number; h: number }, z: number, e: number, f: number) {
  return { left: a.x * z + e, top: a.y * z + f, width: a.w * z, height: a.h * z };
}

function tick() {
  const c = drawStore.getCanvas();
  const vpt = c?.viewportTransform;
  if (vpt) {
    const z = vpt[0];
    const e = vpt[4];
    const f = vpt[5];

    if (
      z === lz && e === le && f === lf &&
      areas.value === lastAreas && ghost.value === lastGhost
    ) {
      raf = requestAnimationFrame(tick);
      return;
    }
    lz = z; le = e; lf = f;
    lastAreas = areas.value;
    lastGhost = ghost.value;

    const myId = authStore.user?._id ? String(authStore.user._id) : undefined;

    boxes.value = areas.value.map((a) => {
      const mine = String(a.userId) === myId;
      return {
        id: a.id,
        mine,
        label: mine ? "Your area" : a.userName || "Locked",
        ...project(a, z, e, f),
      };
    });

    ghostBox.value = ghost.value
      ? { ...project(ghost.value, z, e, f), valid: ghost.value.valid }
      : null;
  }
  raf = requestAnimationFrame(tick);
}

onMounted(() => {
  raf = requestAnimationFrame(tick);
});

onBeforeUnmount(() => {
  if (raf) cancelAnimationFrame(raf);
});
</script>
