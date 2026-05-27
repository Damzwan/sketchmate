<template>
  <ShopCardShell :sku="sku" :owned="owned" :highlight="highlight" @purchase="$emit('purchase')">
    <template #preview>
      <div class="h-28 bg-[#FAF6F0] relative flex items-center justify-center border-b border-black/5">
        <div class="relative w-12 h-12">
          <div class="w-full h-full rounded-full border border-black/20 flex items-center justify-center overflow-hidden bg-white shadow-inner">
            <img v-if="user?.img" :src="user.img" alt="" class="w-full h-full object-cover" />
            <span  v-else class="text-xl">🎨</span>
          </div>
          <AvatarDecoration v-if="decorationDef" :def="decorationDef" />
        </div>
      </div>
    </template>
  </ShopCardShell>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { ShopSku } from "@/config/catalog.config";
import { resolveDecoration } from "@/config/profile_options.config";
import ShopCardShell from "./ShopCardShell.vue";
import AvatarDecoration from "@/components/profile/customization/AvatarDecoration.vue";

const props = defineProps<{
	sku: ShopSku;
	user?: any;
	owned: boolean;
	highlight?: boolean;
}>();
defineEmits(["purchase"]);
const decorationDef = computed(() => resolveDecoration(props.sku.refId));
</script>