<!--
  Defers a heavy child until `when` first turns true, then keeps it mounted.

  Vue slots are lazy (render functions), so the slotted component — and its
  defineAsyncComponent chunk — is not created until this renders the slot. That
  moves rarely-opened modal chunks (Shop/Paywall/…) off the app-boot critical
  path on low-end webviews. Once opened it LATCHES mounted, so ion-modal
  open/close animations and @didDismiss handlers behave normally afterwards.
-->
<template>
  <slot v-if="mounted" />
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'

const props = defineProps<{ when: boolean }>()
const mounted = ref(props.when)

watch(
  () => props.when,
  (v) => {
    if (v) mounted.value = true
  }
)
</script>
