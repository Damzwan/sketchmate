import {
  mdiChatQuestionOutline,
  mdiCheck,
  mdiClose,
  mdiDeleteOutline,
  mdiDotsVertical,
  mdiEraser,
  mdiFormatColorFill,
  mdiFormatText,
  mdiMenuSwapOutline,
  mdiPaletteOutline,
  mdiPlus,
  mdiRedo,
  mdiSend,
  mdiUndo
} from '@mdi/js'
import { BrushType, DrawAction, DrawTool, Menu, PenMenuTool, SelectTool } from '@/draw/types/draw.types'
import { ERASERS, penIconMapping, PENMENUTOOLS, selectIconMapping, SELECTMENUTOOLS } from '@/draw/config/tools.config'

export enum Toolbars {
  drawing = 'drawing',
  select = 'select',
  shape = 'shape',
  addText = 'addText',
  colorPicker = 'colorPicker',
}

export enum ToolbarIds {
  pen = 'pen',
  eraser = 'eraser',
  moreTools = 'moreTools',
  select = 'select',
  undo = 'undo',
  redo = 'redo',
  send = 'send',
}

export enum ToolbarCustomUI {
  multiSelectCount = 'multiSelectCount',
  fontSelect = 'fontSelect',
}

export type ToolbarButton = {
  type: 'button';
  icon: string;
  tool?: DrawTool;
  tools?: DrawTool[];
  menu?: Menu;
  action?: DrawAction;
  customAction?: () => void
  id?: string; // Used for the shortcut manager
  isVisibleCondition?: boolean;
  isDisabled?: boolean;
  custom?: ToolbarCustomUI;
  tour_step?: string;
};

export type ToolbarTitle = {
  type: 'title';
  title: string;
};

export type ToolbarItem = ToolbarButton | ToolbarTitle;


export type ToolbarSection = {
  left?: ToolbarItem[]
  right?: ToolbarItem[]
  showDivider: boolean
}

export type ToolbarConfig = {
  [key in Toolbars]: ToolbarSection
}

export function getToolbarConfig(
  lastSelectedPenMenuTool: PenMenuTool,
  lastSelectedSelectTool: SelectTool,
  brushType: BrushType,
  isText: boolean,
  isPolygon: boolean,
  isImg: boolean,
  containsImage: boolean,
  isEditingPolygon: boolean,
  isUndoDisabled: boolean,
  isRedoDisabled: boolean,
  isOffline: boolean,
  hasMate: boolean,
  isLoggedIn: boolean,
  isModal: boolean,
): ToolbarConfig {
  const penMenuIcon =
    lastSelectedPenMenuTool == DrawTool.Pen
      ? penIconMapping[brushType]
      : mdiFormatColorFill

  return {
    [Toolbars.drawing]: {
      showDivider: true,
      left: [
        {
          type: 'button',
          icon: penMenuIcon,
          tool: lastSelectedPenMenuTool,
          menu: Menu.Pen,
          tools: PENMENUTOOLS,
          id: ToolbarIds.pen,
          tour_step: '1'
        },
        {
          type: 'button',
          icon: mdiEraser,
          tool: DrawTool.MobileEraser,
          tools: ERASERS,
          id: ToolbarIds.eraser,
          tour_step: '2'

        },
        {
          type: 'button',
          icon: mdiPlus,
          menu: Menu.MoreTools,
          id: ToolbarIds.moreTools,
          tour_step: '3'
        },
        {
          type: 'button',
          icon: selectIconMapping[lastSelectedSelectTool],
          tool: lastSelectedSelectTool,
          tools: SELECTMENUTOOLS,
          id: ToolbarIds.select,
          tour_step: '4'
        }
      ] as ToolbarItem[],
      right: [
        {
          type: 'button',
          icon: mdiChatQuestionOutline,
          isDisabled: !isLoggedIn,
          menu: Menu.HelpMenu,
          tour_step: '7'
        },
        {
          type: 'button',
          icon: mdiUndo,
          id: ToolbarIds.undo,
          action: DrawAction.Undo,
          isDisabled: isUndoDisabled,
          tour_step: '5'
        },
        {
          type: 'button',
          icon: mdiRedo,
          id: ToolbarIds.redo,
          action: DrawAction.Redo,
          isDisabled: isRedoDisabled
        }, {
          type: 'button',
          icon: mdiSend,
          menu: Menu.Send,
          id: ToolbarIds.send,
          isDisabled: !isLoggedIn || isModal,
          tour_step: '6'
        }
      ] as ToolbarItem[]
    },
    [Toolbars.select]: {
      showDivider: false,
      left: [
        {
          type: 'button',
          icon: mdiClose,
          action: DrawAction.UnselectObjects
        },
        {
          type: 'button',
          icon: mdiClose,
          custom: ToolbarCustomUI.multiSelectCount
        }
      ] as ToolbarItem[],
      right: [
        {
          type: 'button',
          icon: mdiDeleteOutline,
          action: DrawAction.RemoveSelectedObjects
        },
        {
          type: 'button',
          isVisibleCondition: isImg,
          icon: mdiPaletteOutline,
          menu: Menu.SelectImgStyle
        },
        {
          type: 'button',
          isVisibleCondition: !containsImage,
          icon: mdiPaletteOutline,
          menu: Menu.SelectColor
        },
        {
          type: 'button',
          icon: mdiFormatText,
          menu: Menu.Text,
          isVisibleCondition: isText
        },
        {
          type: 'button',
          icon: mdiMenuSwapOutline,
          menu: Menu.Font,
          isVisibleCondition: isText,
          custom: ToolbarCustomUI.fontSelect
        },
        {
          type: 'button',
          icon: mdiUndo,
          id: ToolbarIds.undo,
          action: DrawAction.Undo,
          isDisabled: isUndoDisabled
        },
        {
          type: 'button',
          icon: mdiRedo,
          id: ToolbarIds.redo,
          action: DrawAction.Redo,
          isDisabled: isRedoDisabled
        },
        {
          type: 'button',
          icon: mdiDotsVertical,
          menu: Menu.SelectMoreOptions
        }
      ] as ToolbarItem[]
    },
    [Toolbars.shape]: {
      showDivider: false,
      left: [] as ToolbarItem[],
      right: [
        {
          type: 'button',
          icon: mdiPaletteOutline,
          menu: Menu.SelectColor
        },
        {
          type: 'button',
          icon: mdiUndo,
          id: ToolbarIds.undo,
          action: DrawAction.Undo,
          isDisabled: isUndoDisabled
        },
        {
          type: 'button',
          icon: mdiRedo,
          id: ToolbarIds.redo,
          action: DrawAction.Redo,
          isDisabled: isRedoDisabled
        },
        {
          type: 'button',
          action: DrawAction.ConfirmShapeCreation,
          icon: mdiCheck
        }
      ] as ToolbarItem[]
    },
    [Toolbars.colorPicker]: {
      showDivider: false,
      left: [
        {
          type: 'button',
          icon: mdiClose,
          action: DrawAction.ExitColorPickerMode
        },
        {
          type: 'title',
          title: 'Pick a color'
        }
      ] as ToolbarItem[],
      right: [] as ToolbarItem[]
    },
    [Toolbars.addText]: {
      showDivider: false,
      left: [
        {
          type: 'button',
          icon: mdiClose,
          action: DrawAction.ExitTextAddingMode
        },
        {
          type: 'title',
          title: 'Tap to add text'
        }
      ] as ToolbarItem[],
      right: [] as ToolbarItem[]
    }
  }
}
