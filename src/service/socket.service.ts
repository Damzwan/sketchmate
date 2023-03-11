import { io, Socket } from 'socket.io-client';
import {
  InboxItem,
  MatchParams,
  MatchRes,
  Res,
  SendParams,
  SOCKET_ENDPONTS,
  SocketAPI,
  SocketLoginParams,
  UnMatchParams,
} from '@/types/server.types';
import { useAppStore } from '@/store/app.store';
import { storeToRefs } from 'pinia';
import { useMessenger } from '@/service/messenger.service';
import { useNotifications } from '@/service/notification.service';
import { useRouter } from 'vue-router';
import { FRONTEND_ROUTES } from '@/types/app.types';

let socket: Socket | undefined;

let socketServiceInstance: SocketAPI | null = null;

export function useSocketService(): SocketAPI {
  if (!socketServiceInstance) socketServiceInstance = createSocketService();
  return socketServiceInstance;
}

export function createSocketService(): SocketAPI {
  const { user, isLoading, notificationsAllowed, inbox } = storeToRefs(useAppStore());
  const { showMsg } = useMessenger();
  const router = useRouter();
  const notificationHandler = useNotifications();

  async function connect(): Promise<void> {
    if (socket) return;
    socket = io(import.meta.env.VITE_BACKEND as string, { withCredentials: true });

    socket.on(SOCKET_ENDPONTS.match, (params: Res<MatchRes>) => {
      if (params) {
        user.value!.mate = params.mate;
        if (!notificationsAllowed.value)
          showMsg('success', 'Matched!', notificationHandler?.requestNotifications, 'Enable Notifications', 6000);
        else showMsg('success', 'Matched!');
      } else showMsg('error', 'Failed to connect to mate');
      isLoading.value = false;
    });

    socket.on(SOCKET_ENDPONTS.unmatch, (success: boolean) => {
      if (success) {
        showMsg('warning', 'Unmatched');
        user.value!.mate = undefined;
        router.push(FRONTEND_ROUTES.connect);
      } else showMsg('error', 'Failed to unmatch');
      isLoading.value = false;
    });

    socket.on(SOCKET_ENDPONTS.send, (params: Res<InboxItem>) => {
      if (params) {
        user.value?.inbox.push(params._id);
        if (inbox.value) inbox.value.push(params);
      }
    });
  }

  async function disconnect(): Promise<void> {
    socket!.disconnect();
  }

  async function login(params: SocketLoginParams): Promise<void> {
    socket!.emit(SOCKET_ENDPONTS.login, params);
  }

  async function match(params: MatchParams): Promise<void> {
    isLoading.value = true;
    socket!.emit(SOCKET_ENDPONTS.match, params);
  }

  async function unMatch(params: UnMatchParams): Promise<void> {
    isLoading.value = true;
    socket!.emit(SOCKET_ENDPONTS.unmatch, params);
  }

  async function send(params: SendParams): Promise<void> {
    socket!.emit(SOCKET_ENDPONTS.send, params);
  }

  return {
    connect,
    login,
    unMatch,
    match,
    disconnect,
    send,
  };
}
