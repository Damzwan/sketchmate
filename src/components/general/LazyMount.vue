<!--
  Defers a heavy child until `when` first turns true.

  Vue slots are lazy (render functions), so the slotted component — and its
  defineAsyncComponent chunk — is not created until this renders the slot. That
  moves rarely-opened modal chunks (Shop/Paywall/…) off the app-boot critical
  path on low-end webviews. By default it stays mounted so ion-modal animations
  and @didDismiss handlers behave normally. Low-memory callers can opt out of
  retention; teardown waits for the close animation before releasing the tree.
-->
<template>
  <slot v-if="mounted" />
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from "vue";

const props = withDefaults(
	defineProps<{
		when: boolean;
		/** Keep the component instance after its first open. */
		retain?: boolean;
		/** Lets a modal finish its leave animation before low-memory teardown. */
		unmountDelay?: number;
	}>(),
	{ retain: true, unmountDelay: 450 },
);
const mounted = ref(props.when);
let unmountTimer: ReturnType<typeof setTimeout> | undefined;

watch(
	() => props.when,
	(v) => {
		clearTimeout(unmountTimer);
		unmountTimer = undefined;
		if (v) {
			mounted.value = true;
		} else if (!props.retain) {
			unmountTimer = setTimeout(() => {
				unmountTimer = undefined;
				if (!props.when) mounted.value = false;
			}, props.unmountDelay);
		}
	},
);

onBeforeUnmount(() => clearTimeout(unmountTimer));
</script>
