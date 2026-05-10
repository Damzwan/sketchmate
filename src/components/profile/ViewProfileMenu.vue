<template>
  <ion-modal
    :is-open="viewProfileMenuOpen"
    @did-dismiss="viewProfileMenuOpen = false"
    :initial-breakpoint="1"
    :breakpoints="[0, 1]"
    handle-behavior="cycle"
    class="liquid-profile-modal"
  >
    <div
      class="h-full bg-background cabin-sketch-regular overflow-y-auto hide-scrollbar max-h-[85vh]"
      @touchmove.stop
    >
      <!-- Loading State -->
      <div v-if="loadingProfile" class="flex flex-col items-center justify-center py-20">
        <ion-spinner name="bubbles" color="secondary" />
        <p class="text-xs font-black uppercase tracking-widest mt-4 opacity-40">Finding Artist...</p>
      </div>

      <!-- Profile Content -->
      <div v-else-if="targetProfile" class="p-6 pb-20 animate-fade-in">

        <section
          class="mt-12 bg-white/40 border border-white/60 rounded-[3rem] relative px-6 pb-8 pt-4 backdrop-blur-md"
        >
          <div class="flex flex-col items-center -mt-20 relative z-20">
            <!-- Avatar -->
            <div class="relative">
              <div class="w-32 h-32 rounded-[2.5rem] border-4 border-white shadow-md overflow-hidden bg-white">
                <img :src="targetProfile.img" class="w-full h-full object-cover" />
              </div>
              <div
                v-if="isFriendOnline(targetProfile._id)"
                class="absolute bottom-1 right-1 w-6 h-6 bg-green-400 rounded-full border-4 border-white shadow-sm"
              ></div>
            </div>

            <!-- Name & Badges -->
            <div class="text-center mt-4 w-full">
              <h2 class="text-3xl font-black text-black leading-none">{{ targetProfile.name }}</h2>

              <div class="flex items-center justify-center gap-2 mt-2">
                <span v-if="isMe"
                      class="bg-secondary text-white text-[10px] font-black px-4 py-1.5 rounded-full uppercase tracking-widest shadow-sm">
                   That's You!
                 </span>
                <template v-else>
                  <span v-if="targetProfile.relationship?.isFriend"
                        class="bg-secondary/10 text-secondary text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest border border-secondary/20">
                    Mates
                  </span>
                  <span v-else-if="targetProfile.relationship?.isFollowing"
                        class="bg-black/5 text-black/40 text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest">
                      Following
                  </span>
                </template>
              </div>

              <!-- Stats Bar -->
              <div class="flex items-center justify-around w-full mt-6 border-y border-black/5 py-4">
                <div class="text-center">
                  <p class="text-xl font-black text-black leading-none">{{ targetProfile.stats?.posts || 0 }}</p>
                  <p class="text-[10px] font-bold text-black/40 uppercase tracking-tighter">Sketches</p>
                </div>
                <div class="w-px h-6 bg-black/5"></div>
                <div class="text-center">
                  <p class="text-xl font-black text-black leading-none">{{ targetProfile.stats?.followers || 0 }}</p>
                  <p class="text-[10px] font-bold text-black/40 uppercase tracking-tighter">Followers</p>
                </div>
                <div class="w-px h-6 bg-black/5"></div>
                <div class="text-center">
                  <p class="text-xl font-black text-black leading-none">{{ targetProfile.stats?.following || 0 }}</p>
                  <p class="text-[10px] font-bold text-black/40 uppercase tracking-tighter">Following</p>
                </div>
              </div>

              <!-- Bio -->
              <p class="text-sm font-bold text-black/60 italic mt-6 px-4 leading-snug whitespace-pre-wrap">
                "{{ targetProfile.description || 'This artist is a mystery...' }}"
              </p>
            </div>

            <!-- Actions -->
            <div v-if="!isMe" class="grid grid-cols-2 gap-4 w-full mt-8">
              <ion-button
                @click="handleToggleFollow"
                color="secondary"
                :fill="targetProfile.relationship?.isFollowing ? 'outline' : 'solid'"
                class="h-12 text-sm font-black uppercase tracking-widest ion-no-shadow"
                style="--border-radius: 1.25rem;"
              >
                {{ targetProfile.relationship?.isFollowing ? 'Unfollow' : 'Follow' }}
              </ion-button>

              <ion-button
                @click="startChat"
                color="secondary"
                class="h-12 text-sm font-black uppercase tracking-widest"
                style="--border-radius: 1.25rem;"
              >
                <ion-icon slot="start" :icon="svg(mdiChatOutline)" />
                Message
              </ion-button>
            </div>
          </div>
        </section>

        <!-- Portfolio Grid -->
        <section class="mt-10">
          <div class="flex items-center justify-between px-2 mb-4">
            <h3 class="text-xl font-black text-black italic">Portfolio</h3>
          </div>

          <div
            v-if="targetPosts.length"
            class="grid grid-cols-2 gap-4 px-1"
          >
            <div
              v-for="(post, index) in targetPosts"
              :key="post._id"
              class="aspect-square bg-white/40 rounded-[2.2rem] border border-white/60 shadow-sm relative overflow-hidden active:scale-95 transition-transform"
              @click="openPostSwiper(targetPosts, index)"
            >
              <img :src="post.thumbnail_url" class="w-full h-full object-cover" loading="lazy" />
            </div>
          </div>

          <div v-else class="text-center py-12 bg-white/20 rounded-[2.5rem] border-2 border-dashed border-black/5">
            <p class="text-sm font-bold text-black/30 italic">No public sketches yet.</p>
          </div>
        </section>

      </div>
    </div>
  </ion-modal>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { IonModal, IonButton, IonIcon, IonSpinner } from '@ionic/vue'
