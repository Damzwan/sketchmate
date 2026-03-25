<template>
  <ion-modal
    :is-open="roomMenuOpen"
    @did-dismiss="() => {
      roomMenuOpen = false
      code = ['', '', '', '']
      stopWatchingLobbies()
    }"
    :initial-breakpoint="1" :breakpoints="[0, 1]"
    handle-behavior="cycle"
  >
    <div class="p-4 bot-pad-safe w-full h-full bg-primary">
      <div v-if="roomId" class="space-y-2">
        <div v-if="isPublicLobby">
          <h1 class="text-3xl text-secondary cabin-sketch-regular font-black tracking-tighter leading-none">
            {{ publicLobbyName }}
          </h1>
        </div>
        <div v-else
             class="bg-background border border-default-medium p-4 rounded-2xl flex items-center justify-between gap-4 shadow-sm">
          <div class="flex flex-col">
      <span class="text-xl cabin-sketch-regular uppercase font-bold opacity-60 tracking-wider">
        Room Code
      </span>
            <div class="flex items-center gap-1">
              <h1 class="text-3xl text-secondary cabin-sketch-regular font-black tracking-tighter leading-none">
                {{ roomId }}
              </h1>
              <ion-button
                fill="clear"
                size="small"
                class="text-secondary h-8 w-8"
                @click="shareUrl(roomIdLink, '', '', 'Room link copied')"
              >
                <ion-icon slot="icon-only" :icon="svg(mdiShareVariant)" class="text-2xl" />
              </ion-button>
            </div>
          </div>

          <div class="p-1.5 bg-white rounded-lg ring-1 ring-black/5">
            <qrcode-vue :value="roomIdLink" :size="96" background="white" foreground="#000" />
          </div>
        </div>

        <section class="px-1 max-h-48 overflow-y-auto">
          <div class="flex items-center justify-between mb-2">
            <h3 class="text-sm font-bold text-secondary cabin-sketch-regular uppercase tracking-widest">
              Members <span class="ml-1 opacity-40">{{ roomMembers.length }}</span>
            </h3>
          </div>

          <div class="space-y-2">
            <div
              v-for="member in roomMembers"
              :key="member._id"
              class="flex items-center justify-between p-2 bg-background rounded-xl border border-default-light shadow-sm"
            >
              <div class="flex items-center gap-3">
                <ion-avatar class="w-8 h-8">
                  <img :src="member.img" />
                </ion-avatar>
                <span class="font-bold text-heading text-sm">
            {{ member.name }}
            <span v-if="member._id === user?._id"
                  class="text-[10px] text-secondary/60 font-black ml-1 uppercase">(You)</span>
          </span>
              </div>

              <div v-if="user && member._id != user._id && !user.mates.some(m1 => m1._id == member._id)">
                <ion-spinner color="secondary" v-if="friendRequestLoading && friendToBe==member._id" class="w-4 h-4" />
                <ion-button
                  v-else
                  color="secondary"
                  fill="clear"
                  size="small"
                  class="text-[10px] font-bold uppercase"
                  @click="user.mate_requests_sent.some(m => m == member._id) ? cancelSendMateRequest({sender: user._id, sender_name: user.name, receiver: member._id}) : becomeFriends(member._id)"
                >
                  {{ user.mate_requests_sent.some(m => m == member._id) ? 'Undo' : 'Add Friend' }}
                </ion-button>
              </div>
            </div>
          </div>
        </section>

        <section class="px-1 max-h-48 overflow-y-auto" v-if="friendsToInvite?.length">
          <div class="flex items-center justify-between mb-2">
            <h3 class="text-sm font-bold text-secondary cabin-sketch-regular uppercase tracking-widest">
              Invite Friends <span class="ml-1 opacity-40">{{ friendsToInvite.length }}</span>
            </h3>
          </div>

          <div class="space-y-2">
            <div
              v-for="member in friendsToInvite"
              :key="member._id"
              class="flex items-center justify-between p-2 bg-background rounded-xl border border-default-light"
            >
              <div class="flex items-center gap-3">
                <ion-avatar class="w-8 h-8 opacity-80">
                  <img :src="member.img" />
                </ion-avatar>
                <span class="font-medium text-heading text-sm">{{ member.name }}</span>
              </div>

              <ion-button
                v-if="!invitedFriends.includes(member._id)"
                color="secondary"
                fill="solid"
                size="small"
                class="text-[10px] font-bold h-7 uppercase"
                @click="inviteFriend(member._id)"
              >
                Invite
              </ion-button>
              <ion-button
                v-else
                color="secondary"
                fill="clear"
                size="small"
                class="text-[10px] font-bold h-7 uppercase"
                disabled
              >
                Invited
              </ion-button>
            </div>
          </div>
        </section>

        <div class="pt-4 px-1">
          <ion-button expand="block" color="danger" fill="clear"
                      class="text-xs font-bold cabin-sketch-regular uppercase"
                      @click="() => leaveRoom()">
            Leave room
          </ion-button>
        </div>
      </div>

      <div v-else class="space-y-2 px-2">

        <div class="ion-text-center ion-margin-bottom">
          <h2 class="text-2xl font-bold cabin-sketch-regular">
            Collaborative Drawing <span class="text-amber-500 text-lg ml-1">Beta</span>
          </h2>

          <p class="text-gray-500 cabin-sketch-regular mb-2">
            Draw with friends in real-time. Join a room via code, start your own, or play with strangers.
          </p>

          <div class="mx-auto max-w-sm p-2 rounded-lg border border-secondary shadow-sm bg-background">
            <p class="text-gray-600 cabin-sketch-regular mb-2 leading-tight">
              This feature is still in beta. If things act weird or break, let me know so I can fix it!
            </p>

            <ion-button
              @click="() => openMenu(Menu.FeedbackMenu)"
              color="secondary"
              fill="outline"
              size="small"
            >
              <ion-icon slot="end" :icon="svg(mdiBug)"/>
              Report a Bug / Feedback
            </ion-button>
          </div>
        </div>

        <hr class="my-2 opacity-20" />

        <!-- 1️⃣ Private room section -->
        <section class="space-y-3">
          <h3 class="text-sm font-bold text-secondary cabin-sketch-regular uppercase tracking-widest">
            Join a Private Room
          </h3>

          <!-- Invitations -->
          <div v-if="invitations.length > 0" class="space-y-2 max-h-48 overflow-y-auto px-1">
            <div
              v-for="invite in invitations"
              :key="invite.roomId"
              class="flex items-center justify-between p-2 bg-background rounded-xl border border-default-light"
            >
              <div class="flex items-center gap-3">
                <ion-avatar class="w-8 h-8 opacity-80">
                  <img :src="invite.friend.img" />
                </ion-avatar>
                <span class="font-medium text-heading text-sm truncate">{{ invite.friend.name }}</span>
              </div>

              <ion-button
                v-if="!invitedFriends.includes(invite.friend._id)"
                color="secondary"
                fill="solid"
                size="small"
                class="text-[10px] font-bold h-7 uppercase"
                @click="() => {
            invitations = invitations.filter(inv => inv.roomId != invite.roomId)
            joinRoom(invite.roomId)
          }"
              >
                Join
              </ion-button>
            </div>
          </div>

          <!-- Join via code or QR -->
          <div class="flex flex-col gap-4">
            <div class="flex items-center justify-center gap-3">
              <div class="flex space-x-2" @paste="handlePaste">
                <input
                  v-for="(digit, index) in code"
                  :key="index"
                  :id="'code-' + index"
                  v-model="code[index]"
                  type="text"
                  inputmode="numeric"
                  maxlength="1"
                  class="block h-12 w-12 rounded-lg border cabin-sketch-regular border-default-medium bg-neutral-secondary-medium text-center text-lg font-semibold text-heading shadow-sm focus:border-brand focus:ring-2 focus:ring-brand"
                  @input="focusNext(index)"
                  @keydown.delete="focusPrev(index, $event)"
                />
              </div>

              <div class="text-body font-medium">OR</div>

              <ion-button @click="startScanningHelper" color="secondary" fill="outline" class="h-12" v-if="isNative()">
                <ion-icon slot="icon-only" :icon="svg(mdiCamera)" />
              </ion-button>
            </div>

            <ion-button
              expand="block"
              color="secondary"
              @click="joinRoom(codeString)"
              :disabled="!isCodeComplete"
            >
              Join Drawing Board
            </ion-button>
          </div>
        </section>

        <hr class="my-2 opacity-20" />

        <!-- 2️⃣ Public room section -->
        <section class="space-y-3">
          <h3 class="text-sm font-bold text-secondary cabin-sketch-regular uppercase tracking-widest">
            Play with Strangers
          </h3>

          <ion-button
            v-if="!isWatchingPublicLobbies"
            expand="block"
            color="secondary"
            @click="startWatchingLobbies"
          >
            Search rooms
          </ion-button>

          <div v-else class="space-y-2 max-h-56 overflow-y-auto px-1">
            <div
              v-if="publicLobbies.length === 0"
              class="text-xs text-gray-400 text-center py-4"
            >
              No lobbies available
            </div>

            <div
              v-for="lobby in publicLobbies"
              :key="lobby.id"
              class="flex items-center justify-between p-2 rounded-xl border border-default-light bg-background"
            >
              <div class="flex flex-col min-w-0">
                <span class="text-sm font-semibold text-heading truncate">{{ lobby.name }}</span>
                <span class="text-[11px] text-gray-400">{{ lobby.users }} / {{ lobby.maxUsers }} players</span>
              </div>

              <ion-button
                size="small"
                color="secondary"
                fill="solid"
                class="text-[10px] font-bold h-7 uppercase"
                :disabled="joiningLobbyId !== null || lobby.users >= lobby.maxUsers"
                @click="handleJoinPublicLobby(lobby)"
              >
                <ion-spinner v-if="joiningLobbyId === lobby.id" name="crescent" />
                <span v-else>{{ lobby.users >= lobby.maxUsers ? 'Full' : 'Join' }}</span>
              </ion-button>
            </div>
          </div>
        </section>

        <hr class="my-2 opacity-20" />

        <!-- 3️⃣ Create a room section -->
        <section class="space-y-3 pb-3">
          <h3 class="text-sm font-bold text-secondary cabin-sketch-regular uppercase tracking-widest">
            Create a New Room
          </h3>

          <ion-button expand="block" fill="outline" color="secondary" @click="createRoom">
            Create Room
          </ion-button>
        </section>

      </div>
    </div>
  </ion-modal>
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { PublicLobby, useDrawSyncer } from '@/draw/store/drawSyncing.store'
import { useMenuStore } from '@/store/menu.store'
import { useAuthStore } from '@/store/auth.store'
import { IonButton, IonIcon, IonModal, IonSpinner } from '@ionic/vue'
import { computed, nextTick, ref } from 'vue'
import {
  inviteFriendToRoom,
  leaveRoom,
  socketJoinRoom,
  startWatchingLobbies, stopWatchingLobbies
} from '@/service/api/socket/drawSyncing.socket'
import { mdiBug, mdiCamera, mdiShareVariant } from '@mdi/js'
import { isNative, svg } from '@/helper/general.helper'
import { createRoomLink, shareUrl } from '@/helper/share.helper'
import QrcodeVue from 'qrcode.vue'
import { useSocketService } from '@/service/api/socket/socket.service'
import { useFriendStore } from '@/store/friend.store'
import { useScanner } from '@/service/scanner.service'
import { Menu } from '@/draw/types/draw.types'


