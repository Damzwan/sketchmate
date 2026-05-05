<template>
  <ion-page>
    <TopBar title="Profile" />

    <ion-content class="bg-background">
      <transition name="liquid-fade" mode="out-in">

        <!-- 1. SKELETON STATE -->
        <div v-if="loadingAccount" key="skeleton" class="px-4 pt-6 pb-12 max-w-2xl mx-auto cabin-sketch-regular">
          <section
            class="mt-16 bg-primary/10 rounded-[3rem] border border-primary/20 shadow-sm relative px-6 pb-8 pt-4">
            <div class="flex flex-col items-center -mt-20 relative z-20">
              <div class="w-32 h-32 rounded-[2.5rem] bg-primary/20 animate-pulse shadow-sm"></div>
              <div class="mt-6 h-8 w-48 bg-primary/20 rounded-xl animate-pulse"></div>
              <div class="mt-4 h-4 w-64 bg-primary/10 rounded-md animate-pulse"></div>
              <div class="mt-10 h-12 w-full max-w-xs bg-primary/5 rounded-2xl animate-pulse"></div>
            </div>
          </section>
        </div>

        <!-- 2. MAIN CONTENT -->
        <div v-else-if="user" key="content" class="px-4 pt-6 pb-12 max-w-2xl mx-auto cabin-sketch-regular">

          <!-- Profile Card -->
          <section
            class="mt-16 bg-primary/20 backdrop-blur-2xl rounded-[3rem] border border-primary/30 shadow-lg relative px-6 pb-8 pt-4">

            <!-- Action Group: Anchored to right to prevent shifting -->
            <div class="absolute top-4 right-4 flex flex-row-reverse items-center z-50">

              <!-- Edit / Save Button (Always on the far right) -->
              <ion-button
                fill="clear"
                class="ml-3"
                color="secondary"
                :class="{ 'confirm-mode-btn': isEditing }"
                @click="toggleEdit"
              >
                <ion-icon slot="icon-only" :class="isEditing ? 'text-white' : 'text-black'"
                          :icon="svg(isEditing ? mdiCheck : mdiPencil)" />
              </ion-button>

              <!-- Settings Button (Fades out without moving the Edit button) -->
              <transition name="fade">
                <ion-button
                  v-if="!isEditing"
                  fill="clear"
                  color="secondary"
                  @click="goToSettings"
                >
                  <ion-icon slot="icon-only" class="text-black" :icon="svg(mdiCog)" />
                </ion-button>
              </transition>
            </div>

            <div class="flex flex-col items-center -mt-20 relative z-20">
              <ProfilePictureSelector :img="user.img" @update:img="handleImgUpdate" />

              <!-- Display Mode -->
              <div v-if="!isEditing" class="text-center mt-4 w-full">
                <h2 class="text-3xl font-black text-black drop-shadow-sm">{{ user.name }}</h2>
                <p class="text-sm font-bold text-black/60 italic mt-2 px-4 leading-snug whitespace-pre-wrap">
                  "{{ user.description || 'No description yet.' }}"
                </p>
              </div>

              <!-- Edit Mode -->
              <div v-else class="w-full mt-6 space-y-4">
                <input
                  v-model="editForm.name"
                  placeholder="Artist Name"
                  class="w-full bg-white/40 border border-primary/20 rounded-2xl px-4 py-3 text-lg font-black text-black shadow-inner focus:outline-none focus:ring-2 focus:ring-secondary transition-all"
                />
                <textarea
                  v-model="editForm.description"
                  placeholder="A little about your art..."
                  rows="3"
                  class="w-full bg-white/40 border border-primary/20 rounded-2xl px-4 py-3 text-sm font-bold text-black italic shadow-inner focus:outline-none focus:ring-2 focus:ring-secondary transition-all resize-none"
                ></textarea>
              </div>

              <!-- Stats Bar -->
              <div class="flex items-center justify-center space-x-6 mt-8 w-full border-t border-black/5 pt-6">
                <button @click="goToNetwork('followers')"
                        class="flex flex-col items-center cursor-pointer active:scale-90 hover:-translate-y-1 hover:bg-black/5 transition-all duration-300 px-4 py-2 rounded-2xl">
                  <span
                    class="block text-2xl font-black text-black drop-shadow-sm">{{ formatNumber(user.followers?.length || 0)
                    }}</span>
                  <span class="text-[10px] font-bold text-black/50 uppercase tracking-widest">Followers</span>
                </button>

                <div class="w-px h-8 bg-black/10 rounded-full"></div>

                <button @click="goToNetwork('following')"
                        class="flex flex-col items-center cursor-pointer active:scale-90 hover:-translate-y-1 hover:bg-black/5 transition-all duration-300 px-4 py-2 rounded-2xl">
                  <span
                    class="block text-2xl font-black text-black drop-shadow-sm">{{ formatNumber(user.following?.length || 0)
                    }}</span>
                  <span class="text-[10px] font-bold text-black/50 uppercase tracking-widest">Following</span>
                </button>
              </div>
            </div>
          </section>

          <!-- My Posts Section -->
          <section class="mt-10">
            <div class="flex items-center justify-between px-2 mb-4">
              <h3 class="text-xl font-black text-black italic drop-shadow-sm">My Posts</h3>
              <span class="text-sm font-bold text-black/40">{{ userPosts.length }} Sketches</span>
            </div>

            <div v-if="loadingPosts && userPosts.length === 0" class="grid grid-cols-2 gap-3">
              <div v-for="i in 4" :key="i"
                   class="aspect-square bg-primary/10 rounded-[2rem] animate-pulse border border-primary/20"></div>
            </div>

            <div v-else-if="userPosts.length === 0 && !loadingPosts"
                 class="text-center py-10 bg-primary/5 rounded-[2.5rem] border-2 border-dashed border-primary/20">
              <span class="text-4xl grayscale block mb-2 opacity-30">🎨</span>
              <p class="text-sm font-bold text-black/40">You haven't posted any sketches yet.</p>
            </div>

            <div v-else class="grid grid-cols-2 gap-3">
              <div
                v-for="(post, index) in userPosts"
                :key="post._id"
                class="aspect-square bg-primary/5 rounded-[2rem] border border-primary/20 shadow-sm relative overflow-hidden active:scale-95 transition-transform group cursor-pointer"
                @click="openPostSwiper(userPosts, index)"
              >
                <img :src="post.image_url"
                     class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                     loading="lazy" />
                <div class="absolute bottom-2 left-2 right-2 flex items-center space-x-1 overflow-hidden">
                  <div v-if="getTotalReactions(post.reaction_counts) > 0"
                       class="flex items-center space-x-1 bg-black/40 backdrop-blur-md px-2 py-1 rounded-full border border-white/20 shadow-sm">
                    <ion-icon :icon="svg(mdiHeart)" class="text-[10px] text-white" />
                    <span
                      class="text-[10px] font-black text-white">{{ formatNumber(getTotalReactions(post.reaction_counts))
                      }}</span>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <ion-infinite-scroll @ionInfinite="loadMorePosts" :disabled="!hasMorePosts">
            <ion-infinite-scroll-content loading-spinner="bubbles"></ion-infinite-scroll-content>
          </ion-infinite-scroll>
        </div>
      </transition>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { ref, reactive, watch } from 'vue'
