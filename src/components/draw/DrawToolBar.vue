<template>
  <v-toolbar color="primary" density="compact">
    <template v-slot:prepend>
      <v-btn-toggle variant="text" mandatory :model-value="selectedTool">
        <v-menu :close-on-content-click="false">
          <template v-slot:activator="{ props }">
            <v-btn icon @click="selectTool(DrawTool.Pen)" v-bind="openPenMenuOnClick ? props : null">
              <v-icon color="white" :icon="mdiPen" />
            </v-btn>
          </template>
          <v-card rounded>
            <v-list class="v_list">
              <v-list-item class="v_list_item">
                <v-slider class="px-4" max="50" min="1" v-model="strokeWidth"></v-slider>
              </v-list-item>

              <v-list-item class="mt-n7 v_list_item">
                <v-color-picker
                  dot-size="25"
                  hide-canvas
                  hide-inputs
                  hide-sliders
                  show-swatches
                  :swatches="SWATCHES"
                  mode="hexa"
                  swatches-max-height="200"
                  v-model="penColor"
                ></v-color-picker>
              </v-list-item>
            </v-list>
          </v-card>
        </v-menu>

        <v-menu>
          <template v-slot:activator="{ props }">
            <v-btn icon @click="selectTool(lastSelectedEraserTool)" v-bind="openEraserMenuOnClick ? props : null">
              <v-icon color="white" :icon="mdiEraser" />
            </v-btn>
          </template>
          <v-list>
            <v-list-item @click="selectTool(DrawTool.MobileEraser)">Mobile Eraser</v-list-item>
            <v-list-item @click="selectTool(DrawTool.StrokeEraser)">Stroke Eraser</v-list-item>
            <v-list-item @click="selectTool(DrawTool.FullEraser)">Erase all</v-list-item>
          </v-list>
        </v-menu>

        <v-menu>
          <template v-slot:activator="{ props }">
            <v-btn icon v-bind="props" @click="selectTool(DrawTool.Sticker)">
              <v-icon color="white" :icon="mdiStickerEmoji" />
            </v-btn>
          </template>
          <v-list>
            <v-img v-for="(img, i) in stickerUrls" :key="i" :src="img" @click="addSticker(img)" />
          </v-list>
        </v-menu>

        <v-btn icon @click="selectTool(DrawTool.Drag)">
          <v-icon color="white" :icon="mdiHandBackRight" />
        </v-btn>

        <v-menu :close-on-content-click="false">
          <template v-slot:activator="{ props }">
            <v-btn icon v-bind="props" @click="selectTool(DrawTool.Text)">
              <v-icon color="white" :icon="mdiFormatText" />
            </v-btn>
          </template>
          <v-card rounded>
            <v-list class="v_list">
              <v-list-item class="v_list_item">
                <v-slider class="px-4" max="60" min="10" v-model="textSize"></v-slider>
              </v-list-item>

              <v-list-item class="mt-n7 v_list_item">
                <v-color-picker
                  dot-size="25"
                  hide-canvas
                  hide-inputs
                  hide-sliders
                  show-swatches
                  :swatches="SWATCHES"
                  mode="hexa"
                  swatches-max-height="200"
                  v-model="textColor"
                ></v-color-picker>
              </v-list-item>

              <v-list-item class="v_list_item">
                <v-btn color="primary" @click="addTextBox('')">Add</v-btn>
              </v-list-item>
            </v-list>
          </v-card>
        </v-menu>
      </v-btn-toggle>
    </template>

    <template v-slot:append>
      <v-btn :icon="mdiSend" color="white" @click="send" />
    </template>
  </v-toolbar>
</template>

<script lang="ts" setup>
import {computed} from 'vue';
import {DrawTool} from '@/types/draw.types';
import {useDrawStore} from '@/store/draw.store';
import {storeToRefs} from 'pinia';
import {ERASERS, SWATCHES} from '@/constants/draw.constants';
import {mdiEraser, mdiFormatText, mdiHandBackRight, mdiPen, mdiSend, mdiStickerEmoji} from '@mdi/js';

const drawStore = useDrawStore();
const { selectTool, addSticker, addTextBox, send } = drawStore;
const { selectedTool, strokeWidth, penColor, lastSelectedEraserTool, textSize, textColor } = storeToRefs(drawStore);

const openPenMenuOnClick = computed(() => selectedTool.value === DrawTool.Pen);
const openEraserMenuOnClick = computed(() => ERASERS.includes(selectedTool.value));

const stickerUrls = [
  'http://placekitten.com/200/200',
  'http://placekitten.com/200/200',
  'http://placekitten.com/200/200',
];
</script>

<style scoped>
.v_list_item {
  padding: 0 4px !important;
}

.v_list {
  padding: 4px 0 !important;
}
</style>
