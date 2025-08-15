<template>
  <ion-modal
    trigger="search-name"
    :initial-breakpoint="1"
    :breakpoints="[0, 1]"
  >
    <div class="bg-primary p-4">
      <!-- Title -->
      <p class="text-2xl font-semibold cabin-sketch-regular">
        Search for a mate
      </p>

      <!-- Search Section -->
      <div class="w-full flex flex-col justify-center items-center py-6">
        <ion-input
          label="Mate name"
          label-placement="floating"
          fill="outline"
          color="secondary"
          class="max-w-md w-full rounded-lg"
          @keyup.enter="searchUsers"
          v-model="mateName"
          :clear-input="true"
          placeholder="Type a name..."
        >
          <ion-spinner
            v-if="isSearchingUsers"
            color="secondary"
            slot="end"
          />
          <ion-button
            fill="clear"
            slot="end"
            color="secondary"
            @click="searchUsers"
            :disabled="mateName.length === 0"
            v-else
          >
            <ion-icon
              slot="icon-only"
              :icon="svg(mdiSend)"
              aria-hidden="true"
            />
          </ion-button>
        </ion-input>
      </div>

      <!-- Results Section -->
      <div
        class="h-96 overflow-y-auto rounded-lg p-2"
      >
        <ion-list class="p-0">
          <ion-item
            v-for="mate in foundMates"
            :key="mate._id"
            color="background"
            lines="full"
            class="hover:bg-black hover:bg-opacity-5 transition-colors rounded-lg"
          >
            <!-- Avatar -->
            <img
              :src="senderImg(mate)"
              :alt="mate._id"
              class="rounded-full w-[48px] h-[48px] object-cover my-2"
              slot="start"
            />

            <!-- Name -->
            <p class="text-lg cabin-sketch-regular">
              {{ senderName(mate) }}
            </p>

            <!-- Actions -->
            <div slot="end" class="flex items-center gap-2">
              <ion-spinner
                v-if="friendRequestLoading"
                color="secondary"
              />
              <p
                v-else-if="user.mates.some(otherMate => otherMate._id == mate._id)"
                class="text-sm text-gray-500"
              >
                Already mates
              </p>

              <ion-button
                v-else-if="user.mate_requests_sent.some(m => m == mate._id)"
                color="secondary"
                fill="clear"
                size="small"
                @click="cancelSendMateRequest({ sender: user._id, sender_name: user.name, receiver: mate._id })"
              >
                Undo request
              </ion-button>

              <ion-button
                v-else
                color="secondary"
                fill="clear"
                size="small"
                @click="sendMateRequest({ sender: user._id, sender_name: user.name, receiver: mate._id })"
              >
                Become friends
              </ion-button>
            </div>
          </ion-item>
        </ion-list>
      </div>
    </div>
  </ion-modal>
</template>


<script setup lang="ts">
import { IonModal, IonIcon, IonInput, IonList, IonItem, IonSpinner, IonButton } from '@ionic/vue'
import { ref } from 'vue'
import { senderImg, senderName, svg } from '@/helper/general.helper'
import { mdiSend } from '@mdi/js'
import { useAPI } from '@/service/api/api.service'
import { Mate } from '@/types/server.types'
import { useToast } from '@/service/toast.service'
import { useAuthStore } from '@/store/auth.store'
import { storeToRefs } from 'pinia'
import { useSocketService } from '@/service/api/socket.service'

const { searchMate } = useAPI()
const { toast } = useToast()

const { user } = storeToRefs(useAuthStore())

const isSearchingUsers = ref(false)
const mateName = ref('')
const foundMates = ref<Mate[]>([])
const friendRequestLoading = ref(false)

const { cancelSendMateRequest, sendMateRequest, match } = useSocketService()


async function searchUsers() {
  if (mateName.value.length === 0) return
  isSearchingUsers.value = true
  const res = await searchMate({ mateName: mateName.value, user_id: user.value!._id })
  isSearchingUsers.value = false
  if (!res) {
    toast('Something went wrong', { color: 'danger' })
    return
  }
  console.log(res, user.value!._id)
  foundMates.value = res
}


</script>

<style scoped>
ion-modal {
  --height: auto;
}


</style>