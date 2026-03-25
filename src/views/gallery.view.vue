<template>
  <ion-page>
    <SettingsHeader
      title="Gallery"
      :presenting-element="page"
      :selected-mode="multiSelectMode"
      :selected-items="selectedItems"
      @cancel="cancelMultiSelect"
      @delete="alterTrigger.click()"
    />
    <ion-content class="bg-background">
      <SubscriptionCard class="mt-4"/>

      <CircularLoader v-if="isLoading || !isLoggedIn" class="z-50" bgColor="bg-background" />

      <div v-else-if="user" class="w-full h-full">
        <ion-refresher slot="fixed" @ionRefresh="refresh">
          <ion-refresher-content></ion-refresher-content>
        </ion-refresher>


        <NoMessages v-if="noMessages && user.mates.length == 0" title="Start connecting"
                    subtitle="Add a friend first before you can access your gallery"
                    :img="connectImage" btn-text="Add a friend" :btn-link="FRONTEND_ROUTES.connect" />

        <NoMessages v-else-if="noMessages" title="No messages.."
                    subtitle="Send a drawing to a friend to see it over here"
                    :img="noMessagesImg" btn-text="Start drawing" :btn-link="FRONTEND_ROUTES.draw" />
        <div class="h-full p-2" v-else>
          <div class="h-full">
            <div v-for="date in sortDates(Object.keys(groupedInboxItems))" :key="date" class="pb-3">
              <div class="text-xl font-bold">
                {{ dayjs(date).format('MMMM, YYYY') }}
              </div>

              <div class="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 xl:grid-cols-12 gap-1.5 pt-3">
                <div
                  v-for="(inboxItem, i) in groupedInboxItems[date]"
                  :key="inboxItem._id"
                  :class="inboxItem.aspect_ratio > 1 ? 'col-span-2' : 'col-span-1'"
                >
                  <Thumbnail
                    :inbox-item="inboxItem"
                    :user="user!"
                    :multi-selected-items="selectedItems"
                    :multi-select-mode="multiSelectMode"
                    @long-press="() => onItemLongPress(inboxItem)"
                    @click="onThumbnailClick(inboxItem)"
                    @hover="seeItem(i)"
                    :eager="i < 5"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
        <div id="delete-multiple-images-alert" class="hidden" ref="alterTrigger" />
        <ConfirmationAlert
          header="Are you sure?"
          trigger="delete-multiple-images-alert"
          message="These drawings will be deleted permanently"
          @confirm="deleteInboxItems"
        />
      </div>
    </ion-content>
  </ion-page>
</template>

<script lang="ts" setup>
import { IonContent, IonPage, IonRefresher, IonRefresherContent, onIonViewWillLeave, useBackButton } from '@ionic/vue'
import { computed, onMounted, ref, watch } from 'vue'
import { useAuthStore } from '@/store/auth.store'
import { storeToRefs } from 'pinia'
import { InboxItem } from '@/types/server.types'
import dayjs from 'dayjs'
import { sortDates } from '@/helper/general.helper'
import router from '@/router'
import { useToast } from '@/service/toast.service'
import SettingsHeader from '@/components/settings/SettingsHeader.vue'
import { useRoute } from 'vue-router'
import NoMessages from '@/components/gallery/NoMessages.vue'
import Thumbnail from '@/components/gallery/Thumbnail.vue'
import CircularLoader from '@/components/general/loaders/CircularLoader.vue'
import { useAPI } from '@/service/api/api.service'
import ConfirmationAlert from '@/components/general/ConfirmationAlert.vue'
import noMessagesImg from '@/assets/illustrations/no_messages.webp'
import { EventBus } from '@/main'
import connectImage from '@/assets/illustrations/connect.webp'
import { FRONTEND_ROUTES } from '@/types/router.types'
import { usePhotoSwiper } from '@/store/photoswiper.store'
import { useSessionStore } from '@/store/session.store'
import { useInboxStore } from '@/store/inbox.store'
import SubscriptionCard from '@/components/subscription/SubscriptionCard.vue'

