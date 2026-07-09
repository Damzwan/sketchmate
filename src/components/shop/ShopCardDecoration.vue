<template>
  <ShopCardShell :sku="sku" :owned="owned" :highlight="highlight" previewable @purchase="$emit('purchase')" @preview="$emit('preview')">
    <template #preview>
      <div class="h-28 bg-[#FAF6F0] relative flex items-center justify-center border-b border-black/5">
        <div class="relative w-12 h-12">
          <div class="w-full h-full rounded-full border border-black/20 flex items-center justify-center overflow-hidden bg-white shadow-inner">
            <img v-if="user?.img" :src="user.img" alt="" class="w-full h-full object-cover" />
            <ion-icon v-else :icon="svg(mdiAccountCircle)" class="text-xl text-black/40" />
          </div>
          <AvatarDecoration v-if="decorationDef" :def="decorationDef" />
        </div>
      </div>
    </template>
  </ShopCardShell>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { IonIcon } from "@ionic/vue";
import { mdiAccountCircle } from "@mdi/js";
import { svg } from "@/helper/general.helper";
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
defineEmits(["purchase", "preview"]);
const decorationDef = computed(() => resolveDecoration(props.sku.refId));
</script>