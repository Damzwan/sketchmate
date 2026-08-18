<template>
  <section class="min-h-[122px] overflow-visible">
    <div class="flex items-center justify-between px-1 mb-2">
      <h2 class="cabin-sketch-regular uppercase tracking-widest font-black text-black/80">
        Public Lobbies
      </h2>
      <transition name="fade">
        <div v-if="!loading" class="flex items-center gap-1.5">
          <span class="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
          <span class="text-[10px] font-black text-black/80 uppercase tracking-widest">Live Now</span>
        </div>
      </transition>
    </div>

    <transition name="fade-slow" mode="out-in">
      <div v-if="loading" key="loading" class="flex overflow-x-auto gap-2.5 pb-1 hide-scrollbar">
        <div
          v-for="i in 10"
          :key="i"
          class="min-w-[120px] max-w-[120px] h-24 bg-tertiary rounded-[1.75rem] border border-black/5 animate-pulse"
        ></div>
      </div>

      <div v-else key="data"
           class="flex overflow-x-auto gap-2.5 pb-2 snap-x snap-mandatory hide-scrollbar overflow-visible">
        <div
          v-for="lobby in sortedLobbies"
          :key="lobby.id"
          class="min-w-[120px] max-w-[120px] bg-tertiary rounded-[1.75rem] overflow-hidden snap-start flex-shrink-0 border transition-all duration-300 relative shadow-sm"
          :class="[
            lobby.users >= (lobby.maxUsers + lobby.premiumSlots)
              ? 'opacity-50 cursor-not-allowed border-black/5'
              : 'cursor-pointer active:scale-95 border-primary/40 hover:border-secondary/40'
          ]"
          @click="handleLobbyClick(lobby)"
        >
          <div class="h-[72px] w-full relative overflow-hidden group bg-[#FAF8F5]">

            <div
              v-if="!lobby.thumbnailUrl || !imageLoaded[lobby.id]"
              class="absolute inset-0 flex items-center justify-center transition-opacity duration-300 bg-[#FAF0E6FF]"
              :class="{ 'animate-pulse': lobby.thumbnailUrl }"
            >
              <ion-icon :icon="svg(mdiPalette)"
                        class="text-xl opacity-30 grayscale group-hover:rotate-12 transition-transform duration-300" />
            </div>

<img
              width="1"
              height="1"
              loading="lazy"
              decoding="async"
              v-if="lobby.thumbnailUrl"
              :src="lobby.thumbnailUrl"
              class="w-full h-full object-cover transition-opacity duration-500 ease-in-out"
              :class="imageLoaded[lobby.id] ? 'opacity-100' : 'opacity-0'"
              @load="imageLoaded[lobby.id] = true"
              @error="handleImageError(lobby.id)"
              alt="Lobby preview"
            />

            <div
              class="absolute top-2 right-2 px-2 py-0.5 backdrop-blur-md rounded-full text-[9px] text-white flex items-center gap-1 font-black shadow-sm tracking-wider uppercase"
              :class="getBadgeClass(lobby)"
            >
              <span
                v-if="lobby.users < (lobby.maxUsers + lobby.premiumSlots)"
                class="w-1.5 h-1.5 rounded-full shrink-0"
                :class="getDotClass(lobby)"
              ></span>

              <template v-if="lobby.users >= (lobby.maxUsers + lobby.premiumSlots)">
                Full
              </template>
              <!-- Tier still unknown (first launch on this device): render the raw
                   head count. Anything tier-derived here would paint the free
                   variant and then visibly correct itself a moment later. -->
              <template v-else-if="!quotaStore.isTierResolved">
                {{ lobby.users }}
              </template>
              <template v-else-if="lobby.users >= lobby.maxUsers && !quotaStore.isPro">
                VIP
              </template>
              <template v-else>
                {{ lobby.users }}/{{ quotaStore.isPro ? (lobby.maxUsers + lobby.premiumSlots) : lobby.maxUsers }}
              </template>
            </div>
          </div>

          <div class="px-2 py-1.5 bg-white/50 flex flex-col min-w-0">
            <h3 class="text-[11px] font-black text-black truncate tracking-tight leading-tight">
              {{ lobby.name }}
            </h3>
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
import { IonIcon } from "@ionic/vue";
import { mdiPalette } from "@mdi/js";
import { computed, ref } from "vue";
import PremiumLobbyModal from "@/components/draw/PremiumLobbyModal.vue";
import { svg } from "@/helper/general.helper";
import { useQuotaStore } from "@/store/quota.store";
import { useSubscriptionStore } from "@/store/subscription.store";

export interface PublicLobbyProps {
	id: string;
	name: string;
	users: number;
	maxUsers: number;
	premiumSlots: number;
	thumbnailUrl?: string;
}

const props = defineProps<{
	lobbies: PublicLobbyProps[];
	loading: boolean;
}>();

const emit = defineEmits<(e: "join", id: string) => void>();

const quotaStore = useQuotaStore();

const showPremiumModal = ref(false);
const imageLoaded = ref<Record<string, boolean>>({});

const sortedLobbies = computed(() => {
	return [...props.lobbies].sort((a, b) => b.users - a.users);
});

/* Modern minimal badge background tints */
const getBadgeClass = (lobby: PublicLobbyProps) => {
	const totalCap = lobby.maxUsers + lobby.premiumSlots;
	if (lobby.users >= totalCap) return "bg-zinc-800 text-white/90";
	if (lobby.users >= lobby.maxUsers) return "bg-amber-500 text-white";
	return "bg-secondary text-white";
};

/* Micro Status indicator dot colors inside the layout badge frame */
const getDotClass = (lobby: PublicLobbyProps) => {
	if (lobby.users >= lobby.maxUsers) return "bg-amber-200 animate-pulse";
	return "bg-green-400 animate-pulse";
};

const handleImageError = (lobbyId: string) => {
	imageLoaded.value[lobbyId] = false;
};

const handleLobbyClick = (lobby: PublicLobbyProps) => {
	const totalCapacity = lobby.maxUsers + lobby.premiumSlots;

	if (lobby.users >= totalCapacity) return;

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
	const { openPaywall } = useSubscriptionStore();
	openPaywall();
};
</script>

<style scoped>
.hide-scrollbar::-webkit-scrollbar {
  display: none !important;
  width: 0 !important;
  height: 0 !important;
}

.hide-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}

.fade-enter-active, .fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from, .fade-leave-to {
  opacity: 0;
}

.fade-slow-enter-active, .fade-slow-leave-active {
  transition: opacity 0.4s ease;
}

.fade-slow-enter-from, .fade-slow-leave-to {
  opacity: 0;
}
</style>
