<template>
  <BaseSheetModal
    :is-open="connectionMenuOpen"
    :title="!isScanning ? 'Add a Mate' : undefined"
    :subtitle="!isScanning ? 'Grow Your Network' : undefined"
    :show-back="isScanning"
    @close="onDismiss"
    @back="stopCameraView"
  >
    <template v-if="isScanning" #header>
      <div class="flex items-center justify-center pt-0 mb-2 mt-4 relative">
        <h2 class="text-3xl text-secondary font-black tracking-tighter italic leading-none">
          Camera
        </h2>
      </div>
    </template>

    <div v-show="!isScanning" class="space-y-6 animate-fade-in pt-1">

      <!-- PARENTAL LOCK: adding mates exchanges name + profile picture, so on a
           child account it stays off until a parent switches it on. -->
      <div
        v-if="mateAddLocked"
        class="bg-amber-100/90 border border-amber-300/60 p-5 rounded-[1.5rem] flex flex-col gap-3 shadow-sm"
      >
        <div class="flex items-start gap-3">
          <ion-icon :icon="svg(mdiShieldLockOutline)" class="text-3xl text-amber-600 shrink-0" />
          <div class="text-amber-900 leading-tight">
            <p class="text-[11px] font-black uppercase tracking-widest mb-1 opacity-80">Locked</p>
            <p class="text-[13px] font-medium opacity-90">
              Adding mates shares your name and profile picture. A parent or guardian needs to
              turn this on before you can share or scan a code.
            </p>
          </div>
        </div>
        <ion-button shape="round" color="warning" size="small" class="self-start" @click="openParentalControls">
          I'm a parent
        </ion-button>
      </div>

      <template v-else>
      <!-- PERSONAL QR CODE -->
      <div class="bg-white/60 border border-white p-5 rounded-[2.5rem] flex items-center justify-between relative mt-1 backdrop-blur-md">
        <div class="flex flex-col z-10 w-full pr-4 min-w-0">
          <span class="text-xs font-black text-black/80 uppercase tracking-widest mb-2">
            Your Personal Code
          </span>

          <div class="flex items-center gap-3 mb-3 min-w-0">
            <ion-avatar class="w-12 h-12 border-2 border-white overflow-hidden bg-white shrink-0">
              <img :src="user?.img" class="object-cover w-full h-full" />
            </ion-avatar>
            <h2 class="text-2xl text-black font-black leading-none truncate min-w-0">
              {{ user?.name }}
            </h2>
          </div>

          <ion-button
            fill="clear"
            color="secondary"
            @click="() => shareUrl(qrURL)"
          >
            <ion-icon slot="start" :icon="svg(mdiShareVariant)" class="mr-2" />
            Share Link
          </ion-button>
        </div>

        <div class="p-2.5 bg-white rounded-[1.5rem] ring-1 ring-black/5 shrink-0">
          <qrcode-vue :value="qrURL" :size="90" background="white" foreground="#000" />
        </div>
      </div>

      <!-- SEARCH SECTION (Gated by Age) -->
      <section class="space-y-3">
        <template v-if="!isUnderAge">
          <p class="text-xs font-black text-black/80 uppercase tracking-widest px-2">
            Search by name
          </p>
          <div class="relative">
            <input
              v-model="mateName"
              @keyup.enter="searchUsers"
              placeholder="Artist name..."
              class="w-full bg-white/50 border border-white rounded-2xl px-5 py-4 text-lg font-black text-black focus:outline-none focus:ring-2 focus:ring-secondary/50 transition-all"
            />
            <div class="absolute right-2 top-1/2 -translate-y-1/2">
              <ion-button fill="clear" color="secondary" @click="searchUsers" :disabled="!mateName">
                <ion-spinner v-if="isSearchingUsers" name="bubbles" size="small" />
                <ion-icon v-else slot="icon-only" :icon="svg(mdiSend)" />
              </ion-button>
            </div>
          </div>

          <div
            v-if="hasSearched || isSearchingUsers || searchWarning"
            class="bg-white/30 rounded-[2rem] border border-white/50 overflow-hidden animate-fade-in p-2"
          >
            <div v-if="searchWarning" class="p-4 text-center text-sm font-bold text-amber-700 italic">
              {{ searchWarning }}
            </div>

            <div v-else-if="foundMates.length === 0 && !isSearchingUsers" class="p-4 text-center text-sm text-black/80 italic">
              No artists found with that name
            </div>

            <div v-else class="max-h-40 overflow-y-auto hide-scrollbar">
              <ion-list lines="none" class="bg-transparent p-0">
                <ion-item
                  v-for="mate in foundMates"
                  :key="mate._id"
                  class="rounded-2xl mb-1 bg-white/40 last:mb-0 cursor-pointer"
                  @click="openUserActions(mate)"
                >
                  <UserAvatar
                    static
                    :user="mate"
                    :customization="mate.customization"
                    size="sm"
                  />
                  <ion-label class="ml-2">
                    <h2 class="font-black text-black">{{ mate.name }}</h2>
                  </ion-label>
                  <ion-icon slot="end" :icon="svg(mdiChevronRight)" class="opacity-30" />
                </ion-item>
              </ion-list>
            </div>
          </div>
        </template>

        <!-- CHILD SAFETY OVERRIDE -->
        <div
          v-else
          class="bg-amber-100/90 border border-amber-300/60 p-4 rounded-[1.5rem] flex items-center gap-3 shadow-sm mx-1"
        >
          <ion-icon :icon="svg(mdiShieldAlertOutline)" class="text-3xl text-amber-600 shrink-0" />
          <div class="text-amber-900 leading-tight">
            <p class="text-[11px] font-black uppercase tracking-widest mb-1 opacity-80">Search Disabled</p>
            <p class="text-[13px] font-medium opacity-90">To keep Sketchmate safe, searching for strangers is locked. You can still add mates in person using a scan code!</p>
          </div>
        </div>
      </section>

      <div class="flex items-center justify-center space-x-4 opacity-30 my-4">
        <div class="h-px bg-black flex-1 rounded-full"></div>
        <span class="text-xs font-black uppercase tracking-widest">OR</span>
        <div class="h-px bg-black flex-1 rounded-full"></div>
      </div>

      <!-- SCAN CAMERA CTA -->
      <ion-button
        @click="startCameraView"
        color="secondary"
        shape="round"
        size="large"
        expand="block"
      >
        <ion-icon slot="start" :icon="svg(mdiQrcodeScan)" class="mr-2" />
        Scan a Mate
      </ion-button>
      </template>

      <!-- This sheet is subtitled "Grow Your Network" but had no way to SEE
           that network — the list lived behind the profile tab's stat buttons
           and nowhere else. Adding people and reviewing who you've added are
           the same errand. -->
      <button
        type="button"
        class="w-full flex items-center gap-3 px-4 py-3 rounded-[1.5rem] border border-white bg-white/50 text-left transition-all active:scale-[0.98] cursor-pointer"
        @click="goToNetwork"
      >
        <span class="shrink-0 w-9 h-9 rounded-xl bg-secondary/10 flex items-center justify-center">
          <ion-icon :icon="svg(mdiAccountGroupOutline)" class="text-secondary text-lg" />
        </span>
        <span class="min-w-0 flex-1">
          <span class="block text-base font-black text-black leading-tight">Your network</span>
          <span class="block text-sm text-black/70 leading-snug">Mates, followers and following</span>
        </span>
        <ion-icon :icon="svg(mdiChevronRight)" class="opacity-30 shrink-0" />
      </button>
    </div>

    <!-- SCANNER VIEW -->
    <div v-show="isScanning" class="flex flex-col h-full animate-fade-in pt-1 pb-2">
      <div class="flex-1 w-full bg-primary/10 rounded-[2.5rem] border border-primary/20 overflow-hidden relative">
        <div v-if="!isNative()" class="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
          <div class="w-48 h-48 border-2 border-dashed border-secondary/60 rounded-3xl"></div>
        </div>
        <video ref="video" class="w-full h-full object-cover bg-black/5" />
        <div class="absolute bottom-6 left-0 right-0 text-center z-10">
          <span class="bg-black/60 text-white text-xs font-black px-4 py-2 rounded-full uppercase tracking-widest backdrop-blur-md">
            Point at a Code
          </span>
        </div>
      </div>
    </div>
  </BaseSheetModal>
