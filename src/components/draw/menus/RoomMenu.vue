<template>
  <ion-modal @did-dismiss="roomMenuOpen = false" :is-open="roomMenuOpen">
    <ion-header>
      <ion-toolbar color="tertiary">
        <ion-buttons slot="end">
          <ion-button @click="modalController.dismiss()">
            <ion-icon slot="icon-only" :icon="svg(mdiClose)" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content class="bg-background">
      <div class="p-4 flex flex-col gap-4">
        <!-- Room is active -->
        <div v-if="roomId">
          <p class="font-medium">
            Room {{ isCreator ? 'created' : 'joined' }} {{roomId}}
          </p>
          <p class="text-sm text-gray-500" v-if="isCreator">
            Invite people to start drawing
          </p>
          <p class="text-sm text-gray-500" v-else>
            Waiting for the room owner to start drawing…
          </p>


          <!-- Members list -->
          <div class="mt-2 max-h-40 overflow-y-auto border rounded p-2">
            <div
              v-for="member in roomMembers"
              :key="member._id"
              class="flex items-center gap-2 py-1"
            >
              <img
                :src="member.img"
                :alt="member.name"
                class="w-8 h-8 rounded-full"
              />
              <p class="text-sm">
                {{ member.name }}
                <span v-if="member._id === user?._id">(Me)</span>
              </p>
            </div>
          </div>

          <ion-button
            @click="leaveRoom"
            color="secondary"
          >
            Leave
          </ion-button>
        </div>

        <!-- No active room: create or join -->
        <div v-else class="flex flex-col gap-4">
          <ion-button
            @click="createRoom"
            :disabled="isTryingToJoin"
            color="primary"
          >
            <span v-if="!isTryingToJoin">Create Room</span>
            <span v-else>Creating...</span>
          </ion-button>

          <div class="flex gap-2 items-center">
            <ion-input
              v-model="roomInput"
              fill="outline"
              color="secondary"
              placeholder="Enter room number"
              @keyup.enter="joinRoom"
            />
            <ion-button
              @click="joinRoom"
              :disabled="isTryingToJoin || !roomInput"
              color="secondary"
            >
              <span v-if="!isTryingToJoin">Join</span>
              <span v-else>Joining...</span>
            </ion-button>
          </div>
        </div>
      </div>
    </ion-content>
  </ion-modal>
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useDrawSyncer } from '@/draw/store/drawSyncer.store'
import { useMenuStore } from '@/store/menu.store'
import { useAuthStore } from '@/store/auth.store'
import {
  IonButton,
  IonContent,
  IonInput,
  IonModal,
  IonHeader,
  IonToolbar,
  modalController,
  IonIcon,
  IonButtons
} from '@ionic/vue'
import { ref } from 'vue'
import { leaveRoom, socketJoinRoom } from '@/service/api/socket/drawSyncing'
import { mdiClose } from '@mdi/js'
import { svg } from '@/helper/general.helper'

const { roomId, roomMembers, isCreator, isTryingToJoin } = storeToRefs(useDrawSyncer())
const { roomMenuOpen } = storeToRefs(useMenuStore())
const { user } = storeToRefs(useAuthStore())

const roomInput = ref('')

function createRoom() {
  joinRoomWithIntent('create')
}

function joinRoom() {
  if (!roomInput.value) return
  joinRoomWithIntent('join')
}

function joinRoomWithIntent(intent: 'create' | 'join') {
  if (!user.value && intent === 'create') return
  isTryingToJoin.value = true
  const roomId = intent === 'create' ? user.value!._id : roomInput.value
  socketJoinRoom({ roomId, intent })
}


</script>

<style scoped>
/* Optional: scroll bar styling for member list */
.max-h-40::-webkit-scrollbar {
  width: 6px;
}

.max-h-40::-webkit-scrollbar-thumb {
  background-color: rgba(0, 0, 0, 0.2);
  border-radius: 3px;
}
</style>
