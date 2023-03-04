<template>
  <v-dialog
    transition="dialog-bottom-transition"
    v-if="isInfoModalOpen"
    fullscreen
    v-model="isInfoModalOpen"
  >
    <v-sheet class="h-100" color="background">
      <!--      <v-toolbar dark color="transparent">-->
      <!--        <v-toolbar-title class="text-h6">-->
      <!--          What is SketchMate?-->
      <!--        </v-toolbar-title>-->
      <!--        <template v-slot:append>-->
      <!--          <v-btn icon="mdi-close" @click="close"></v-btn>-->
      <!--        </template>-->
      <!--      </v-toolbar>-->


      <v-container class="pt-5">

        <v-carousel v-model="carousel" :show-arrows="false" hide-delimiters class="pt-4 h-100">
          <v-carousel-item>
            <v-sheet class="h-100" color="background">
              <div class="text-center text-h4 pb-10">Sketch</div>
              <v-img :src="screen1" height="500"/>
            </v-sheet>
          </v-carousel-item>

          <v-carousel-item>
            <v-sheet class="h-100" color="background">
              <div class="text-center text-h4 pb-10">Create Stickers</div>
              <v-img :src="screen2" height="500"/>
            </v-sheet>
          </v-carousel-item>

          <v-carousel-item>
            <v-sheet class="h-100" color="background">
              <div class="text-center text-h4 pb-10">Share And Reply</div>
              <v-img :src="screen2" height="500"/>
            </v-sheet>
          </v-carousel-item>
        </v-carousel>
      </v-container>

      <div class="nav_button_container w-100 d-flex justify-space-between">
        <v-btn variant="text" @click="carousel = Math.max(carousel - 1, 0)" :disabled="carousel === 0">Previous</v-btn>


        <v-btn @click="close" variant="text" v-if="carousel === maxCarouselValue">Done</v-btn>
        <v-btn v-else variant="text" @click="carousel = Math.min(carousel + 1, maxCarouselValue)">Next</v-btn>
      </div>
    </v-sheet>

  </v-dialog>
</template>

<script lang="ts" setup>
import {storeToRefs} from 'pinia';
import {useAppStore} from '@/store/app.store';
import {ref, watch} from 'vue';
import {VCarousel} from 'vuetify/components/VCarousel';
import screen1 from "@/assets/tutorial/screen1.gif"
import screen2 from "@/assets/tutorial/screen2.gif"

const carousel = ref<number>(0);
const carouselLength = 3;

const maxCarouselValue = carouselLength - 1;

function close() {
  isInfoModalOpen.value = false;
  carousel.value = 0;
}


const {isInfoModalOpen} = storeToRefs(useAppStore())
</script>

<style scoped>

.nav_button_container {
  bottom: 0;
  position: absolute;
}

</style>