const {
  roomId,
  roomMembers,
  invitations,
  invitedFriends,
  isWatchingPublicLobbies,
  publicLobbies,
  isPublicLobby,
  publicLobbyName
} = storeToRefs(useDrawSyncer())
const { roomMenuOpen } = storeToRefs(useMenuStore())
const { user } = storeToRefs(useAuthStore())
const { startScanning } = useScanner()
const { openMenu } = useMenuStore()

const code = ref(['', '', '', ''])
const codeString = computed(() => code.value.join(''))
const roomIdLink = computed(() => createRoomLink(roomId.value ?? ''))
const friendsToInvite = computed(() =>
  user.value?.mates.filter(m => !roomMembers.value.find(m2 => m._id == m2._id))
)

function createRoom() {
  socketJoinRoom({ roomId: generateRandomCode(), intent: 'create' })
}

function joinRoom(code: string) {
  if (code == '') return
  socketJoinRoom({ roomId: code, intent: 'join' })

}

function generateRandomCode() {
  const code = Math.floor(Math.random() * 10000)
  return String(code).padStart(4, '0')
}


// Check if all 4 digits are filled
const isCodeComplete = computed(() => {
  return code.value.every(digit => digit !== '')
})

// Auto-focus next input
const focusNext = (index: number) => {
  if (index === 3) {
    joinRoom(codeString.value)
  } else if (code.value[index] && index < 3) {
    const nextInput = document.getElementById(`code-${index + 1}`)
    nextInput?.focus()
  }
}

