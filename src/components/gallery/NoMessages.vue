<template>
  <v-container
    class="w-100 h-75 d-flex justify-center align-center">
    <div class="text-center flex-column d-flex justify-center align-center">
      <v-img :src="noMessagesImg" :height="200" :width="200"/>
      <div class="text-caption pt-5§ w-75">No messages have been received yet. Your mate probably hates you...</div>
    </div>
  </v-container>
</template>

<script lang="ts" setup>
import noMessagesImg from '@/assets/illustrations/no-messages.svg';
</script>

<style scoped>

</style>
