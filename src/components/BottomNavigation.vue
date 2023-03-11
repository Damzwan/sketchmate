<template>
  <v-bottom-navigation color="black" location="bottom" bg-color="primary" v-if="show" grow>
    <v-btn :to="FRONTEND_ROUTES.draw">
      <v-icon :icon="mdiPencilOutline" size="x-large" />
      Sketch
    </v-btn>

    <v-btn :to="FRONTEND_ROUTES.gallery">
      <v-icon :icon="mdiImageMultipleOutline" size="x-large" />
      Gallery
    </v-btn>

    <v-btn :to="FRONTEND_ROUTES.connect">
      <v-icon :icon="mdiAccountCircleOutline" size="x-large" />
      Connect
    </v-btn>
  </v-bottom-navigation>
</template>
<script setup lang="ts">
import {storeToRefs} from 'pinia';
import {useAppStore} from '@/store/app.store';
import {FRONTEND_ROUTES} from '@/types/app.types';
import {mdiAccountCircleOutline, mdiImageMultipleOutline, mdiPencilOutline,} from '@mdi/js';
import {computed} from 'vue';
import {useRoute} from 'vue-router';

const { user } = storeToRefs(useAppStore());
const route = useRoute();

const show = computed(() => user.value && user.value.mate && route.path != `/${FRONTEND_ROUTES.tutorial}`);
</script>
