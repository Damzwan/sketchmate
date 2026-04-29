<template>
  <section class="min-h-[180px]">
    <div class="flex items-center justify-between px-1 mb-3">
      <h2 class="text-base font-black text-black">Active Lobbies</h2>
      <transition name="fade">
        <span v-if="!loading" class="text-[10px] font-bold text-black/50 uppercase tracking-wider">Live</span>
      </transition>
    </div>

    <transition name="fade-slow" mode="out-in">
      <div v-if="loading" key="loading" class="flex overflow-x-auto gap-4 pb-2 hide-scrollbar">
        <div
          v-for="i in 3" :key="i"
          class="min-w-[170px] max-w-[170px] bg-black/5 rounded-3xl overflow-hidden flex-shrink-0 border border-black/10 animate-pulse"
        >
          <div class="h-28 bg-black/10 w-full border-b border-black/5"></div>
          <div class="p-3"><div class="h-3 w-24 bg-black/10 rounded-full"></div></div>
        </div>
      </div>

      <div v-else key="data" class="flex overflow-x-auto gap-4 pb-2 snap-x snap-mandatory hide-scrollbar">
        <div
          v-for="lobby in sortedLobbies"
          :key="lobby.id"
          class="min-w-[170px] max-w-[170px] bg-primary/40 rounded-3xl overflow-hidden snap-start flex-shrink-0 border border-primary/60 transition-all"
          :class="[
            lobby.users >= lobby.maxUsers
              ? 'opacity-60 cursor-not-allowed grayscale-[0.5]'
              : 'cursor-pointer active:scale-95'
          ]"
          @click="lobby.users < lobby.maxUsers && emit('join', lobby.id)"
        >
          <div
            class="h-28 w-full relative border-b border-primary/40 overflow-hidden group"
            :style="{ backgroundColor: '#FAF0E6FF' }"
          >
            <div
              v-if="!lobby.thumbnailUrl || !imageLoaded[lobby.id]"
              class="absolute inset-0 flex items-center justify-center transition-opacity duration-300"
              :class="{ 'animate-pulse': lobby.thumbnailUrl }"
            >
              <span class="text-2xl opacity-20 grayscale group-hover:scale-110 transition-transform">🖌️</span>
            </div>

            <img
              v-if="lobby.thumbnailUrl"
              :key="lobby.thumbnailUrl"
              :src="lobby.thumbnailUrl"
              class="w-full h-full object-cover transition-opacity duration-700 ease-in-out"
              :class="imageLoaded[lobby.id] ? 'opacity-100' : 'opacity-0'"
              @load="imageLoaded[lobby.id] = true"
              @error="handleImageError(lobby.id)"
              alt="Lobby preview"
            />

            <div v-if="lobby.users >= lobby.maxUsers" class="absolute inset-0 bg-black/10 flex items-center justify-center">
              <span class="bg-black/60 text-white text-[10px] font-black px-2 py-1 rounded-lg uppercase tracking-tighter">Full</span>
            </div>

            <div class="absolute top-2 right-2 px-2 py-1 bg-secondary/90 backdrop-blur-sm rounded-full text-[10px] text-white flex items-center font-black shadow-sm">
              <span
                class="w-1.5 h-1.5 rounded-full mr-1"
                :class="lobby.users >= lobby.maxUsers ? 'bg-red-500' : 'bg-green-400 animate-pulse'"
              ></span>
              {{ lobby.users }} / {{ lobby.maxUsers }}
            </div>
          </div>

          <div class="p-3 bg-white/30 backdrop-blur-md">
            <h3 class="text-xs font-bold text-black truncate">{{ lobby.name }}</h3>
          </div>
        </div>
      </div>
    </transition>
  </section>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'

export interface PublicLobbyProps {
  id: string;
  name: string;
  users: number;
  maxUsers: number;
  thumbnailUrl?: string;
}

const props = defineProps<{
  lobbies: PublicLobbyProps[]
  loading: boolean
}>()

const emit = defineEmits<{
  (e: 'join', id: string): void
}>()

const sortedLobbies = computed(() => {
  return [...props.lobbies].sort((a, b) => b.users - a.users)
})

const imageLoaded = ref<Record<string, boolean>>({})

const handleImageError = (lobbyId: string) => {
  imageLoaded.value[lobbyId] = false
}
</script>

<style scoped>
.hide-scrollbar::-webkit-scrollbar { display: none; }
.hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }

.fade-slow-enter-active, .fade-slow-leave-active { transition: opacity 0.4s ease; }
.fade-slow-enter-from, .fade-slow-leave-to { opacity: 0; }

.fade-enter-active, .fade-leave-active { transition: opacity 0.2s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

@keyframes soft-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
.animate-pulse { animation: soft-pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite; }
</style>