import {
  IonPage,
  IonContent,
  onIonViewDidEnter,
  IonIcon,
  IonInfiniteScroll,
  IonInfiniteScrollContent,
  IonButton, useIonRouter
} from '@ionic/vue'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useAuthStore } from '@/store/auth.store'
import { svg } from '@/helper/general.helper'
import { mdiPencil, mdiCheck, mdiHeart, mdiComment, mdiCog } from '@mdi/js'
import TopBar from '@/components/general/TopBar.vue'
import ProfilePictureSelector from '@/components/account/ProfilePictureSelector.vue'
import { usePostSwiper } from '@/composables/home/usePostSwiper'
import { useToast } from '@/service/toast.service'
import { fetchUserPosts, updateProfile, uploadProfileImg } from '@/service/api/user.api'
import { FeedPost } from '@/types/server.types'
import { masterAnimation } from '@/helper/animation.helper'

const router = useIonRouter()
const authStore = useAuthStore()
const { user } = storeToRefs(authStore)
const { toast } = useToast()
const { openPostSwiper } = usePostSwiper()

const loadingAccount = ref(true)
const isEditing = ref(false)
const editForm = reactive({ name: '', description: '' })
const userPosts = ref<FeedPost[]>([])
const loadingPosts = ref(false)
const page = ref(1)
const limit = 20
const hasMorePosts = ref(true)

