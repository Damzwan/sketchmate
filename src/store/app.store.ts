// Utilities
import {defineStore} from 'pinia'
import {ref} from 'vue';
import {FRONTEND_ROUTES, Storage} from '@/types/app.types';
import {useAPI} from '@/service/api.service';
import {User} from '@/types/server.types';
import {useSocketService} from '@/service/socket.service';
import {useRouter} from 'vue-router';

export const useAppStore = defineStore('app', () => {
  const api = useAPI();
  const user = ref<User>();
  const isLoading = ref(true);
  const notificationsAllowed = ref(false);
  const isInfoModalOpen = ref(false);

  const error = ref();
  const socketService = useSocketService();
  const router = useRouter();

  async function login() {
    try {
      let user_id = localStorage.getItem(Storage.user);
      if (!user_id) {
        const res = await api.createUser();
        if (!res) throw new Error();
        user_id = res._id;
        localStorage.setItem(Storage.user, user_id);
      }

      const found_user = await api.getUser({_id: user_id});
      if (!found_user) return
      user.value = found_user;

      if (!user.value.mate && window.location.pathname !== `/${FRONTEND_ROUTES.connect}`) await router.replace(FRONTEND_ROUTES.connect)
      await socketService.login({_id: found_user._id})
      isLoading.value = false;
    } catch (e) {
      error.value = e;
    }
  }

  return {user, login, isLoading, error, notificationsAllowed, isInfoModalOpen}
})
