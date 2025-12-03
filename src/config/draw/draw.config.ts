import { BrushType, DrawTool, Eraser, SelectTool } from '@/types/draw.types'
import {
  mdiBrush,
  mdiCircleOutline,
  mdiCursorDefaultClickOutline,
  mdiEraser,
  mdiLasso,
  mdiLiquidSpot,
  mdiPencilOutline,
  mdiSpray
} from '@mdi/js'
import { DynamicTextPart } from '@/types/loader.types'
import { isMobile } from '@/helper/general.helper'
import { BaseBrush, type Canvas, CircleBrush, PencilBrush, SprayBrush } from 'fabric'


export const COLORSWATCHES = [
  // Grayscale, Reds, Oranges
  [
    '#000000', // Black
    '#808080', // Gray
    '#C0C0C0', // Silver
    '#FFFFFF', // White
    '#FF0000', // Red
    '#FF4500' // OrangeRed
  ],

  // Yellows, Greens
  [
    '#FFA500', // Orange
    '#FF8C00', // DarkOrange
    '#FFFF00', // Yellow
    '#008000', // Green
    '#006400', // DarkGreen
    '#808000' // Olive
  ],

  // Turquoise, Blues
  [
    '#40E0D0', // Turquoise
    '#00FFFF', // Cyan
    '#00BFFF', // DeepSkyBlue
    '#0000FF', // Blue
    '#8A2BE2', // BlueViolet
    '#800080' // Purple
  ],

  // Pinks, Browns
  [
    '#FFC0CB', // Pink
    '#FF1493', // DeepPink
    '#A52A2A', // Brown
    '#8B4513', // SaddleBrown
    '#800000', // Maroon
    '#835C3B'
  ]
]

export const BASE_BRUSH_SIZE = 10
export const BLACK = '#000000FF'
export const WHITE = '#FFFFFFFF'
export const BACKGROUND = '#FAF0E6'
export const PAN_MARGIN = isMobile() ? 80 : 0


export const ERASERS = [DrawTool.MobileEraser]
export const PENMENUTOOLS = [DrawTool.Pen, DrawTool.Bucket]
export const SELECTMENUTOOLS = [DrawTool.Select, DrawTool.Lasso]
export const FONTS: string[] = [
  'Anton',
  'Indie Flower',
  'Rubik Puddles',
  'Chokokutai',
  'Dancing Script',
  'Amatic SC',
  'Krub'
]
export const eraserIconMapping: { [key in Eraser]: string } = {
  [DrawTool.MobileEraser]: mdiEraser
}

export const selectIconMapping: { [key in SelectTool]: string } = {
  [DrawTool.Select]: mdiCursorDefaultClickOutline,
  [DrawTool.Lasso]: mdiLasso
}

export const penBrushMapping: { [key in BrushType]: (c: Canvas) => BaseBrush } = {
  [BrushType.Circle]: (c: Canvas) => new CircleBrush(c),
  [BrushType.Pencil]: (c: Canvas) => new PencilBrush(c),
  [BrushType.Spray]: (c: Canvas) => new SprayBrush(c)
}

export const penIconMapping: { [key in BrushType]: string } = {
  [BrushType.Pencil]: mdiPencilOutline,
  [BrushType.WaterColor]: mdiBrush,
  [BrushType.Circle]: mdiCircleOutline,
  [BrushType.Ink]: mdiLiquidSpot,
  [BrushType.Spray]: mdiSpray
}


export const dynamicStickerLoading: DynamicTextPart[] = [
  { text: 'Uploading...', duration: 1000 },
  { text: 'What a questionable sticker...', duration: 2000 },
  { text: 'Creating...', duration: 3000 },
  { text: '“To lose patience is to lose the battle“', duration: 3000 },
  { text: '“Patience is bitter, but its fruit is sweet.“', duration: 3000 },
  { text: '“Our patience will achieve more than our force.”', duration: 3000 },
  { text: '“One minute of patience, ten years of peace.”', duration: 3000 }
]

export const tutorialSteps = [
  {
    target: '[data-step="1"]',
    content: `<div>
    <p class="text-xl">Pen</p>
    <p class="text-base">Open the menu to adjust pen style and color.</p>
  </div>`
  },
  {
    target: '[data-step="2"]',
    content: `<div>
    <p class="text-xl">Eraser</p>
    <p class="text-base">Remove strokes, undo erases, or clear canvas.</p>
  </div>`
  },
  {
    target: '[data-step="3"]',
    content: `<div>
    <p class="text-xl">Add Elements</p>
    <p class="text-base">Include stickers, images, text, shapes and saved drawings.</p>
  </div>`
  },
  {
    target: '[data-step="4"]',
    content: `<div>
  <p class="text-xl">Selection</p>
  <p class="text-base">Select to move, rotate, resize and recolor objects. Includes copy, delete, save and merge.</p>
</div>`
  },
  {
    target: '[data-step="5"]',
    content: `<div>
    <p class="text-xl">Undo/Redo Actions</p>
    <p class="text-base">Made a mistake? Press "Undo". Want it back? Press "Redo".</p>  </div>`
  },
  {
    target: '[data-step="6"]',
    content: `<div>
    <p class="text-xl">Send Sketch</p>
    <p class="text-base">Once ready, press "Send". Your sketch will appear in the gallery.</p>
      </div>`
  },
  {
    target: '[data-step="7"]',
    content: `<div>
    <p class="text-xl">Any Questions?</p>
    <p class="text-base">Contact me or go through the manual</p>
  </div>`
  }
]

