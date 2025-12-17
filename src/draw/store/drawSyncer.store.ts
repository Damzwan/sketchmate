import { defineStore } from 'pinia'
import { ref } from 'vue'
import { Mate } from '@/types/server.types'


export const useDrawSyncer = defineStore('drawSyncer', () => {
  const roomMembers = ref<Mate[]>([])
  const roomId = ref<string>()
  const isCreator = ref<boolean>(false)
  const isTryingToJoin = ref<boolean>(false)

  return { roomMembers, roomId, isCreator, isTryingToJoin }
})
