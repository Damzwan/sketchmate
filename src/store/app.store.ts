// Utilities
import { defineStore } from 'pinia';
import { ref } from 'vue';
import { InboxItem, User } from '@/types/server.types';
import { useSocketService } from '@/service/socket.service';
import { getUser } from '@/helper/app.helper';
import { useAPI } from '@/service/api.service';

export const useAppStore = defineStore('app', () => {
  const user = ref<User>();
  const inbox = ref<InboxItem[]>();

  const isLoggedIn = ref(false);
  const isLoading = ref(false);
  const notificationsAllowed = ref(false);

  const error = ref();
  const socketService = useSocketService();
  const api = useAPI();

  async function login() {
    try {
      user.value = await getUser();
      await socketService.login({ _id: user.value!._id });
      isLoggedIn.value = true;
    } catch (e) {
      error.value = e;
    }
  }

  async function getInbox() {
    try {
      if (user.value!.inbox.length === 0) {
        inbox.value = [];
        return;
      }
      isLoading.value = true;
      const retrievedInbox = await api.getInbox({
        _ids: user.value!.inbox,
      });
      isLoading.value = false;
      if (!retrievedInbox) throw new Error();
      inbox.value = retrievedInbox;
    } catch (e) {
      error.value = e;
    }
  }

  return { user, login, isLoading, error, notificationsAllowed, isLoggedIn, inbox, getInbox };
});
