<template>
  <div class="h-100" v-if="user">
    <PhotoSwiper v-model:open="isPhotoSwiperOpen" v-model:slide="selectedInboxItemIndex" :inbox-items="inboxItems"
                 @remove="removeItem"/>

    <div class="h-100">
      <NoMessages v-if="noMessages"/>

      <div v-else class="h-100">
        <v-container>
          <div v-for="date in sortDates(Object.keys(groupedInboxItems))" :key="date" class="pb-3">
            <div class="text-h6">
              {{ dayjs(date).format('ddd, MMM D') }}
            </div>

            <v-row class="pt-3" dense>
              <v-col v-for="(inboxItem, i) in inboxItemsFromDateGroups(date).reverse()" :key="i" cols="3" sm="2">
                <div style="position: relative">
                  <v-img
                    @click="openPhotoSwiper(inboxItem)"
                    :src="inboxItem.thumbnail"
                    :lazy-src="inboxItem.thumbnail"
                    aspect-ratio="1"
                    cover
                    class="bg-grey-lighten-2 pointer rounded"
                  >
                    <template v-slot:placeholder>
                      <v-row class="fill-height ma-0" align="center" justify="center">
                        <v-progress-circular indeterminate color="primary"></v-progress-circular>
                      </v-row>
                    </template>
                  </v-img>
                  <v-avatar class="avatar_on_image" :size="36"
                            :image="inboxItem.sender === user._id ? user.img : user.mate.img"/>
                </div>
              </v-col>
            </v-row>
          </div>
        </v-container>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import {computed, ref, watch} from 'vue';
import {useAppStore} from '@/store/app.store';
import {storeToRefs} from 'pinia';
import {InboxItem} from '@/types/server.types';
import dayjs from 'dayjs';
import {sortDates} from '@/helper/general.helper';
import PhotoSwiper from '@/components/gallery/PhotoSwiper.vue';
import NoMessages from '@/components/gallery/NoMessages.vue';
import {useMessenger} from '@/service/messenger.service';
import router from '@/router';

const {getInbox} = useAppStore();
const {user, inbox} = storeToRefs(useAppStore());
const {showMsg} = useMessenger()

if (!inbox.value) getInbox();

const isPhotoSwiperOpen = ref<boolean>(false);
const groupedInboxItems = computed(() => groupOnDate(inbox.value ? inbox.value : []));
const inboxItems = computed(() => inbox.value ? inbox.value.slice().reverse() : [])

const noMessages = computed(() => inboxItems.value.length === 0)

const selectedInboxItemIndex = ref<number>(0);

const currentQueryParam = computed(() => router.currentRoute.value.query.item)

checkQueryParams()
watch(currentQueryParam, () => {
  checkQueryParams()
})

function checkQueryParams() {
  const query = router.currentRoute.value.query;
  const item = query.item
  const foundInboxIndex = inboxItems.value.findIndex((val) => item === val._id)
  if (foundInboxIndex === -1) return
  selectedInboxItemIndex.value = foundInboxIndex
  isPhotoSwiperOpen.value = true;
  router.replace({query: undefined});
}

function inboxItemsFromDateGroups(date: string): InboxItem[] {
  return Object.values(groupedInboxItems.value[date]);
}

function groupOnDate(inbox: InboxItem[]) {
  const inboxPerDate: any = {}
  inbox.forEach((item) => {
    const date = item.date.toString().split('T')[0];
    if (date in inboxPerDate) inboxPerDate[date].push(item)
    else inboxPerDate[date] = [item];
  });
  return inboxPerDate;
}

function openPhotoSwiper(inboxItem: InboxItem) {
  selectedInboxItemIndex.value = inboxItems.value.findIndex((val) => inboxItem._id === val._id);
  isPhotoSwiperOpen.value = true;
}

function removeItem() {
  const tmp = selectedInboxItemIndex.value
  selectedInboxItemIndex.value = Math.max(0, selectedInboxItemIndex.value - 1)
  if (inboxItems.value?.length === 1) isPhotoSwiperOpen.value = false
  inbox.value?.splice(inbox.value?.length - 1 - tmp, 1)
  showMsg('success', 'Item deleted', undefined, undefined, 1000)
}
</script>

<style scoped>
.pointer {
  cursor: pointer;
}

.avatar_on_image {
  position: absolute;
  top: 5px;
  right: 5px;
  z-index: 10;
}
</style>
