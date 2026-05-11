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
            <div class="absolute top-4 right-4 flex flex-row-reverse items-center z-50">
              <ion-button fill="clear" class="ml-3" color="secondary" @click="toggleEdit">
                <ion-icon slot="icon-only" class="text-black" :icon="svg(isEditing ? mdiCheck : mdiPencil)" />
              </ion-button>

              <transition name="fade">
                <ion-button v-if="!isEditing" fill="clear" color="secondary" @click="goToSettings">
                  <ion-icon slot="icon-only" class="text-black" :icon="svg(mdiCog)" />
                </ion-button>
              </transition>
            </div>

            <div class="flex flex-col items-center -mt-20 relative z-20">
              <div class="relative">
                <ProfilePictureSelector :img="user.img" @update:img="handleImgUpdate" />

                <transition name="fade">
                  <button
                    v-if="!isEditing"
                    @click="connectionMenuOpen = true"
                    class="absolute -bottom-1 -left-1 w-10 h-10 bg-secondary text-white rounded-xl shadow-lg flex items-center justify-center active:scale-90 transition-transform border-4 border-white/20 z-30"
                  >
                    <ion-icon :icon="svg(mdiShareOutline)" class="text-xl" />
                  </button>
                </transition>
              </div>

              <!-- Display Mode -->
              <div v-if="!isEditing" class="text-center mt-4 w-full">
                <h2 class="text-3xl font-black text-black drop-shadow-sm">{{ user.name }}</h2>
                <p class="text-sm font-bold text-black/60 italic mt-2 px-4 leading-snug whitespace-pre-wrap">
                  "{{ user.description || 'No description yet.' }}"
                </p>
              </div>

              <!-- Edit Mode -->
              <div v-else class="w-full mt-6 space-y-4 px-2">
                <input v-model="editForm.name" placeholder="Artist Name"
                       class="w-full bg-white/40 border border-primary/20 rounded-2xl px-4 py-3 text-lg font-black text-black shadow-inner focus:outline-none focus:ring-2 focus:ring-secondary transition-all" />
                <textarea v-model="editForm.description" placeholder="A little about your art..." rows="3"
                          class="w-full bg-white/40 border border-primary/20 rounded-2xl px-4 py-3 text-sm font-bold text-black italic shadow-inner focus:outline-none focus:ring-2 focus:ring-secondary transition-all resize-none"></textarea>
              </div>

              <!-- Stats Bar: Mathematical Grid Centering -->
              <div class="grid grid-cols-3 w-full mt-8 border-t border-black/5 pt-6">
                <!-- Mates -->
                <button @click="goToNetwork('mates')"
                        class="flex flex-col items-center group active:scale-90 transition-transform">
                  <span class="block text-2xl font-black text-secondary drop-shadow-sm">
                    {{ formatNumber(user.mates?.length || 0) }}
                  </span>
                  <span class="text-[10px] font-bold text-black/50 uppercase tracking-widest">Mates</span>
                </button>

                <!-- Followers: Exactly Centered -->
                <button @click="goToNetwork('followers')"
                        class="flex flex-col items-center group active:scale-90 transition-transform border-x border-black/5">
                  <span class="block text-2xl font-black text-black drop-shadow-sm">
                    {{ formatNumber(user.followers?.length || 0) }}
                  </span>
                  <span class="text-[10px] font-bold text-black/50 uppercase tracking-widest">Followers</span>
                </button>

                <!-- Following -->
                <button @click="goToNetwork('following')"
                        class="flex flex-col items-center group active:scale-90 transition-transform">
                  <span class="block text-2xl font-black text-black drop-shadow-sm">
                    {{ formatNumber(user.following?.length || 0) }}
                  </span>
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

            <!-- Loader for Store actions -->
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

          <ion-infinite-scroll @ionInfinite="loadMorePosts" :disabled="!hasMoreUserPosts">
            <ion-infinite-scroll-content loading-spinner="bubbles"></ion-infinite-scroll-content>
          </ion-infinite-scroll>
        </div>
      </transition>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { reactive, ref, watch } from 'vue'
import {
  IonButton,
  IonContent,
  IonIcon,
  IonInfiniteScroll,
  IonInfiniteScrollContent,
  IonPage,
  onIonViewDidEnter,
  useIonRouter
} from '@ionic/vue'
import { storeToRefs } from 'pinia'
import { useAuthStore } from '@/store/auth.store'
import { usePostStore } from '@/store/post.store'
import { useMenuStore } from '@/store/menu.store'
import { svg } from '@/helper/general.helper'
import { mdiCheck, mdiCog, mdiHeart, mdiPencil, mdiShareOutline } from '@mdi/js'
import TopBar from '@/components/general/TopBar.vue'
import ProfilePictureSelector from '@/components/account/ProfilePictureSelector.vue'
import { usePostSwiper } from '@/composables/home/usePostSwiper'
import { useToast } from '@/service/toast.service'
import { updateProfile, uploadProfileImg } from '@/service/api/user.api'
import { masterAnimation } from '@/helper/animation.helper'

const router = useIonRouter()
const authStore = useAuthStore()
const postStore = usePostStore()
const menuStore = useMenuStore()

const { user } = storeToRefs(authStore)
const { userPosts, hasMoreUserPosts, isProfileDirty } = storeToRefs(postStore)
const { connectionMenuOpen } = storeToRefs(menuStore)
const { toast } = useToast()
const { openPostSwiper } = usePostSwiper()

const loadingAccount = ref(true)
const loadingPosts = ref(false)
const isEditing = ref(false)
const editForm = reactive({ name: '', description: '' })

/**
 * Handle initial data fetch or dirty-state refresh
 */
const handleInitialLoad = async () => {
  if (!user.value) return
  loadingPosts.value = true
  try {
    await postStore.getUserPosts(user.value._id, true)
  } catch (e) {
    toast('Failed to load sketches', { color: 'danger' })
  } finally {
    loadingPosts.value = false
  }
}

/**
 * Paginated loading
 */
const loadMorePosts = async (e: any) => {
  if (!user.value) return e.target.complete()
  try {
    await postStore.getUserPosts(user.value._id, false)
  } finally {
    e.target.complete()
  }
}


onIonViewDidEnter(() => {
  if (user.value) {
    loadingAccount.value = false
    if (userPosts.value.length === 0 || isProfileDirty.value) {
      handleInitialLoad()
    }
  }
})

watch(user, (val) => {
  if (val && loadingAccount.value) {
    loadingAccount.value = false
    handleInitialLoad()
  }
}, { immediate: true })

const toggleEdit = async () => {
  if (isEditing.value) {
    const newName = editForm.name.trim()
    const newDesc = editForm.description.trim()

    if (!newName) return toast('Name cannot be empty', { color: 'warning' })

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