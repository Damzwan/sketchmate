<template>
  <ShopCardShell :sku="sku" :owned="owned" :highlight="highlight" @purchase="$emit('purchase')">
    <template #preview>
      <!-- Container frame: mimics the warm gallery easel backdrop -->
      <div class="h-32 relative overflow-hidden flex items-center justify-center bg-[#3d1a14]/5 p-3.5 border-b border-[#3d1a14]/10">

        <!-- Interactive Micro Profile Card Mockup -->
        <div
          class="w-full h-full rounded-[1.5rem] border-2 shadow-md relative p-2.5 flex flex-col justify-between overflow-hidden transition-all duration-300"
          :style="{
            background: theme.cardBg,
            borderColor: theme.cardBorderColor
          }"
        >
          <!-- Top Half: Avatar & Bio Frame -->
          <div class="flex items-center gap-2">
            <!-- Micro Avatar (scaled match to UserAvatar) -->
            <div
              class="w-8 h-8 rounded-[0.75rem] border shadow-sm shrink-0 relative flex items-center justify-center bg-white/20 overflow-hidden"
              :style="{ borderColor: theme.cardBorderColor }"
            >
              <img
                :src="user?.img || 'https://placehold.co/100x100/FAF6F0/3d1a14?text=🎨'"
                class="w-full h-full object-cover"
                alt="Mini Avatar"
              />
            </div>

            <!-- Profile Meta Stack -->
            <div class="flex-1 min-w-0 flex flex-col justify-center leading-none">
              <!-- Micro Title Pill -->
              <span
                class="self-start text-[6px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-full mb-0.5 transition-colors duration-300 leading-none"
                :style="{ background: theme.titleBg || theme.accentColor, color: theme.nameColor }"
              >
                {{ sku.name.split(' ')[0] || 'Artist' }}
              </span>

              <!-- Micro Name -->
              <h4
                class="text-[11px] font-black truncate transition-colors duration-300 tracking-tight leading-none"
                :style="{ color: theme.nameColor }"
              >
                {{ user?.name || 'Creative Artist' }}
              </h4>
            </div>
          </div>

          <!-- Bottom Half: Themed Swatch Palette -->
          <div
            class="flex items-center justify-between pt-1.5 mt-1 border-t transition-colors duration-300"
            :style="{ borderColor: theme.cardBorderColor }"
          >
            <!-- Label -->
            <span
              class="text-[7px] font-black uppercase tracking-widest transition-colors duration-300"
              :style="{ color: theme.descColor || '#3d1a14' }"
            >
              Palette
            </span>

            <!-- Color Swatches as Micro Dots -->
            <div class="flex gap-1">
              <div
                v-for="(color, i) in theme.swatches.slice(0, 4)"
                :key="i"
                class="w-3.5 h-3.5 rounded-full border border-white shadow-sm shrink-0"
                :style="{ backgroundColor: color }"
              ></div>
            </div>
          </div>
        </div>

      </div>
    </template>
  </ShopCardShell>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { ShopSku } from "@/config/catalog.config";
import { resolveTheme } from "@/config/profile_options.config";
import ShopCardShell from "./ShopCardShell.vue";

const props = defineProps<{
	sku: ShopSku;
	user?: any;
	owned: boolean;
	highlight?: boolean;
}>();

defineEmits(["purchase"]);

const theme = computed(() => resolveTheme(props.sku.refId));
</script>

<style scoped>
/* High performance anti-aliasing for the micro card rendering */
div {
  backface-visibility: hidden;
  -webkit-font-smoothing: subpixel-antialiased;
}
</style>