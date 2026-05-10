<template>
  <div class="flex items-center gap-5 px-4 overflow-x-auto hide-scrollbar bg-white/5 border-b border-white/10 cabin-sketch-regular">
    <div
      v-for="member in members"
      :key="member._id"
      class="flex flex-col items-center gap-1.5 shrink-0 cursor-pointer group"
      @click="$emit('inspect', $event, member)"
    >
      <div
        class="relative w-12 h-12 rounded-[1.2rem] border-2 shadow-sm transition-transform active:scale-90 flex-shrink-0"
        :class="member._id === currentUserId ? 'border-secondary' : 'border-white'"
      >
        <img :src="member.img" class="w-full h-full object-cover rounded-[1.1rem]" />
      </div>

      <span
        class="text-[10px] font-black uppercase tracking-tighter truncate w-14 text-center leading-none transition-colors"
        :class="member._id === currentUserId ? 'text-secondary' : 'text-black/50'"
      >
        {{ member._id === currentUserId ? 'You' : member.name.split(' ')[0] }}
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  members: any[];
  currentUserId: string | undefined;
}>();

defineEmits(['inspect']);
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