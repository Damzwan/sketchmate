<template>
  <ShopCardShell :sku="sku" :owned="owned" :highlight="highlight" @purchase="$emit('purchase')">
    <template #preview>
      <div class="h-32 bg-gradient-to-br from-zinc-50 to-zinc-100 relative flex items-center justify-center">
        <!-- Mini avatar with the decoration applied -->
        <div class="relative w-16 h-16">
          <div
            class="w-full h-full rounded-full border-[3px] border-[#B9463A] flex items-center justify-center overflow-hidden bg-white"
          >
            <img
              v-if="user?.img"
              :src="user.img"
              alt=""
              class="w-full h-full object-cover"
            />
            <span v-else class="text-2xl">🎨</span>
          </div>
          <AvatarDecoration v-if="decorationDef" :def="decorationDef" />
        </div>
      </div>
    </template>
  </ShopCardShell>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { ShopSku } from '@/config/catalog.config'
import { resolveDecoration } from '@/config/profile_options.config'
import ShopCardShell from './ShopCardShell.vue'
import AvatarDecoration from '@/components/profile/customization/AvatarDecoration.vue'

const props = defineProps<{
  sku: ShopSku
  user?: any
  owned: boolean
  highlight?: boolean
}>()

defineEmits(['purchase'])

const decorationDef = computed(() => resolveDecoration(props.sku.refId))
</script>