</template>

<script setup lang="ts">
import {
	IonAvatar,
	IonButton,
	IonIcon,
	IonItem,
	IonLabel,
	IonList,
	IonSpinner,
	modalController,
	useIonRouter,
} from "@ionic/vue";
import {
	mdiAccountGroupOutline,
	mdiChevronRight,
	mdiQrcodeScan,
	mdiSend,
	mdiShareVariant,
	mdiShieldAlertOutline,
	mdiShieldLockOutline,
} from "@mdi/js";
import { storeToRefs } from "pinia";
import QrcodeVue from "qrcode.vue";
import { computed, ref, watch } from "vue";
import BaseSheetModal from "@/components/general/BaseSheetModal.vue";
import UserAvatar from "@/components/profile/customization/UserAvatar.vue";
import { useUserContextSheet } from "@/composables/profile/useUserContextSheet";
import { masterAnimation } from "@/helper/animation.helper";
import { svg } from "@/helper/general.helper";
import { isNative } from "@/helper/platform.helper";
import { createPersonalShareLink, shareUrl } from "@/helper/share.helper";
import { searchMate } from "@/service/api/user.api";
import { useScanner } from "@/service/scanner.service";
import { useToast } from "@/service/toast.service";
import { useAuthStore } from "@/store/auth.store";
import { useMenuStore } from "@/store/menu.store";
import { useParentalStore } from "@/store/parental.store";
import { FRONTEND_ROUTES } from "@/types/router.types";

