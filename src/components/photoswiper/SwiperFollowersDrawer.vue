<template>
  <ion-modal
    :is-open="open"
    @did-dismiss="close"
    :initial-breakpoint="1"
    :breakpoints="[0, 1]"
    handle-behavior="cycle"
    class="followers-modal"
  >
    <div class="h-full flex flex-col bg-background cabin-sketch-regular max-h-[60vh]" @touchmove.stop>
      <!-- Header -->
      <div class="shrink-0 pt-5 px-5 pb-3 text-center border-b border-black/5">
        <h1 class="text-xl text-black font-black tracking-tight italic leading-none">Followers</h1>
        <p class="text-[11px] text-black/40 uppercase tracking-widest mt-1">
          {{ followers.length }} {{ followers.length === 1 ? 'person' : 'people' }}
        </p>
      </div>

      <div class="absolute top-2 right-2 z-20">
        <ion-button @click="close" fill="clear" color="dark" class="m-0">
          <ion-icon :icon="svg(mdiClose)" slot="icon-only" class="text-2xl" />
        </ion-button>
      </div>

      <!-- List -->
      <div class="flex-1 overflow-y-auto px-3 py-2 hide-scrollbar">
        <button
          v-for="follower in followers"
          :key="follower"
          @click="handleTap(follower)"
          class="w-full flex items-center px-3 py-3 rounded-2xl active:bg-black/5 transition-colors text-left cursor-pointer"
        >
          <UserAvatar
            :user="resolveUser(follower)"
            :img="resolveImg(follower)"
            :customization="resolveUser(follower)?.customization"
            size="sm"
            static
            class="shrink-0"
          />

          <div class="flex-1 ml-3 min-w-0">
            <p class="text-sm font-black text-black truncate">
              {{ resolveName(follower) }}
              <span v-if="follower === user._id" class="text-black/40 font-normal italic">(you)</span>
            </p>
          </div>

          <ion-icon
            :icon="svg(mdiChevronRight)"
            class="text-xl text-black/30 shrink-0"
          />
        </button>
      </div>
    </div>
  </ion-modal>
</template>

<script setup lang="ts">
import { IonButton, IonIcon, IonModal } from "@ionic/vue";
import { mdiChevronRight, mdiClose } from "@mdi/js";
import UserAvatar from "@/components/profile/customization/UserAvatar.vue";
import { useUserContextSheet } from "@/composables/profile/useUserContextSheet";
import { senderImg, senderName, svg } from "@/helper/general.helper";

const props = defineProps<{
	followers: string[];
	user: any;
	open: boolean;
	userLookup?: (userId: string) => any;
}>();

const emit = defineEmits(["update:open"]);

const { openUserActions } = useUserContextSheet();

function resolveUser(id: string) {
	return props.userLookup ? props.userLookup(id) : null;
}

function resolveImg(id: string): string | undefined {
	const u = resolveUser(id);
	return u?.img || senderImg(u);
}

function resolveName(id: string): string {
	const u = resolveUser(id);
	return u?.name || senderName(u) || "Sketcher";
}

function handleTap(followerId: string) {
	const userInfo = resolveUser(followerId);
	openUserActions({
		_id: followerId,
		name: userInfo?.name,
		img: userInfo?.img,
	});
}

function close() {
	emit("update:open", false);
}
</script>

<style scoped>
.hide-scrollbar::-webkit-scrollbar {
  display: none;
}

.hide-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}

ion-modal.followers-modal {
  --border-radius: 2.5rem 2.5rem 0 0;
  --background: var(--ion-color-tertiary, #fff);
  --height: auto;
  --max-height: 70vh;
}
</style>