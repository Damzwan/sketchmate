import {DrawTool} from '@/types/draw.types';

export const SWATCHES = [
  ['#000000', '#FFA500', '#FFFF00', '#8F00FF', '#964B00', '#ffa6c9'],
  ['#FF0000', '#FFAE42', '#088F8F', '#c71585', '#FF5349', '#9acd32'],
  ['#00FF00', '#8a2be2', '#f75394', '#f0e130', '#2a52be', '#FBCEB1'],
  ['#0000FF', '#ff2400', '#adff2f', '#4B0082', '#808080', '#74bbfb'],
]

export const STROKEWIDTH = 10;
export const ERASERWIDTH = 10;
export const PENCOLOR = '#000000';
export const WHITE = '#FFFFFF'
export const TEXTSIZE = 25;
export const TEXTCOLOR = '#000000';

export const ERASERS = [DrawTool.MobileEraser, DrawTool.StrokeEraser, DrawTool.FullEraser]
