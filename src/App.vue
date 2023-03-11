<template>
  <v-app>
    <Error v-if="error"/>
    <v-main v-else>
      <FullScreenLoader v-if="!user || isLoading"/>
      <router-view v-slot="{ Component }" v-else>
        <transition name="fade" mode="out-in">
          <component :is="Component"/>
        </transition>
      </router-view>
      <Messenger/>
    </v-main>
    <BottomNav v-if="!error"/>
  </v-app>
</template>

<script setup lang="ts">
import BottomNav from '@/components/BottomNavigation.vue';
import {useAppStore} from '@/store/app.store';
import {onErrorCaptured, onUnmounted} from 'vue';
import {useSocketService} from '@/service/socket.service';
import FullScreenLoader from '@/components/FullScreenLoader.vue';
import {storeToRefs} from 'pinia';
import Error from '@/components/Error.vue';
import Messenger from '@/components/Messenger.vue';
import router from '@/router';

const {connect, disconnect} = useSocketService();


const {login} = useAppStore();
const {user, error, isLoading} = storeToRefs(useAppStore())

const channel = new BroadcastChannel('navigation');

// Listen for incoming messages from the Service Worker
channel.addEventListener('message', function (event) {
  router.push(event.data.url)
});


onErrorCaptured((err) => {
  console.log(err)
})

onUnmounted(() => {
  disconnect();
})

connect().then(login);

</script>

<style>
.fade-enter-active, .fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from, .fade-leave-to {
  opacity: 0;
}
</style>
