import { BrushType, DrawAction, DrawTool, Eraser, SelectTool } from '@/types/draw.types'
import { Canvas } from 'fabric/fabric-impl'
import {
  mdiBandage,
  mdiCircleOutline,
  mdiCursorDefaultClickOutline,
  mdiEraser,
  mdiLasso,
  mdiLiquidSpot,
  mdiPencilOutline,
  mdiSpray
} from '@mdi/js'
import { fullErase } from '@/helper/draw/actions/eraser.action'
import {
  bringToBack,
  bringToFront,
  copyObjects,
  deleteObjects,
  mergeObjects,
  moveDownOneLayer,
  moveUpOneLayer
} from '@/helper/draw/actions/operation.action'
import { addSavedToCanvas, createSaved } from '@/helper/draw/actions/saved.action'
import { addSticker, setBackgroundImage } from '@/helper/draw/actions/image.action'
import { addShape } from '@/helper/draw/actions/shape.action'
import {
  addText,
  changeFont,
  changeFontStyle,
  changeFontWeight,
  changeTextAlign,
  curveText
} from '@/helper/draw/actions/text.action'
import {
  changeStrokeWidth,
  setBackgroundColor,
  setCanvasBackground,
  setFillColor,
  setStrokeColor
} from '@/helper/draw/actions/color.action'
import { DynamicTextPart } from '@/types/loader.types'
import { editPolygon } from '@/helper/draw/actions/polyEdit.action'

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

export const BRUSHSIZE = 10
export const BLACK = '#000000'
export const WHITE = '#FFFFFF'
export const BACKGROUND = '#FAF0E6'

export const ERASERS = [DrawTool.MobileEraser, DrawTool.HealingEraser]
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
  [DrawTool.MobileEraser]: mdiEraser,
  [DrawTool.HealingEraser]: mdiBandage
}

export const selectIconMapping: { [key in SelectTool]: string } = {
  [DrawTool.Select]: mdiCursorDefaultClickOutline,
  [DrawTool.Lasso]: mdiLasso
}

export const penIconMapping: { [key in BrushType]: string } = {
  [BrushType.Pencil]: mdiPencilOutline,
  [BrushType.Spray]: mdiSpray,
  [BrushType.Circle]: mdiCircleOutline,
  [BrushType.Ink]: mdiLiquidSpot
}

export const actionMapping: { [key in DrawAction]: (c: Canvas, options?: any) => void } = {
  [DrawAction.FullErase]: fullErase,
  [DrawAction.Sticker]: addSticker,
  [DrawAction.CopyObject]: copyObjects,
  [DrawAction.AddBackgroundImage]: setBackgroundImage,
  [DrawAction.AddShape]: addShape,
  [DrawAction.AddText]: addText,
  [DrawAction.Merge]: mergeObjects,
  [DrawAction.CreateSaved]: createSaved,
  [DrawAction.AddSavedToCanvas]: addSavedToCanvas,
  [DrawAction.Delete]: deleteObjects,
  [DrawAction.ChangeStrokeColour]: setStrokeColor,
  [DrawAction.ChangeFillColour]: setFillColor,
  [DrawAction.ChangeBackgroundColor]: setBackgroundColor,
  [DrawAction.ChangeFont]: changeFont,
  [DrawAction.ChangeFontWeight]: changeFontWeight,
  [DrawAction.ChangeFontStyle]: changeFontStyle,
  [DrawAction.ChangeTextAlign]: changeTextAlign,
  [DrawAction.CurveText]: curveText,
  [DrawAction.BringToFront]: bringToFront,
  [DrawAction.BringToBack]: bringToBack,
  [DrawAction.EditPolygon]: editPolygon,
  [DrawAction.SetCanvasBackground]: setCanvasBackground,
  [DrawAction.ChangeStrokeWidth]: changeStrokeWidth,
  [DrawAction.MoveUpOneLayer]: moveUpOneLayer,
  [DrawAction.MoveDownOneLayer]: moveDownOneLayer
}

export const dynamicStickerLoading: DynamicTextPart[] = [
  { text: 'Uploading...', duration: 1000 },
  { text: 'What a questionable sticker...', duration: 2000 },
  { text: 'Creating...', duration: 2000 }
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
    <p class="text-xl">Lasso</p>
    <p class="text-base">For precise control over selection.</p>
  </div>`
  },
  {
    target: '[data-step="6"]',
    content: `<div>
    <p class="text-xl">Undo/Redo Actions</p>
    <p class="text-base">Made a mistake? Press "Undo". Want it back? Press "Redo".</p>  </div>`
  },
  {
    target: '[data-step="7"]',
    content: `<div>
    <p class="text-xl">Send Sketch</p>
    <p class="text-base">Once ready, press "Send". Your sketch will appear in the gallery.</p>
      </div>`
  },
  {
    target: '[data-step="8"]',
    content: `<div>
    <p class="text-xl">Need Help?</p>
    <p class="text-base">Press for tutorials on each section.</p>
  </div>`
  }
]

export const tutorialSteps2 = [
  {
    target: '[data-step="t1"]',
    content: `<div>
    <p class="text-xl">Select mode</p>
    <div class="px-3">
    <li class="text-base">Drag to move.</li>
    <li class="text-base">Upper handle to rotate.</li>
    <li class="text-base">Lower right handle to resize.</li>
</div>
</p>
  </div>`
  },
  {
    target: '[data-step="t2"]',
    content: `<div>
    <p class="text-xl">Tips</p>
    <div class="px-3">
     <li class="text-base">Double-tap to <b>select object beneath</b> selected object.</li>
     <li class="text-base">Long-press a selected object for <b>multi-select</b> mode (mobile).</li>
</div>
</p>
  </div>`
  },
  {
    target: '[data-step="t3"]',
    content: `<div>
    <p class="text-xl">Delete object</p>
      </div>`
  },
  {
    target: '[data-step="t4"]',
    content: `<div>
    <p class="text-xl">Change border width</p>
      </div>`
  },
  {
    target: '[data-step="t5"]',
    content: `<div>
    <p class="text-xl">Color Options</p>
    <p class="text-base">Select: stroke, fill, or background color.</p>
      </div>`
  },
  {
    target: '[data-step="t6"]',
    content: `<div>
    <p class="text-xl">Undo/Redo Actions</p>
    </div>`
  },
  {
    target: '[data-step="t7"]',
    content: `<div>
    <p class="text-xl">Extended Options</p>
    <p class="text-base">Choose from: copy, merge, save, or layer.</p>
  </div>`
  },
  {
    target: '[data-step="t8"]',
    content: `<div>
    <p class="text-xl">Exit Select Mode</p>
    </div>`
  },
  {
    target: '[data-step="t9"]',
    content: `<div>
    <p class="text-xl">Need Help?</p>
    <p class="text-base">Go to the "Selection" section in the manual.</p>
  </div>`
  }
]
