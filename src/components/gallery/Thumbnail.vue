<template>
  <div>
    <div class="z-10 absolute w-full h-full flex justify-center items-center" v-if="isLoading">
      <ion-spinner color="primary" />
    </div>
    <ion-img
      :src="src"
      class="w-full cursor-pointer object-fill relative aspect-square"
      @ionImgDidLoad="isLoading = false"
    />
  </div>
</template>

<script lang="ts" setup>
import { ref } from 'vue'
import { IonImg, IonSpinner } from '@ionic/vue'

defineProps({
  src: {
    type: String,
    required: true
  }
})

const isLoading = ref(true)
</script>

<style scoped>
ion-img::part(image) {
  border-radius: 10px;
}
</style>
