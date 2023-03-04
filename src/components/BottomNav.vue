<template>
  <v-bottom-navigation color="primary" grow :height="BOTTOM_NAV_HEIGHT" location="bottom">
    <v-btn :to="FRONTEND_ROUTES.draw" :disabled="!user || !user.mate">
      <v-icon icon="mdi-pen" size="x-large"/>
    </v-btn>

    <v-btn :to="FRONTEND_ROUTES.messages" :disabled="!user || !user.mate">
      <v-icon icon="mdi-message" size="x-large"/>
    </v-btn>

    <v-btn :to="FRONTEND_ROUTES.connect">
      <v-icon icon="mdi-account" size="x-large"/>
    </v-btn>
  </v-bottom-navigation>
</template>
<script setup lang="ts">
import {BOTTOM_NAV_HEIGHT} from '@/constants/app.constants';
import {storeToRefs} from 'pinia';
import {useAppStore} from '@/store/app.store';
import {FRONTEND_ROUTES} from '@/types/app.types';

const {user} = storeToRefs(useAppStore())
</script>
