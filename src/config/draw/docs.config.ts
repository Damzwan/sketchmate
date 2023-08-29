import {
  mdiCogOutline,
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
  mdiGestureTapButton,
  mdiImage,
  mdiImageMultipleOutline,
  mdiMerge,
  mdiMinusThick,
  mdiPencilOutline,
  mdiShapeOutline,
  mdiStickerCircleOutline,
  mdiStickerEmoji,
  mdiTools,
  mdiUndo
} from '@mdi/js'

import color from '@/assets/docs/color.md'
import copy from '@/assets/docs/copy.md'
import deletemd from '@/assets/docs/delete.md'
import emblems from '@/assets/docs/emblems.md'
import eraser from '@/assets/docs/eraser.md'
import images from '@/assets/docs/images.md'
import layer from '@/assets/docs/layer.md'
import merge from '@/assets/docs/merge.md'
import overview from '@/assets/docs/overview.md'
import pen from '@/assets/docs/pen.md'
import save from '@/assets/docs/save.md'
import selection from '@/assets/docs/selection.md'
import shapes from '@/assets/docs/shapes.md'
import stickers from '@/assets/docs/stickers.md'
import text from '@/assets/docs/text.md'
import connect from '@/assets/docs/connect.md'
import gallery from '@/assets/docs/gallery.md'
import undoredo from '@/assets/docs/undoredo.md'
import settings from '@/assets/docs/settings.md'
import draw from '@/assets/docs/draw.md'
import width from '@/assets/docs/width.md'

export interface DocsItem {
  icon: string
  text: string
  page?: any
  children?: DocsKey[]
}

export type DocsKey =
  | 'started'
  | 'tools'
  | 'action'
  | 'overview'
  | 'connect'
  | 'gallery'
  | 'settings'
  | 'pen'
  | 'eraser'
  | 'selection'
  | 'undoredo'
  | 'stickers'
  | 'emblems'
  | 'images'
  | 'text'
  | 'shapes'
  | 'save'
  | 'color'
  | 'copy'
  | 'merge'
  | 'delete'
  | 'layer'
  | 'draw'
  | 'width'

export const docsMapping: Record<DocsKey, DocsItem> = {
  started: {
    icon: mdiCompassOutline,
    text: 'Getting started',
    children: ['overview', 'connect', 'draw', 'gallery', 'settings']
  },
  tools: {
    icon: mdiTools,
    text: 'Tools',
    children: ['pen', 'eraser', 'selection']
  },
  action: {
    icon: mdiGestureTapButton,
    text: 'Actions',
    children: [
      'undoredo',
      'stickers',
      'emblems',
      'images',
      'text',
      'shapes',
      'save',
      'color',
      'width',
      'copy',
      'merge',
      'delete',
      'layer'
    ]
  },
  overview: {
    icon: mdiCompassOutline,
    text: 'Overview',
    page: overview
  },
  connect: {
    icon: mdiConnection,
    text: 'Connecting',
    page: connect
  },
  gallery: {
    icon: mdiImageMultipleOutline,
    text: 'Gallery',
    page: gallery
  },
  settings: {
    icon: mdiCogOutline,
    text: 'Settings',
    page: settings
  },
  pen: {
    icon: mdiPencilOutline,
    text: 'Pen',
    page: pen
  },
  eraser: {
    icon: mdiEraser,
    text: 'Eraser',
    page: eraser
  },
  selection: {
    icon: mdiCursorDefaultClickOutline,
    text: 'Selection',
    page: selection
  },
  undoredo: {
    icon: mdiUndo,
    text: 'Undo & Redo',
    page: undoredo
  },
  stickers: {
    icon: mdiStickerEmoji,
    text: 'Adding Stickers',
    page: stickers
  },
  emblems: {
    icon: mdiStickerCircleOutline,
    text: 'Adding Emblems',
    page: emblems
  },
  images: {
    icon: mdiImage,
    text: 'Adding Images',
    page: images
  },
  text: {
    icon: mdiFormatText,
    text: 'Adding Text',
    page: text
  },
  shapes: {
    icon: mdiShapeOutline,
    text: 'Adding shapes',
    page: shapes
  },
  save: {
    icon: mdiContentSave,
    text: 'Saving drawings',
    page: save
  },
  color: {
    icon: mdiFormatColorFill,
    text: 'Changing colors',
    page: color
  },
  copy: {
    icon: mdiContentCopy,
    text: 'Copying objects',
    page: copy
  },
  merge: {
    icon: mdiMerge,
    text: 'Merging objects',
    page: merge
  },
  delete: {
    icon: mdiDeleteOutline,
    text: 'Deleting objects',
    page: deletemd
  },
  layer: {
    icon: mdiFlipToFront,
    text: 'Layering objects',
    page: layer
  },
  draw: {
    icon: mdiPencilOutline,
    text: 'Sketching',
    page: draw
  },
  width: {
    icon: mdiMinusThick,
    text: 'Border width',
    page: width
  }
}

export const docsAccordionContent: DocsKey[] = ['started', 'tools', 'action']
