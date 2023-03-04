<template>
  <div v-if="user">
    <v-tabs
      align-tabs="center"
      v-model="tab"
      bg-color="secondary"
    >
      <v-tab :value="user.mate">Partner</v-tab>
      <v-tab :value="user._id">Me</v-tab>
    </v-tabs>
  </div>


  <v-container v-if="Object.keys(groups[tab]).length === 0"
               class="w-100 h-75 d-flex justify-center align-center">
    <div class="text-center flex-column d-flex justify-center align-center">
      <v-img :src="noMessagesImg" :height="200" :width="200"/>
      <div class="text-caption pt-5 w-75">No messages have been received yet. Your mate probably hates you...</div>
    </div>
  </v-container>

  <v-container v-else>
    <div v-for="date in Object.keys(groups[tab])" :key="date">
      <div class="text-h6">
        {{ dayjs(date).format('ddd, MMM D') }}
      </div>

      <v-row class="pt-3">
        <v-col v-for="(inboxItem, i) in inboxItemsFromGroups(date)" :key="i" cols="4" class="pa-2">
          <v-img
            @click="selectInboxItem(inboxItem)"
            :src="inboxItem.img"
            :lazy-src="inboxItem.img"
            aspect-ratio="1"
            cover
            class="bg-grey-lighten-2 pointer"
          >
            <template v-slot:placeholder>
              <v-row
                class="fill-height ma-0"
                align="center"
                justify="center"
              >
                <v-progress-circular
                  indeterminate
                  color="primary"
                ></v-progress-circular>
              </v-row>
            </template>
          </v-img>
        </v-col>
      </v-row>
    </div>
  </v-container>

  <v-dialog
    v-model="dialog"
    width="auto"
  >
    <v-card v-if="selectedInboxItem" class="pa-0">
      <v-img :src="selectedInboxItem.img" :width="calculateModalWidth()" aspect-ratio="1"/>
      <v-card-title class="d-flex justify-space-between py-1 align-center">
        I Miss You :(
        <div class="mr-n3">
          <v-btn size="small" color="surface-variant" variant="text" icon="mdi-delete"
                 @click="reply(selectedInboxItem)"></v-btn>
          <v-btn size="small" color="surface-variant" variant="text" icon="mdi-reply"
                 @click="reply(selectedInboxItem)"></v-btn>
          <v-btn size="small" color="surface-variant" variant="text" icon="mdi-share-variant"></v-btn>
        </div>
      </v-card-title>
    </v-card>
  </v-dialog>
</template>

<script lang="ts" setup>
import {computed, ref} from 'vue';
import {useAppStore} from '@/store/app.store';
import {storeToRefs} from 'pinia';
import {InboxItem} from '@/types/server.types';
import dayjs from 'dayjs';
import noMessagesImg from '@/assets/illustrations/no-messages.svg'
import {useDrawStore} from '@/store/draw.store';

const {user} = storeToRefs(useAppStore());
const {reply} = useDrawStore();

const tab = ref<string>(user.value!.mate!);
const dialog = ref<boolean>(false);
const groups = computed(() => group(user.value!.inbox))
const selectedInboxItem = ref<InboxItem>();

function inboxItemsFromGroups(date: string): InboxItem[] {
  return Object.values(groups.value[tab.value][date])
}

function calculateModalWidth() {
  return window.innerWidth * 0.9;
}


function group(inbox: InboxItem[]) {
  const groups: any = {[user.value!._id]: {}, [user.value!.mate!]: {}}

  inbox.forEach(item => {
    const date = item.date.toString().split('T')[0];
    if (date in groups[item.sender!]) groups[item.sender!][date].push(item)
    else groups[item.sender!][date] = [item]
  })
  return groups;
}

function selectInboxItem(inboxItem: any) {
  selectedInboxItem.value = inboxItem;
  dialog.value = true;
}
</script>


<style scoped>
.pointer {
  cursor: pointer;
}
</style>
