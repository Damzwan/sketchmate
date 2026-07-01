<template>
  <ShopCardShell :sku="sku" :owned="owned" :highlight="highlight" @purchase="$emit('purchase')">
    <template #preview>
      <div class="h-28 relative overflow-hidden border-b border-primary/30 world-stage">
        <ProfileWorld v-if="worldDef" :def="worldDef" :preview="true" :preview-scale="0.42" />
      </div>
    </template>
  </ShopCardShell>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { ShopSku } from "@/config/catalog.config";
import { resolveWorld } from "@/config/profile_options.config";
import ShopCardShell from "./ShopCardShell.vue";
import ProfileWorld from "@/components/profile/ProfileWorld.vue";

const props = defineProps<{
	sku: ShopSku;
	owned: boolean;
	highlight?: boolean;
}>();
defineEmits(["purchase"]);
const worldDef = computed(() => resolveWorld(props.sku.refId));
</script>

<style scoped>
.world-stage {
  background: linear-gradient(135deg, #3f4d63, #232c3e);
}
</style>
