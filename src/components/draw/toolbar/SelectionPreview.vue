<template>
  <!-- Rendered inside the draw page (NOT teleported to body) so it lives in the
       page's stacking context and stays UNDER SendHub / RoomMenu / ChatWidget
       instead of floating above them. pointer-events-auto re-enables taps since
       the Toolbars wrapper is pointer-events-none. -->
  <button
    v-show="hasSelection"
    class="fixed z-40 pointer-events-auto cursor-pointer rounded-2xl border border-primary/60 bg-white/10 backdrop-blur-md shadow-lg active:scale-95 transition-all"
      :style="{
        width: BOX + 'px',
        height: BOX + 'px',
        right: 'calc(0.75rem + env(safe-area-inset-right))',
        // Sits above the bottom-center dock (up to two stacked pills + margin)
        // so it can never overlap ToolDockSelect, whatever the screen width.
        bottom: 'calc(9rem + env(safe-area-inset-bottom))',
      }"
      @click="openBig"
    >
      <!-- clip only the canvas so the badge can sit outside -->
      <div class="absolute inset-0 rounded-2xl overflow-hidden flex items-center justify-center p-1">
        <canvas ref="thumb" class="max-w-full max-h-full" />
      </div>
      <!-- dashed marquee ring signals "this is your selection" -->
      <span class="absolute inset-0 rounded-2xl border-2 border-dashed border-secondary/70 pointer-events-none" />
      <span
        class="absolute -bottom-1.5 left-1/2 -translate-x-1/2 z-10 px-1.5 py-px rounded-full bg-secondary text-white text-[8px] font-black uppercase tracking-widest shadow-sm border border-white/40 whitespace-nowrap"
      >
        {{ count > 1 ? count + ' selected' : 'Selection' }}
      </span>
    </button>

    <div
      v-if="bigOpen"
      class="fixed inset-0 z-[9999] pointer-events-auto flex flex-col items-center justify-center gap-4 bg-black/60 backdrop-blur-sm"
      :style="{
        paddingTop: 'calc(2rem + var(--ion-safe-area-top, 0px))',
        paddingBottom: 'calc(2rem + var(--ion-safe-area-bottom, 0px))',
        paddingLeft: 'calc(2rem + var(--ion-safe-area-left, 0px))',
        paddingRight: 'calc(2rem + var(--ion-safe-area-right, 0px))',
      }"
      @click="bigOpen = false"
    >
      <ion-button
        class="absolute"
        :style="{
          top: 'calc(0.5rem + var(--ion-safe-area-top, 0px))',
          right: 'calc(0.5rem + var(--ion-safe-area-right, 0px))',
        }"
        fill="clear"
        color="light"
        aria-label="Close"
        @click.stop="bigOpen = false"
      >
        <ion-icon slot="icon-only" :icon="svg(mdiClose)" />
      </ion-button>

      <div
        class="rounded-3xl shadow-2xl p-4 max-w-[90vw] max-h-[70vh] flex items-center justify-center"
        :style="{ backgroundColor: bgColor }"
        @click.stop
      >
        <canvas ref="big" class="max-w-full max-h-[60vh] rounded-xl" />
      </div>

      <ion-button color="secondary" shape="round" @click.stop="shareSelection">
        <ion-icon :icon="svg(mdiShareVariant)" class="mr-2" slot="start" />
        Share
      </ion-button>
    </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import { IonIcon, IonButton } from "@ionic/vue";
import { mdiShareVariant, mdiClose } from "@mdi/js";
import { useSelect } from "@/draw/store/tools/select.store";
import { useDrawStore } from "@/draw/store/draw.store";
import { bakeThumbnail } from "@/draw/transform/transformController";
import { shareImg } from "@/helper/share.helper";
import { svg } from "@/helper/general.helper";

const BOX = 52; // tooldock thumbnail px — kept small on purpose

const { selectedObjectsRef } = storeToRefs(useSelect());
const { getCanvas } = useDrawStore();

const thumb = ref<HTMLCanvasElement | null>(null);
const big = ref<HTMLCanvasElement | null>(null);
const bigOpen = ref(false);
const bgColor = ref("#ffffff");

function canvasBg(): string {
	return (getCanvas()?.backgroundColor as string) || "#ffffff";
}

const count = computed(() => selectedObjectsRef.value.length);
const hasSelection = computed(() => count.value > 0);

function paint(canvasEl: HTMLCanvasElement | null, maxPx: number) {
	if (!canvasEl) return;
	const c = getCanvas();
	if (!c) return;
	const res = bakeThumbnail(c, maxPx, selectedObjectsRef.value);
	const ctx = canvasEl.getContext("2d");
	if (!ctx) return;
	if (!res) {
		canvasEl.width = canvasEl.height = 0;
		return;
	}
	canvasEl.width = res.bitmap.width;
	canvasEl.height = res.bitmap.height;
	// Keep aspect on the big preview; the small thumb fills its square box.
	if (canvasEl === big.value)
		canvasEl.style.aspectRatio = `${res.cssW} / ${res.cssH}`;
	ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
	// Paint the canvas background behind the selection so it reads like a real
	// crop of the drawing, not floating on plain white.
	ctx.fillStyle = canvasBg();
	ctx.fillRect(0, 0, canvasEl.width, canvasEl.height);
	ctx.drawImage(res.bitmap, 0, 0);
	res.bitmap.close();
}

async function refreshThumb() {
	if (!hasSelection.value) return;
	await nextTick();
	paint(thumb.value, 128);
}

async function openBig() {
	bgColor.value = canvasBg();
	bigOpen.value = true;
	await nextTick();
	paint(big.value, 1024);
}

async function shareSelection() {
	const c = getCanvas();
	if (!c) return;
	const res = bakeThumbnail(c, 2048, selectedObjectsRef.value);
	if (!res) return;
	// Close the overlay first — else the copy/share toast renders beneath it.
	bigOpen.value = false;
	// Composite onto white so a transparent selection isn't exported as
	// black-on-transparent on platforms that flatten alpha.
	const cv = document.createElement("canvas");
	cv.width = res.bitmap.width;
	cv.height = res.bitmap.height;
	const ctx = cv.getContext("2d");
	if (ctx) ctx.fillStyle = canvasBg();
	ctx?.fillRect(0, 0, cv.width, cv.height);
	ctx?.drawImage(res.bitmap, 0, 0);
	res.bitmap.close();
	await shareImg(
		cv.toDataURL("image/png"),
		undefined,
		undefined,
		"Share selection",
	);
}

watch(selectedObjectsRef, refreshThumb, { immediate: true, deep: false });
onBeforeUnmount(() => (bigOpen.value = false));
</script>
