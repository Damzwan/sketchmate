<template>
  <ion-page id="page">
    <SettingsHeader
      title="Gallery"
      :presenting-element="page"
      :selected-mode="multiSelectMode"
      :selected-items="selectedItems"
      @cancel="cancelMultiSelect"
      @delete="alterTrigger.click()"
    />
    <CircularLoader v-if="isLoading || !isLoggedIn" />
    <ion-content v-else>
      <ion-refresher slot="fixed" @ionRefresh="refresh">
        <ion-refresher-content></ion-refresher-content>
      </ion-refresher>

      <PhotoSwiper
        v-if="inboxItems.length > 0"
        v-model:open="isPhotoSwiperOpen"
        v-model:slide="selectedInboxItemIndex"
        :inbox-items="inboxItems"
        @remove="removeItem"
      />

      <NoMessages v-if="noMessages" />
      <div class="h-full px-2" v-else>
        <div class="h-full">
          <div v-for="date in sortDates(Object.keys(groupedInboxItems))" :key="date" class="pb-3">
            <div class="text-xl font-bold">
              {{ dayjs(date).format('ddd, MMM D') }}
            </div>

            <div class="grid grid-cols-4 md:grid-cols-12 lg:grid-cols-20 gap-1.5 pt-3">
              <div
                v-for="(inboxItem, i) in inboxItemsFromDateGroups(date).reverse()"
                :key="i"
                :class="inboxItem.aspect_ratio > 1 ? 'col-span-2' : 'col-span-1'"
              >
                <Thumbnail
                  :inbox-item="inboxItem"
                  :user="user!"
                  :multi-selected-items="selectedItems"
                  :multi-select-mode="multiSelectMode"
                  @long-press="() => onItemLongPress(inboxItem)"
                  @click="onThumbnailClick(inboxItem)"
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
    </ion-content>
  </ion-page>
</template>

<script lang="ts" setup>
import { IonContent, IonPage, IonRefresher, IonRefresherContent, onIonViewWillLeave } from '@ionic/vue'
import { computed, onMounted, ref, watch } from 'vue'
import { useAppStore } from '@/store/app.store'
import { storeToRefs } from 'pinia'
import { InboxItem } from '@/types/server.types'
import dayjs from 'dayjs'
import { sortDates } from '@/helper/general.helper'
import router from '@/router'
import { useToast } from '@/service/toast.service'
import SettingsHeader from '@/components/settings/SettingsHeader.vue'
import PhotoSwiper from '@/components/gallery/PhotoSwiper.vue'
import { useRoute } from 'vue-router'
import NoMessages from '@/components/gallery/NoMessages.vue'
import Thumbnail from '@/components/gallery/Thumbnail.vue'
import CircularLoader from '@/components/loaders/CircularLoader.vue'
import { useAPI } from '@/service/api/api.service'
import ConfirmationAlert from '@/components/general/ConfirmationAlert.vue'

const api = useAPI()
const { getInbox, cleanUnreadMessages, refresh, setQueryParams } = useAppStore()
const { user, inbox, isLoading, isLoggedIn, queryParams } = storeToRefs(useAppStore())
const { toast } = useToast()

cleanUnreadMessages()

fetchInbox()
watch(isLoggedIn, () => {
  fetchInbox()
})

const isPhotoSwiperOpen = ref<boolean>(false)
const groupedInboxItems = computed(() => groupOnDate(inbox.value ? inbox.value : []))
const inboxItems = computed(() => (inbox.value ? inbox.value.slice().reverse() : []))

const noMessages = computed(() => inboxItems.value.length === 0)

const selectedInboxItemIndex = ref<number>(0)
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
watch(
  () => route.query,
  () => {
    checkQueryParams()
  }
)

watch(isLoading, checkQueryParams)
watch(queryParams, checkQueryParams)

const page = ref()

onMounted(() => {
  page.value = document.getElementById('page')
})

function fetchInbox() {
  if (!inbox.value && isLoggedIn.value) getInbox().then(checkQueryParams)
}

function checkQueryParams() {
  const query = router.currentRoute.value.query
  const item = queryParams.value ? queryParams.value.get('item') : query.item
  const foundInboxIndex = inboxItems.value.findIndex(val => item === val._id)
  if (foundInboxIndex === -1) return
  setQueryParams(undefined)

  selectedInboxItemIndex.value = foundInboxIndex
  isPhotoSwiperOpen.value = true
}

function inboxItemsFromDateGroups(date: string): InboxItem[] {
  return Object.values(groupedInboxItems.value[date])
}

function groupOnDate(inbox: InboxItem[]) {
  const inboxPerDate: any = {}
  inbox.forEach(item => {
    const date = item.date.toString().split('T')[0]
    if (date in inboxPerDate) inboxPerDate[date].push(item)
    else inboxPerDate[date] = [item]
  })
  return inboxPerDate
}

function openPhotoSwiper(inboxItem: InboxItem) {
  selectedInboxItemIndex.value = inboxItems.value.findIndex(val => inboxItem._id === val._id)
  isPhotoSwiperOpen.value = true
}

function removeItem() {
  const tmp = selectedInboxItemIndex.value
  selectedInboxItemIndex.value = Math.max(0, selectedInboxItemIndex.value - 1)
  if (inboxItems.value?.length === 1) isPhotoSwiperOpen.value = false
  inbox.value?.splice(inbox.value?.length - 1 - tmp, 1)
  toast('Item deleted')
}
</script>

<style scoped lang="scss"></style>
