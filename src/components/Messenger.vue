<template>
  <v-snackbar absolute v-model:model-value="show" :color="color" :timeout="timeout">{{ text }}
    <template v-slot:actions v-if="action && action_title">
      <v-btn
        variant="text"
        @click="() => {
          action()
          show = false;
        }"
      >
        {{ action_title }}
      </v-btn>
    </template>
  </v-snackbar>
</template>

<script lang="ts" setup>
import {useMessenger} from '@/service/messenger.service';

const {show, color, text, timeout, action, action_title} = useMessenger();
</script>
