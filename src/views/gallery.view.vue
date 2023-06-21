<template>
  <ion-page id="page">
    <SettingsHeader title="Gallery" :presenting-element="page" />
    <CircularLoader v-if="isLoading || !isLoggedIn" />
    <ion-content v-else>
      <PhotoSwiper
        v-if="inboxItems.length > 0"
        v-model:open="isPhotoSwiperOpen"
        v-model:slide="selectedInboxItemIndex"
        :inbox-items="inboxItems"
        @remove="removeItem"
      />

      <NoMessages v-if="noMessages" />
      <div class="h-full px-4" v-else>
        <div class="h-full">
          <div v-for="date in sortDates(Object.keys(groupedInboxItems))" :key="date" class="pb-3">
            <div class="text-xl font-bold">
              {{ dayjs(date).format('ddd, MMM D') }}
            </div>

            <ion-row class="w-full pt-3">
              <ion-col
                size="4"
                size-md="2"
                size-lg="1"
                class="p-1"
                v-for="(inboxItem, i) in inboxItemsFromDateGroups(date).reverse()"
                :key="i"
              >
                <div @click="openPhotoSwiper(inboxItem)" class="relative">
                  <Thumbnail :inbox-item="inboxItem" :user="user!" />
                </div>
              </ion-col>
            </ion-row>
          </div>
        </div>
      </div>
    </ion-content>
  </ion-page>
</template>

<script lang="ts" setup>
import { IonCol, IonContent, IonPage, IonRow, onIonViewDidEnter } from '@ionic/vue'
import { computed, onMounted, ref, watch } from 'vue'
import { useAppStore } from '@/store/app.store'
import { storeToRefs } from 'pinia'
import { InboxItem } from '@/types/server.types'
import dayjs from 'dayjs'
import { setAppColors, sortDates } from '@/helper/general.helper'
import router from '@/router'
import { useToast } from '@/service/toast.service'
import SettingsHeader from '@/components/settings/SettingsHeader.vue'
import PhotoSwiper from '@/components/gallery/PhotoSwiper.vue'
import { useRoute } from 'vue-router'
import NoMessages from '@/components/gallery/NoMessages.vue'
import Thumbnail from '@/components/gallery/Thumbnail.vue'
import CircularLoader from '@/components/loaders/CircularLoader.vue'
import { colorsPerRoute } from '@/config/colors.config'
import { FRONTEND_ROUTES } from '@/types/router.types'

const { getInbox, cleanUnreadMessages } = useAppStore()
const { user, inbox, isLoading, isLoggedIn } = storeToRefs(useAppStore())
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

// TODO this is ugly
watch(
  () => route.query,
  () => {
    checkQueryParams()
  }
)

watch(isLoading, checkQueryParams)

const page = ref()

onMounted(() => {
  page.value = document.getElementById('page')
})

function fetchInbox() {
  if (!inbox.value && isLoggedIn.value) getInbox().then(checkQueryParams)
}

function checkQueryParams() {
  const query = router.currentRoute.value.query
  const item = query.item
  const foundInboxIndex = inboxItems.value.findIndex(val => item === val._id)
  if (foundInboxIndex === -1) return

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