import { mdiChatOutline } from '@mdi/js'
import { svg } from '@/helper/general.helper'

import { useMenuStore } from '@/store/menu.store'
import { useFriendStore } from '@/store/friend.store'
import { useAuthStore } from '@/store/auth.store'
import { useChatStore } from '@/store/chat.store'
import { useChatWidgetStore } from '@/store/chatWidget.store'
import { usePostSwiper } from '@/composables/home/usePostSwiper'
import { toggleFollow } from '@/service/api/user.api'
import { useToast } from '@/service/toast.service'

const menuStore = useMenuStore()
const friendStore = useFriendStore()
const authStore = useAuthStore()
const chatStore = useChatStore()
const chatWidget = useChatWidgetStore()

const { toast } = useToast()
const { openPostSwiper } = usePostSwiper()

const { viewProfileMenuOpen } = storeToRefs(menuStore)
const { targetProfile, targetPosts, loadingProfile, isFriendOnline } = storeToRefs(friendStore)
const { user } = storeToRefs(authStore)
const { activeChats } = storeToRefs(chatStore)

const isMe = computed(() => targetProfile.value?._id === user.value?._id)

async function handleToggleFollow() {
  if (!targetProfile.value || isMe.value) return
  try {
    await toggleFollow(targetProfile.value._id)
    // Update local state for immediate feedback
    if (targetProfile.value.relationship) {
      targetProfile.value.relationship.isFollowing = !targetProfile.value.relationship.isFollowing

      // Manually adjust follower count locally for the vibe
      if (targetProfile.value.stats) {
        targetProfile.value.stats.followers += targetProfile.value.relationship.isFollowing ? 1 : -1
      }
    }
  } catch (e) {
    toast('Action failed', { color: 'danger' })
  }
}

function startChat() {
  if (!targetProfile.value) return
  const targetId = targetProfile.value._id

  const existingChat = activeChats.value.find(c =>
    c.participants.some(p => p._id === targetId)
  )

  if (existingChat) {
    chatWidget.openPrivateChat(existingChat._id)
  } else {
    chatWidget.addChatHead(targetId, 'friend')
    chatWidget.activeTab = targetId
    chatWidget.openPanel()
  }

  viewProfileMenuOpen.value = false
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

.overflow-y-auto {
  -webkit-overflow-scrolling: touch;
}

ion-modal.liquid-profile-modal {
  --height: auto;
  --max-height: 85vh;
  --border-radius: 2.5rem 2.5rem 0 0;
}

.animate-fade-in {
  animation: fadeIn 0.4s ease-out forwards;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

</style>