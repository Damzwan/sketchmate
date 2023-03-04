import {io, Socket} from 'socket.io-client';
import {
  InboxItem,
  MatchParams,
  MatchRes,
  Res,
  SendParams,
  SOCKET_ENDPONTS,
  SocketAPI,
  SocketLoginParams,
  UnMatchParams
} from '@/types/server.types';
import {useAppStore} from '@/store/app.store';
import {storeToRefs} from 'pinia';
import {useMessenger} from '@/service/messenger.service';
import {useNotificationHandler} from '@/service/notification.service';
import {computed} from 'vue';

let socket: Socket | undefined;

export function useSocketService(): SocketAPI {
  const {user, isLoading, notificationsAllowed} = storeToRefs(useAppStore());
  const {showMsg} = useMessenger()
  const notificationHandler = useNotificationHandler();

  async function connect(): Promise<void> {
    if (socket) return;
    socket = io(import.meta.env.VITE_BACKEND_LOCAL as string)

    socket.on(SOCKET_ENDPONTS.match, (params: Res<MatchRes>) => {
      if (params) {
        user.value!.mate = params.mate;
        if (!notificationsAllowed.value) showMsg('success', 'Matched!', notificationHandler?.requestNotifications, 'Enable Notifications', 6000)
        else showMsg('success', 'Matched!')
      } else showMsg('error', "Failed to connect to mate")
      isLoading.value = false;
    })

    socket.on(SOCKET_ENDPONTS.unmatch, (success: boolean) => {
      if (success) {
        showMsg('success', 'Unmatched')
        user.value!.mate = undefined;
      } else showMsg('error', "Failed to unmatch")
      isLoading.value = false;
    })

    socket.on(SOCKET_ENDPONTS.send, (params: Res<InboxItem>) => {
      if (params) user.value?.inbox.push(params)
    })
  }

  async function disconnect(): Promise<void> {
    socket!.disconnect();
  }

  async function login(params: SocketLoginParams): Promise<void> {
    socket!.emit(SOCKET_ENDPONTS.login, params)
  }

  async function match(params: MatchParams): Promise<void> {
    isLoading.value = true;
    socket!.emit(SOCKET_ENDPONTS.match, params)
  }

  async function unMatch(params: UnMatchParams): Promise<void> {
    isLoading.value = true;
    socket!.emit(SOCKET_ENDPONTS.unmatch, params)
  }

  async function send(params: SendParams): Promise<void> {
    socket!.emit(SOCKET_ENDPONTS.send, params)
  }

  return {
    connect,
    login,
    unMatch,
    match,
    disconnect,
    send
  }

}