const loadGallery = async (isInitial = false) => {
  if (!user.value || (loadingPosts.value && isInitial)) return
  loadingPosts.value = true
  if (isInitial) page.value = 1
  try {
    const res = await fetchUserPosts(user.value._id, page.value, limit)
    userPosts.value = res.posts || []
    hasMorePosts.value = userPosts.value.length === limit
  } finally {
    loadingPosts.value = false
  }
}

const loadMorePosts = async (e: any) => {
  if (!user.value || !hasMorePosts.value) return e.target.complete()
  page.value++
  try {
    const res = await fetchUserPosts(user.value._id, page.value, limit)
    const newPosts = res.posts || []
    userPosts.value.push(...newPosts)
    hasMorePosts.value = newPosts.length === limit
  } finally {
    e.target.complete()
  }
}

watch(user, (val) => {
  if (val && loadingAccount.value) {
    loadingAccount.value = false
    loadGallery(true)
  }
}, { immediate: true })

onIonViewDidEnter(() => {
  if (user.value) {
    loadingAccount.value = false
    if (userPosts.value.length === 0) loadGallery(true)
  }
})

const toggleEdit = async () => {
  if (isEditing.value) {
    const newName = editForm.name.trim()
    const newDesc = editForm.description.trim()

    if (!newName) {
      return toast('Name cannot be empty', { color: 'warning' })
    }
    const hasChanged = newName !== user.value?.name || newDesc !== (user.value?.description || '')

    if (hasChanged) {
      try {
        await updateProfile({ name: newName, description: newDesc })

        if (user.value) {
          user.value.name = newName
          user.value.description = newDesc
        }
        toast('Profile updated!', { color: 'success' })
      } catch (e) {
        return toast('Failed to update profile', { color: 'danger' })
      }
    } else {
    }
  } else {
    editForm.name = user.value?.name || ''
    editForm.description = user.value?.description || ''
  }

  isEditing.value = !isEditing.value
}

const handleImgUpdate = async (newImgBase64: string) => {
  if (!user.value) return
  try {
    const response = await fetch(newImgBase64)
    const blob = await response.blob()
    const res = await uploadProfileImg(blob, user.value.img)
    if (res.url) {
      user.value.img = res.url
      toast('Profile picture updated!', { color: 'success' })
    }
  } catch (error) {
    toast('Failed to upload image', { color: 'danger' })
  }
}

const goToNetwork = (tab: string) => router.push(`/network?tab=${tab}`)
const goToSettings = () => router.push('/settings', masterAnimation)
const getTotalReactions = (counts?: Record<string, number>) => Object.values(counts || {}).reduce((a, b) => a + b, 0)
const formatNumber = (num: number) => num >= 1000 ? (num / 1000).toFixed(1) + 'k' : num
</script>

<style scoped>
@reference "@/theme/main.css";


/* Obvious styling for the Confirm/Save button */
.confirm-mode-btn {
  --background: var(--ion-color-secondary);
  transform: scale(1.1); /* Subtle pop when in edit mode */
}

.confirm-mode-btn::part(native) {
  border: 1px solid rgba(255, 255, 255, 0.3);
  box-shadow: 0 8px 20px rgba(var(--ion-color-secondary-rgb), 0.4);
}

/* Transitions */
.liquid-fade-enter-active, .liquid-fade-leave-active {
  transition: all 0.5s cubic-bezier(0.16, 1, 0.3, 1);
}

.liquid-fade-enter-from {
  opacity: 0;
  transform: translateY(20px);
}

.liquid-fade-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}

.fade-enter-active, .fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from, .fade-leave-to {
  opacity: 0;
}

input, textarea {
  user-select: text;
  -webkit-user-select: text;
}
</style>