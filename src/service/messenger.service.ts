import {ref} from 'vue';
import {COLOR} from '@/types/theme.types';

let notificationHandlerInstance: ReturnType<typeof createMessenger> | null = null;

export function useMessenger() {
  if (!notificationHandlerInstance) notificationHandlerInstance = createMessenger();
  return notificationHandlerInstance;
}


function createMessenger() {
  const show = ref(false);
  const color = ref<COLOR>('success')
  const text = ref<string>('')
  const timeout = ref(2000);
  const action = ref<() => void>();
  const action_title = ref<string>();

  function showMsg(new_color: COLOR, new_text: string, new_action?: () => void, new_action_title?: string, new_timeout = 2000): void {
    show.value = true;
    color.value = new_color
    text.value = new_text
    timeout.value = new_timeout
    action.value = new_action;
    action_title.value = new_action_title;
  }

  return {show, color, text, timeout, showMsg, action, action_title}
}
