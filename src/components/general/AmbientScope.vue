<template>
  <slot />
</template>

<script setup lang="ts">
import { computed, provide } from "vue";
import { AMBIENT_FOREGROUND } from "@/store/ambientPause.store";

/**
 * Renderless foreground gate for a subtree of ambient worlds/effects. Wrap a
 * surface in <AmbientScope :active="..."> and its ProfileWorld/ProfileEffect
 * instances animate only while `active` — everything else freezes via the
 * global ambient pause (which is engaged whenever a big overlay is up).
 * Used by pagers/carousels so only the fronted pane burns GPU.
 */
const props = defineProps<{ active: boolean }>();

provide(
	AMBIENT_FOREGROUND,
	computed(() => props.active),
);
</script>
