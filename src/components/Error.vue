<template>
  <div class="w-100 h-75 text-center d-flex justify-center align-center">
    <div>
      <v-img :src="errorImg"/>
      <div class="mt-n10">
        <h2>Oops something went wrong!</h2>
        <p>Please try again later</p>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import errorImg from '@/assets/illustrations/page-not-found.svg'</script>
