import { defineStore } from 'pinia'
import { ref } from 'vue'
import { Balloon, User } from '@/types/server.types'
import { useAPI } from '@/service/api/api.service'

export const useBalloonStore = defineStore('balloon', () => {
  const sentBalloon = ref<Balloon>()
  const receivedBalloon = ref<Balloon>()

  const api = useAPI()

  async function init(user: User) {
    if (user.balloon?.sent) api.getBalloon({ balloonId: user.balloon.sent }).then((res) => {
      if (res) {
        sentBalloon.value = res
      }
    })

    if (user.balloon?.received) api.getBalloon({ balloonId: user.balloon.received }).then((res) => {
      if (res) receivedBalloon.value = res
    })
  }


  return {
    sentBalloon,
    receivedBalloon,
    init
  }
})
