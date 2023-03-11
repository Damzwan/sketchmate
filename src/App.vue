<template>
  <v-app>
    <Error v-if="error"/>
    <v-main v-else>
      <FullScreenLoader v-if="isLoading || !isLoggedIn"/>
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
import {useRouter} from 'vue-router';

const {connect, disconnect} = useSocketService();
const {error, isLoading, isLoggedIn} = storeToRefs(useAppStore());
const router = useRouter();


router.beforeEach(async (to, from, next) => {
  const app = useAppStore();
  if (!app.isLoggedIn) await connect().then(app.login);
  next();
});


// Listen for incoming gallery from the Service Worker
const channel = new BroadcastChannel('navigation');
channel.addEventListener('message', function (event) {
  router.push(event.data.url);
});

onErrorCaptured((err) => {
  console.log(err);
});

onUnmounted(() => {
  disconnect();
});

</script>

<style>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
