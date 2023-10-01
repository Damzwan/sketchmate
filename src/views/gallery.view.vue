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
    <ion-content>
      <CircularLoader v-if="isLoading || !isLoggedIn" class="z-50" />

      <ion-refresher slot="fixed" @ionRefresh="refresh">
        <ion-refresher-content></ion-refresher-content>
      </ion-refresher>

      <PhotoSwiper
        key="swiper"
        v-show="inboxItems.length > 0"
        v-model:open="isPhotoSwiperOpen"
        v-model:slide="selectedInboxItemIndex"
        :inbox-items="inboxItems"
        @remove="removeItem"
        @see="seeItem"
      />

      <NoMessages v-if="noMessages" />
      <div class="h-full px-3" v-else>
        <div class="h-full">
          <div v-for="date in sortDates(Object.keys(groupedInboxItems))" :key="date" class="pb-3">
            <div class="text-xl font-bold">
              {{ dayjs(date).format('MMMM, YYYY') }}
            </div>

            <div class="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 xl:grid-cols-12 gap-1.5 pt-3">
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
                  @hover="seeItem(i)"
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
const { getInbox, refresh, setQueryParams } = useAppStore()
const { user, inbox, isLoggedIn, queryParams } = storeToRefs(useAppStore())
const { toast } = useToast()

const isLoading = ref(true)

onMounted(fetchInbox)
watch(isLoggedIn, () => {
  fetchInbox()
})

const isPhotoSwiperOpen = ref<boolean>(false)
const groupedInboxItems = computed(() => groupOnMonth(inbox.value ? inbox.value : []))
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
    if (!route.query.item) return
    checkQueryParams()
  }
)

watch(isLoading, checkQueryParams)
watch(queryParams, checkQueryParams)

const page = ref()

onMounted(() => {
  page.value = document.getElementById('page')
})

async function fetchInbox() {
  if (!inbox.value && isLoggedIn.value) {
    isLoading.value = true
    await getInbox()
    isLoading.value = false
    checkQueryParams()
  }
}

function checkQueryParams() {
  if (isPhotoSwiperOpen.value || isLoading.value) return
  const query = router.currentRoute.value.query
  const item = queryParams.value ? queryParams.value.get('item') : query.item
  if (!item) return
  const foundInboxIndex = inboxItems.value.findIndex(val => item === val._id)
  if (foundInboxIndex === -1) return
  setQueryParams(undefined)

  selectedInboxItemIndex.value = foundInboxIndex
  isPhotoSwiperOpen.value = true
}

function inboxItemsFromDateGroups(date: string): InboxItem[] {
  return Object.values(groupedInboxItems.value[date])
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
  if (isPhotoSwiperOpen.value) return
  selectedInboxItemIndex.value = inboxItems.value.findIndex(val => inboxItem._id === val._id)
  isPhotoSwiperOpen.value = true
}

function seeItem(index?: number) {
  const indexOfItemToSee = index ? index : selectedInboxItemIndex.value
  const item = inboxItems.value[indexOfItemToSee]
  api.seeInboxItem({
    user_id: user.value!._id,
    inbox_id: item._id
  })
  inboxItems.value[indexOfItemToSee].seen_by.push(user.value!._id)
  inboxItems.value[indexOfItemToSee].comments_seen_by.push(user.value!._id)
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
