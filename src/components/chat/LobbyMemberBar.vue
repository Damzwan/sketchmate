<template>
  <div class="flex items-center gap-5 px-4 pt-3 pb-2 overflow-x-auto hide-scrollbar bg-white/5 border-b border-white/10 cabin-sketch-regular">
    <div
      v-for="member in members"
      :key="member._id"
      class="flex flex-col items-center gap-1.5 shrink-0 cursor-pointer group"
      @click="$emit('inspect', $event, member)"
    >

      <div
        class="transition-transform active:scale-90 flex-shrink-0"
        :style="{ filter: `drop-shadow(0 1px 6px ${accentOf(member)}80)` }"
      >
        <UserAvatar
          :user="member"
          :customization="member.customization"
          size="sm"
          static
        />
      </div>

      <span
        class="text-[10px] font-black uppercase tracking-tighter truncate w-16 text-center leading-none transition-colors"
        :class="member._id === currentUserId ? 'text-secondary' : 'text-black/50'"
      >
        {{ member._id === currentUserId ? 'You' : member.name.split(' ')[0] }}
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import UserAvatar from "@/components/profile/customization/UserAvatar.vue";
import {
	hydrateCustomization,
	resolveTheme,
} from "@/config/profile_options.config";

defineProps<{
	members: any[];
	currentUserId: string | undefined;
}>();

defineEmits(["inspect"]);

// Cheap per-member customization cue: a soft glow in their theme accent. No
// lottie/world per avatar here — a member bar can hold many at once.
const accentOf = (m: any) =>
	resolveTheme(hydrateCustomization(m?.customization).themeId).accentColor;
</script>

<style scoped>
.hide-scrollbar::-webkit-scrollbar {
  display: none;
}
.hide-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
</style>