import {storeToRefs} from 'pinia';
import {useAppStore} from '@/store/app.store';
import {computed} from 'vue';
import {PushSubscription} from 'web-push';
import {useAPI} from '@/service/api.service';


export function useNotificationHandler() {
  const {notificationsAllowed, user} = storeToRefs(useAppStore())
  const {subscribe, unsubscribe} = useAPI();

  async function requestNotifications() {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') notificationsAllowed.value = false;
    else await subscribeToNotifications();
  }

  async function subscribeToNotifications() {
    const registration: ServiceWorkerRegistration = await navigator.serviceWorker.ready;
    if (!registration) return;

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: import.meta.env.VITE_VAPID_PUBLIC,
    })

    try {
      await subscribe({_id: user.value!._id, subscription: subscription as unknown as PushSubscription})
      notificationsAllowed.value = true;
    } catch (e) {
      throw new Error('Failed to subscribe')
    }
  }

  async function unSubscribeNotifications() {
    try {
      await unsubscribe({_id: user.value!._id})
      notificationsAllowed.value = false;
    } catch (e) {
      console.log(e)
      throw new Error('Failed to unsubscribe!')
    }
  }

  function checkNotificationState() {
    if (!user.value) return
    if (Notification.permission !== 'granted' && user.value.subscription) unSubscribeNotifications();
    else if (user.value.subscription) notificationsAllowed.value = true;
  }

  if (user) checkNotificationState()

  return {requestNotifications, unSubscribeNotifications}

}