// Handle backspace to move focus back
const focusPrev = (index: number, event: any) => {
  if (event.key === 'Backspace' && !code.value[index] && index > 0) {
    const prevInput = document.getElementById(`code-${index - 1}`)
    prevInput?.focus()
  }
}

// Handle pasting the whole 4-digit code (e.g. "1234")
const handlePaste = (event: any) => {
  const pasteData = event.clipboardData.getData('text').slice(0, 4).split('')
  if (pasteData.length) {
    pasteData.forEach((char: any, index: number) => {
      if (index < 4) code.value[index] = char
    })
    nextTick(() => {
      document.getElementById('code-3')?.focus()
    })
  }
}


function inviteFriend(friend: string) {
  if (!roomId.value) return
  invitedFriends.value.push(friend)
  setTimeout(() => {
    invitedFriends.value = invitedFriends.value.filter(item => item !== friend)
  }, 5000)
  inviteFriendToRoom(friend, roomId.value)
}

const friendToBe = ref<string>()
const { friendRequestLoading } = storeToRefs(useFriendStore())
const { cancelSendMateRequest, sendMateRequest, match } = useSocketService()

function becomeFriends(follower: string) {
  if (!user.value) return
  friendToBe.value = follower
  if (user.value.mate_requests_received.some(m => m == follower)) match({
    _id: user.value._id,
    mate_id: follower
  })
  else sendMateRequest({
    sender: user.value._id, sender_name: user.value.name,
    receiver: follower
  })

}

const joiningLobbyId = ref<string | null>(null)

async function handleJoinPublicLobby(lobby: PublicLobby) {
  if (joiningLobbyId.value) return

  joiningLobbyId.value = lobby.id

  try {
    joinRoom(lobby.id)
    publicLobbyName.value = lobby.name
    isPublicLobby.value = true
  } finally {
    joiningLobbyId.value = null
  }
}

// TODO copy from weblink handler
async function startScanningHelper() {
  const code = await startScanning()
  if (!code) return

  const url = new URL(code)
  const roomId = url.searchParams.get('room_id')

  if (roomId) {
    socketJoinRoom({ roomId, intent: 'join' })
  }
}


</script>

<style scoped>
ion-modal {
  --height: auto;
}
</style>
