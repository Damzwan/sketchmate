import {defineStore, storeToRefs} from 'pinia';
import {DrawTool} from '@/types/draw.types';
import {ref} from 'vue';
import {ERASERS, ERASERWIDTH, PENCOLOR, STROKEWIDTH, TEXTCOLOR, TEXTSIZE, WHITE} from '@/constants/draw.constants';
import {Canvas} from 'fabric/fabric-impl';
import {useAppStore} from '@/store/app.store';
import {useSocketService} from '@/service/socket.service';
import {useMessenger} from '@/service/messenger.service';
import {InboxItem} from '@/types/server.types';
import {useRouter} from 'vue-router';
import {FRONTEND_ROUTES} from '@/types/app.types';
import {fabric} from 'fabric';

export const useDrawStore = defineStore('draw', () => {
  const {user} = storeToRefs(useAppStore())
  const api = useSocketService();
  const router = useRouter();
  const {showMsg} = useMessenger()

  const isDrawingMode = ref(true);
  const strokeWidth = ref(STROKEWIDTH)
  const eraserWidth = ref(ERASERWIDTH)
  const penColor = ref(PENCOLOR)
  const stickers = ref<string[]>([])
  const textBoxes = ref<string[]>([]);
  const textSize = ref(TEXTSIZE);
  const textColor = ref(TEXTCOLOR);

  const selectedTool = ref<DrawTool>(DrawTool.Pen);
  const lastSelectedEraserTool = ref<DrawTool>(DrawTool.MobileEraser);
  const canvas = ref<Canvas>(new fabric.Canvas(document.createElement('canvas'), {
    backgroundColor: WHITE,
  }));

  function selectTool(newTool: DrawTool) {
    selectedTool.value = newTool;
    if (ERASERS.includes(newTool) && newTool != DrawTool.FullEraser) lastSelectedEraserTool.value = newTool;
  }

  function addSticker(sticker: string) {
    stickers.value.push(sticker);
  }

  function addTextBox(textBox: string) {
    textBoxes.value.push(textBox);
  }

  async function send() {
    if (!canvas.value) return;
    await api.send({
      _id: user.value!._id,
      mate: user.value!.mate as string,
      drawing: JSON.stringify(canvas.value.toJSON(['width', 'height'])),
      img: canvas.value.toDataURL()
    })
    showMsg('success', 'Drawing Sent!')
  }

  async function reply(inboxItem: InboxItem | undefined) {
    if (!inboxItem) return;
    const json = await fetch(inboxItem.drawing).then(res => res.json())
    canvas.value.loadFromJSON(json, () => {
      router.push(FRONTEND_ROUTES.draw)
    })
  }

  return {
    selectedTool,
    selectTool,
    strokeWidth,
    penColor,
    isDrawingMode,
    eraserWidth,
    lastSelectedEraserTool,
    stickers,
    addSticker,
    textSize,
    textColor,
    textBoxes,
    addTextBox,
    canvas,
    send,
    reply
  }
})
