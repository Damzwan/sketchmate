<template>
  <v-bottom-navigation color="primary" grow :height="BOTTOM_NAV_HEIGHT" location="bottom" v-if="show">
    <v-btn :to="FRONTEND_ROUTES.draw">
      <v-icon :icon="mdiPencil" size="x-large"/>
    </v-btn>

    <v-btn :to="FRONTEND_ROUTES.messages">
      <v-icon :icon="mdiMessage" size="x-large"/>
    </v-btn>

    <v-btn :to="FRONTEND_ROUTES.connect">
      <v-icon :icon="mdiAccount" size="x-large"/>
    </v-btn>
  </v-bottom-navigation>
</template>
<script setup lang="ts">
import {BOTTOM_NAV_HEIGHT} from '@/constants/app.constants';
import {storeToRefs} from 'pinia';
import {useAppStore} from '@/store/app.store';
import {FRONTEND_ROUTES} from '@/types/app.types';
import {mdiPencil, mdiMessage, mdiAccount} from '@mdi/js';
import {computed, watch} from 'vue';
import {useRoute} from 'vue-router';

const {user} = storeToRefs(useAppStore())
const route = useRoute();

const show = computed(() => user.value && user.value.mate && route.path != `/${FRONTEND_ROUTES.tutorial}`)
</script>