// State
const isScanning = ref(false);
const video = ref<HTMLVideoElement>();
const mateName = ref("");
const isSearchingUsers = ref(false);
const foundMates = ref<any[]>([]);
const hasSearched = ref(false);
const searchWarning = ref("");

// Stores/Composables
const { user, isUnderAge } = storeToRefs(useAuthStore());
const { toast } = useToast();
const { startScanning, stopScanning, resetScanning } = useScanner(video);
const { connectionMenuOpen } = storeToRefs(useMenuStore());
const { openUserActions } = useUserContextSheet();

const parental = useParentalStore();

const router = useIonRouter();

const mateAddLocked = computed(
	() => parental.isChildAccount && !parental.isAllowed("mate_add"),
);

function openParentalControls() {
	void parental.openControls();
}

// The QR code and personal link are on screen the moment this sheet opens, so
// the safety reminder has to clear before it renders — not on a later tap.
watch(connectionMenuOpen, async (open) => {
	if (!open || mateAddLocked.value) return;
	const ok = await parental.ensureCanExchange("mate_add");
	if (!ok) onDismiss();
});

const qrURL = computed(() =>
	createPersonalShareLink(user.value?._id || "", "/home"),
);

// Dismiss first: the network page would otherwise load underneath this sheet.
function goToNetwork() {
	onDismiss();
	router.push(`/${FRONTEND_ROUTES.network}?tab=mates`, masterAnimation);
}

// Logic
const startCameraView = async () => {
	isScanning.value = true;
	const code = await startScanning();
	if (code) {
		decode(new URL(code));
	}
};

const stopCameraView = () => {
	stopScanning();
	isScanning.value = false;
};

async function searchUsers() {
	const query = mateName.value.trim();
	if (!user.value) return;

	if (query.length < 3) {
		foundMates.value = [];
		hasSearched.value = false;
		searchWarning.value = "Type at least 3 characters to search...";
		return;
	}

	searchWarning.value = "";
	isSearchingUsers.value = true;
	hasSearched.value = true;

	try {
		const res = await searchMate({
			mateName: query,
			user_id: user.value._id,
		});
		foundMates.value = res || [];
	} catch (e) {
		toast("Search failed", { color: "danger" });
		hasSearched.value = false;
	} finally {
		isSearchingUsers.value = false;
	}
}

function decode(url: URL) {
	const mateValue = url.searchParams.get("mate");
	if (!mateValue) {
		toast("Invalid sketchmate code", { color: "danger" });
		isScanning.value = false;
		return;
	}
	openUserActions({ _id: mateValue });
	closeModal();
}

function closeModal() {
	modalController.dismiss();
}

function onDismiss() {
	stopScanning();
	resetScanning();
	isScanning.value = false;
	connectionMenuOpen.value = false;
	mateName.value = "";
	foundMates.value = [];
	hasSearched.value = false;
	searchWarning.value = "";
}
</script>

<style scoped>
.animate-fade-in {
  animation: fadeIn 0.3s ease-out forwards;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

input {
  appearance: none;
  -webkit-appearance: none;
}
</style>