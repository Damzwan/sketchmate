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
        <!-- Loader... -->
      </div>

      <div v-else key="data" class="flex overflow-x-auto gap-4 pb-2 snap-x snap-mandatory hide-scrollbar">
        <div
          v-for="lobby in sortedLobbies"
          :key="lobby.id"
          class="min-w-[170px] max-w-[170px] bg-primary/40 rounded-3xl overflow-hidden snap-start flex-shrink-0 border border-primary/60 transition-all"
          :class="[
            lobby.users >= (lobby.maxUsers + lobby.premiumSlots)
              ? 'opacity-60 cursor-not-allowed grayscale-[0.5]'
              : 'cursor-pointer active:scale-95'
          ]"
          @click="handleLobbyClick(lobby)"
        >
          <div
            class="h-28 w-full relative border-b border-primary/40 overflow-hidden group"
            :style="{ backgroundColor: '#FAF0E6FF' }"
          >
            <!-- Background & Images (Same as before) -->
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

            <!-- TOTALLY FULL Overlay -->
            <div v-if="lobby.users >= (lobby.maxUsers + lobby.premiumSlots)" class="absolute inset-0 bg-black/10 flex items-center justify-center">
              <span class="bg-black/60 text-white text-[10px] font-black px-2 py-1 rounded-lg uppercase tracking-tighter">Full</span>
            </div>

            <div
              class="absolute top-2 right-2 px-2.5 py-1 backdrop-blur-md rounded-full text-[10px] text-white flex items-center font-black shadow-md tracking-wide transition-all duration-300"
              :class="getBadgeClass(lobby)"
            >
              <span v-if="lobby.users >= lobby.maxUsers" class="text-xs mr-1 animate-pulse">👑</span>
              <span v-else class="w-1.5 h-1.5 rounded-full mr-1.5" :class="getDotClass(lobby)"></span>

              <template v-if="quotaStore.isPro">
                <template v-if="lobby.users < (lobby.maxUsers + lobby.premiumSlots)">
                  {{ lobby.users }} / {{ lobby.maxUsers + lobby.premiumSlots }}
                </template>
                <template v-else>FULL</template>
              </template>

              <template v-else>
                <template v-if="lobby.users < lobby.maxUsers">
                  {{ lobby.users }} / {{ lobby.maxUsers }}
                  <span class="ml-1 text-[9px] font-extrabold text-amber-300 bg-black/20 px-1 py-0.5 rounded-md leading-none">
                    +{{ lobby.premiumSlots }} VIP
                  </span>
                </template>

                <template v-else-if="lobby.users < (lobby.maxUsers + lobby.premiumSlots)">
                  VIP ONLY
                </template>

                <template v-else>FULL</template>
              </template>
            </div>
          </div>

          <div class="p-3 bg-white/30 backdrop-blur-md">
            <h3 class="text-xs font-bold text-black truncate">{{ lobby.name }}</h3>
          </div>
        </div>
      </div>
    </transition>

    <PremiumLobbyModal
      :is-open="showPremiumModal"
      @close="showPremiumModal = false"
      @upgrade="goToPro"
    />
  </section>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { useIonRouter } from "@ionic/vue";
import { useQuotaStore } from "@/store/quota.store";
import PremiumLobbyModal from "@/components/draw/PremiumLobbyModal.vue";

export interface PublicLobbyProps {
	id: string;
	name: string;
	users: number;
	maxUsers: number;
	premiumSlots: number; // NEW
	thumbnailUrl?: string;
}

const props = defineProps<{
	lobbies: PublicLobbyProps[];
	loading: boolean;
}>();

const emit = defineEmits<{
	(e: "join", id: string): void;
}>();

const router = useIonRouter();
const quotaStore = useQuotaStore();

const showPremiumModal = ref(false);
const imageLoaded = ref<Record<string, boolean>>({});

const sortedLobbies = computed(() => {
	return [...props.lobbies].sort((a, b) => b.users - a.users);
});

// UI Helper Methods for the Badge
const getBadgeClass = (lobby: PublicLobbyProps) => {
	if (lobby.users >= lobby.maxUsers + lobby.premiumSlots)
		return "bg-red-500/90";
	if (lobby.users >= lobby.maxUsers) return "bg-amber-500/90"; // Premium state
	return "bg-secondary/90"; // Normal state
};

const getDotClass = (lobby: PublicLobbyProps) => {
	if (lobby.users >= lobby.maxUsers + lobby.premiumSlots) return "bg-white/50";
	if (lobby.users >= lobby.maxUsers) return "bg-white animate-pulse";
	return "bg-green-400 animate-pulse";
};

const handleImageError = (lobbyId: string) => {
	imageLoaded.value[lobbyId] = false;
};

// Core Click Logic
const handleLobbyClick = (lobby: PublicLobbyProps) => {
	const totalCapacity = lobby.maxUsers + lobby.premiumSlots;

	if (lobby.users >= totalCapacity) {
		return;
	}

	if (lobby.users >= lobby.maxUsers) {
		if (quotaStore.isPro) {
			emit("join", lobby.id);
		} else {
			showPremiumModal.value = true;
		}
		return;
	}

	emit("join", lobby.id);
};

const goToPro = () => {
	// router.push({ path: FRONTEND_ROUTES.subscribe });
};
</script>