import {
  mdiCompassOutline,
  mdiConnection,
  mdiContentCopy,
  mdiContentSave,
  mdiCursorDefaultClickOutline,
  mdiDeleteOutline,
  mdiEraser,
  mdiFlipToFront,
  mdiFormatColorFill,
  mdiFormatText,
  mdiGesturePinch,
  mdiGestureTapButton,
  mdiImage,
  mdiLasso,
  mdiMerge,
  mdiPencilOutline,
  mdiShapeOutline,
  mdiStickerCircleOutline,
  mdiStickerEmoji,
  mdiTools
} from '@mdi/js'

import color from '@/assets/docs/color.md'
import copy from '@/assets/docs/copy.md'
import deletemd from '@/assets/docs/delete.md'
import emblems from '@/assets/docs/emblems.md'
import eraser from '@/assets/docs/eraser.md'
import images from '@/assets/docs/images.md'
import lasso from '@/assets/docs/lasso.md'
import layer from '@/assets/docs/layer.md'
import merge from '@/assets/docs/merge.md'
import overview from '@/assets/docs/overview.md'
import pen from '@/assets/docs/pen.md'
import save from '@/assets/docs/save.md'
import selection from '@/assets/docs/selection.md'
import shapes from '@/assets/docs/shapes.md'
import stickers from '@/assets/docs/stickers.md'
import text from '@/assets/docs/text.md'
import zoom from '@/assets/docs/zoom.md'
import connect from '@/assets/docs/connect.md'

export interface DocsItem {
  key: string
  icon: string
  text: string
  page?: any
  children?: DocsItem[]
}

export const docsAccordionContent: DocsItem[] = [
  {
    key: 'started',
    icon: mdiCompassOutline,
    text: 'Getting started',
    children: [
      {
        key: 'overview',
        icon: mdiCompassOutline,
        text: 'Overview',
        page: overview
      },
      {
        key: 'connection',
        icon: mdiConnection,
        text: 'Connecting',
        page: connect
      },
      {
        key: 'zoom',
        icon: mdiGesturePinch,
        text: 'Zooming in and out',
        page: zoom
      }
    ]
  },
  {
    key: 'tools',
    icon: mdiTools,
    text: 'Tools',
    children: [
      {
        key: 'pen',
        icon: mdiPencilOutline,
        text: 'Pen',
        page: pen
      },
      {
        key: 'eraser',
        icon: mdiEraser,
        text: 'Eraser',
        page: eraser
      },
      {
        key: 'selection',
        icon: mdiCursorDefaultClickOutline,
        text: 'Selection',
        page: selection
      },
      {
        key: 'lasso',
        icon: mdiLasso,
        text: 'Lasso select',
        page: lasso
      }
    ]
  },
  {
    key: 'action',
    icon: mdiGestureTapButton,
    text: 'Actions',
    children: [
      {
        key: 'stickers',
        icon: mdiStickerEmoji,
        text: 'Adding Stickers',
        page: stickers
      },
      {
        key: 'emblems',
        icon: mdiStickerCircleOutline,
        text: 'Adding Emblems',
        page: emblems
      },
      {
        key: 'images',
        icon: mdiImage,
        text: 'Adding Images',
        page: images
      },
      {
        key: 'text',
        icon: mdiFormatText,
        text: 'Adding Text',
        page: text
      },
      {
        key: 'shapes',
        icon: mdiShapeOutline,
        text: 'Adding shapes',
        page: shapes
      },
      {
        key: 'save',
        icon: mdiContentSave,
        text: 'Saving drawings',
        page: save
      },
      {
        key: 'color',
        icon: mdiFormatColorFill,
        text: 'Changing colors',
        page: color
      },
      {
        key: 'copy',
        icon: mdiContentCopy,
        text: 'Copying objects',
        page: copy
      },
      {
        key: 'merge',
        icon: mdiMerge,
        text: 'Merging objects',
        page: merge
      },
      {
        key: 'delete',
        icon: mdiDeleteOutline,
        text: 'Deleting objects',
        page: deletemd
      },
      {
        key: 'layer',
        icon: mdiFlipToFront,
        text: 'Layering objects',
        page: layer
      }
    ]
  }
]
