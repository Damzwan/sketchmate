<template>
  <v-navigation-drawer location="bottom" v-model="isOpen" class="t" rounded>
    <v-sheet v-if="currInboxItem">
      <div class="my-2">
        <v-row v-for="(comment, i) in currInboxItem.comments" :key="i" class="pl-2">
          <v-col cols="2" class="mr-n6 d-flex align-center">
            <v-avatar color="primary" size="32"
                      :image="comment.sender === user._id ? user.img : user.mate.img"></v-avatar>
          </v-col>
          <v-col cols="8" class="d-flex flex-column">
            <div class="text-caption font-weight-bold">
              {{ comment.sender === user._id ? user.name : user.mate.name }}
            </div>
            <div class="text-body-2">
              {{ comment.message }}
            </div>
          </v-col>

          <v-col cols="2" class="d-flex align-center justify-center">
            <div class="text-caption text-center">
              {{dayjs(comment.date).format('MMM D')}}
            </div>
          </v-col>

        </v-row>
      </div>

      <v-divider/>
      <v-text-field placeholder="Say something" v-model="commentBody" density="compact" hide-details @update:focused="commentBody = ''">
        <template v-slot:append-inner>
          <v-icon :icon="mdiSend" @click="comment" v-if="commentBody.length > 0"/>
        </template>
      </v-text-field>
    </v-sheet>
  </v-navigation-drawer>
</template>

<script lang="ts" setup>
import {computed, ref} from 'vue';
import {Comment, InboxItem} from '@/types/server.types';
import {useAPI} from '@/service/api.service';
import {useAppStore} from '@/store/app.store';
import {storeToRefs} from 'pinia';
import {useMessenger} from '@/service/messenger.service';
import {mdiSend} from '@mdi/js';
import dayjs from 'dayjs';

const api = useAPI()
const {user} = useAppStore()
const {inbox} = storeToRefs(useAppStore())
const {showMsg} = useMessenger()

const props = defineProps({
  open: {
    required: true,
    type: Boolean
  },
  currInboxItem: {
    required: true,
    type: Object as () => InboxItem
  },
  indexOfCurrInboxItem: {
    required: true,
    type: Number
  }
})
const emit = defineEmits(['update:open', 'update:currInboxItem'])

const commentBody = ref('')

async function comment() {
  const comment = await api.comment({inbox_id: props.currInboxItem!._id, sender: user!._id, message: commentBody.value})
  inbox.value![props.indexOfCurrInboxItem!].comments.push(comment!)
  showMsg('success', 'comment placed', undefined, undefined, 2000)
  close()
}

const isOpen = computed({
  get() {
    return props.open
  },
  set(newValue) {
    emit("update:open", newValue);
  },
});

function close() {
  emit("update:open", false);
}
</script>

<style scoped>
.t {
  height: 100px !important;
  width: 100px;
  background-color: red;
}
</style>
