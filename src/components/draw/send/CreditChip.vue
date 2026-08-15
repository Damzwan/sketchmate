<template>
  <!-- Shared by the shoutout and collaborator rows. The two rows differ in where
       their people come from (a searched mate list vs. whoever drew in the
       room), but a credited person looks the same either way. -->
  <button
    type="button"
    class="shrink-0 flex items-center gap-2 pl-1 pr-3 py-1 rounded-full border-2 transition-all cursor-pointer active:scale-95"
    :class="selected ? 'border-secondary bg-secondary/15' : 'border-primary/30 bg-white/60'"
    @click.stop="emit('toggle')"
  >
    <UserAvatar
      :user="user"
      :customization="hydrateCustomization(user?.customization)"
      size="xs"
      static
      class="shrink-0"
      :class="selected ? '' : 'opacity-60'"
    />
    <span
      class="text-xs font-black truncate max-w-[7rem]"
      :class="selected ? 'text-black' : 'text-black/60'"
    >
      {{ user.name }}
    </span>
    <ion-icon
      :icon="svg(selected ? mdiCheck : mdiPlus)"
      class="text-sm shrink-0"
      :class="selected ? 'text-secondary' : 'text-black/40'"
    />
  </button>
</template>

<script setup lang="ts">
import { IonIcon } from "@ionic/vue";
import { mdiCheck, mdiPlus } from "@mdi/js";
import UserAvatar from "@/components/profile/customization/UserAvatar.vue";
import { hydrateCustomization } from "@/config/profile_options.config";
import { svg } from "@/helper/general.helper";

defineProps<{
	user: { _id: string; name: string; img?: string; customization?: any };
	selected: boolean;
}>();
const emit = defineEmits<(event: "toggle") => void>();
</script>
