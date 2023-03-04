<template>
  <ControlBar/>

  <div class="h-100 w-100" ref="container">
    <canvas ref="myCanvasRef"/>
  </div>
</template>

<script lang="ts" setup>

import ControlBar from '@/components/draw/DrawControlBar.vue';

import {computed, onMounted, ref, watch} from 'vue';
import {fabric} from 'fabric';
import {BOTTOM_NAV_HEIGHT} from '@/constants/app.constants';
import {useDrawStore} from '@/store/draw.store';
import {storeToRefs} from 'pinia';
import {WHITE} from '@/constants/draw.constants';
import {DrawTool} from '@/types/draw.types';

const container = ref<HTMLDivElement>();
const myCanvasRef = ref<HTMLCanvasElement>();

const drawStore = useDrawStore();
const {
  isDrawingMode,
  penColor,
  strokeWidth,
  eraserWidth,
  selectedTool,
  stickers,
  textColor,
  textSize,
  textBoxes,
  canvas: c,
} = storeToRefs(drawStore);

onMounted(() => {
  if (!container.value || !myCanvasRef.value) return;
  const canvas = new fabric.Canvas(myCanvasRef.value, {
    isDrawingMode: isDrawingMode.value,
    width: container.value.offsetWidth,
    height: container.value?.offsetHeight - BOTTOM_NAV_HEIGHT
  })

  canvas.loadFromJSON(c.value.toJSON(), () => {
    const scaleX = canvas.width! / c.value.width!;
    const scaleY = canvas.height! / c.value.height!;
    c.value = canvas;

    c.value.forEachObject((obj: any) => {
      obj.scaleX *= scaleX;
      obj.scaleY *= scaleY;
      obj.left *= scaleX;
      obj.top *= scaleY;
    });

    c.value.setZoom(1); // Set zoom back to 1 after scaling

    c.value.freeDrawingBrush.width = strokeWidth.value;
    c.value.freeDrawingBrush.color = penColor.value;
  })
})

const brush = computed(() => c.value!.freeDrawingBrush)

function selectPen() {
  brush.value.width = strokeWidth.value;
  brush.value.color = penColor.value;
}

function selectMobileEraser() {
  brush.value.width = eraserWidth.value;
  brush.value.color = WHITE;
}

function selectFullEraser() {
  c.value.clear();
  c.value.setBackgroundColor('#FFFFFF', () => {
  });
  selectedTool.value = DrawTool.Pen;
}

function selectDrag() {
  isDrawingMode.value = false;
}

watch(selectedTool, () => {
  isDrawingMode.value = true;
  if (selectedTool.value === DrawTool.Pen) selectPen();
  else if (selectedTool.value === DrawTool.MobileEraser) selectMobileEraser();
  else if (selectedTool.value === DrawTool.StrokeEraser) selectMobileEraser();
  else if (selectedTool.value === DrawTool.FullEraser) selectFullEraser();
  else if (selectedTool.value === DrawTool.Drag) selectDrag();
})

watch(strokeWidth, () => {
  brush.value.width = strokeWidth.value
})

watch(eraserWidth, () => {
  brush.value.width = eraserWidth.value
})

watch(penColor, () => {
  brush.value.color = penColor.value;
})

watch(isDrawingMode, () => {
  c.value.isDrawingMode = isDrawingMode.value;
});

watch(stickers, () => {
  const lastSticker = stickers.value.slice(-1)[0];
  fabric.Image.fromURL(
    lastSticker,
    function (img) {
      img.scaleToWidth(200)
      c.value.add(img);
      isDrawingMode.value = false;
    }
  );
}, {deep: true})

watch(textBoxes, () => {
  const text = new fabric.Textbox('New Text', {
    stroke: textColor.value,
    fill: textColor.value,
    fontSize: textSize.value,
    editable: true
  });
  c.value.add(text)
  isDrawingMode.value = false;
}, {deep: true})

</script>

<style scoped>

</style>
