<template>
  <div
    class="snap-start shrink-0 w-[270px] relative rounded-[2.25rem] overflow-hidden border-2 bg-[#FAF6F0] border-[#3d1a14]/20 text-[#3d1a14] shadow-[4px_4px_0px_0px_rgba(61,26,20,0.1)]"
    :class="[highlight ? 'ring-2 ring-[#B9463A]' : '']"
  >
    <div class="absolute inset-0 grain-bg opacity-[0.03] pointer-events-none"></div>

    <div class="relative p-5 flex flex-col justify-between h-full">
      <div>
        <div class="flex items-center justify-between mb-3.5">
          <span class="px-2.5 py-0.5 bg-[#3d1a14]/10 text-[#3d1a14] text-[8px] font-black uppercase tracking-widest rounded-full">
            Box · {{ sku.grants.length }} Tools
          </span>
          <span v-if="owned" class="text-[8px] font-black uppercase tracking-widest bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full">
            ✓ Collected
          </span>
        </div>

        <h3 class="text-xl font-black leading-none mb-1.5 tracking-tight text-[#3d1a14]">{{ sku.name }}</h3>
        <p class="text-[12px] font-bold text-[#3d1a14]/60 leading-snug mb-4 min-h-[36px]">{{ sku.desc }}</p>

        <div class="flex flex-wrap gap-1.5 mb-5 min-h-[24px]">
          <span
            v-for="g in sku.grants.slice(0, 3)"
            :key="g"
            class="px-2 py-0.5 bg-white border border-[#3d1a14]/10 text-[#3d1a14]/70 rounded-md text-[9px] font-black uppercase tracking-tight shadow-sm"
          >
            {{ formatGrant(g) }}
          </span>
          <span
            v-if="sku.grants.length > 3"
            class="px-2 py-0.5 bg-[#3d1a14]/5 text-[#3d1a14]/40 rounded-md text-[9px] font-black"
          >
            +{{ sku.grants.length - 3 }} more
          </span>
        </div>
      </div>

      <ion-button
        v-if="!owned"
        color="secondary"
        expand="block"
        class="font-black text-[10px] uppercase tracking-widest custom-rounded-button"
        @click="$emit('purchase')"
      >
        {{ (sku as any).priceString || 'Claim Box' }}
      </ion-button>

      <div
        v-else
        class="w-full py-3 rounded-[1rem] bg-[#3d1a14]/5 text-[#3d1a14]/50 text-[10px] font-black uppercase tracking-widest text-center select-none border border-[#3d1a14]/10"
      >
        In Your Collection
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { IonButton } from "@ionic/vue";
import type { ShopSku } from "@/config/catalog.config";
defineProps<{ sku: ShopSku; owned: boolean; highlight?: boolean }>();
defineEmits(["purchase"]);

const formatGrant = (g: string): string => {
	const [, name] = g.split(".");
	return name.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
};
</script>

<style scoped>
.grain-bg {
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.1 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
  background-size: 180px 180px;
}
.custom-rounded-button {
  --border-radius: 1rem;
}
</style>