const api = useAPI()
const { refresh } = useAuthStore()
const { user, isLoggedIn } = storeToRefs(useAuthStore())
const { queryParams } = storeToRefs(useSessionStore())
const { setQueryParams } = useSessionStore()
const { open, slide } = storeToRefs(usePhotoSwiper())
const { inbox, hasFetchedInbox } = storeToRefs(useInboxStore())
const { getInbox } = useInboxStore()

const { seeItem } = usePhotoSwiper()

const { toast } = useToast()

const isLoading = ref(true)


useBackButton(9999, (processNextHandler) => {
  if (multiSelectMode.value) cancelMultiSelect()
  else processNextHandler()
})

onMounted(fetchInbox)
watch(isLoggedIn, () => {
  fetchInbox()
})

const groupedInboxItems = computed(() => groupOnMonth(inbox.value))


const noMessages = computed(() => inbox.value.length === 0)


const route = useRoute()

const multiSelectMode = ref(false)
const selectedItems = ref<string[]>([])

const alterTrigger = ref<any>()

onIonViewWillLeave(cancelMultiSelect)

function onItemLongPress(item: InboxItem) {
  multiSelectMode.value = true
  selectedItems.value.push(item._id)
}

function onThumbnailClick(item: InboxItem) {
  if (!multiSelectMode.value) openPhotoSwiper(item)
  else {
    if (!selectedItems.value.includes(item._id)) selectedItems.value.push(item._id)
    else selectedItems.value = selectedItems.value.filter(id => item._id != id)
  }
}

function cancelMultiSelect() {
  multiSelectMode.value = false
  selectedItems.value = []
}

function deleteInboxItems() {
  selectedItems.value.forEach(val => {
    // TODO can be done with 1 request
    api.removeFromInbox({
      user_id: user.value!._id,
      inbox_id: val
    })
  })

  inbox.value = inbox.value?.filter(item => !selectedItems.value.includes(item._id))
  cancelMultiSelect()
  toast('Deleted items')
}

// TODO this is ugly
checkQueryParams()
watch(
  () => route.query,
  () => {
    if (!route.query.item) return
    checkQueryParams()
  }
)

watch([hasFetchedInbox, queryParams], checkQueryParams)

const page = ref()

onMounted(() => {
  page.value = document.getElementById('page')
})

async function fetchInbox() {
  if (inbox.value.length !== user.value?.inbox.length && isLoggedIn.value) {
    isLoading.value = true
    await getInbox()
    isLoading.value = false
    checkQueryParams()
  } else {
    isLoading.value = false
  }
}

function checkQueryParams() {
  if (!hasFetchedInbox.value) return
  const query = router.currentRoute.value.query
  const item = query?.item ? query.item : queryParams.value?.get('item')
  if (!item) return
  const foundInboxIndex = inbox.value.findIndex(val => item === val._id)
  if (foundInboxIndex === -1) return
  setQueryParams(undefined)


  slide.value = foundInboxIndex
  open.value = true
  EventBus.emit('goToSlide')
}

function groupOnMonth(inbox: InboxItem[]) {
  const inboxPerMonth: { [key: string]: InboxItem[] } = {}
  inbox.forEach(item => {
    const date = new Date(item.date)
    const year = date.getFullYear()
    const month = date.getMonth() + 1 // Months are 0-indexed, so add 1 to get the actual month
    const key = `${year}-${month < 10 ? '0' + month : month}` // Format as YYYY-MM
    if (key in inboxPerMonth) {
      inboxPerMonth[key].push(item)
    } else {
      inboxPerMonth[key] = [item]
    }
  })
  return inboxPerMonth
}

function openPhotoSwiper(inboxItem: InboxItem) {
  slide.value = inbox.value.findIndex(val => inboxItem._id === val._id)
  EventBus.emit('goToSlide')
  open.value = true


}

</script>

<style scoped lang="scss"></style>
