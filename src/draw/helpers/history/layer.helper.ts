import { HistoryAction, HistoryEvent } from '@/draw/types/drawHistory.types'
import { HistoryContext } from '@/draw/config/drawHistory.config'
import { drawActionMapping } from '@/draw/config/action.config'
import { DrawAction } from '@/draw/types/draw.types'
import { type Canvas } from 'fabric'

// --- Internal Helper ---
function moveObjectsToOriginalPosition(
  ctx: HistoryContext,
  action: HistoryAction<HistoryEvent.MoveObjectToFront | HistoryEvent.MoveObjectToBack>
) {
  const { canvas, getObjectsById } = ctx;
  const prevObjectPositions = action.params.prevObjectPositions;
  const canvasObjects = getObjectsById(action.params.objectIds);

  for (let i = 0; i < canvasObjects.length; i++) {
    const obj = canvasObjects[i];
    if (obj) {
      canvas.moveObjectTo(obj, prevObjectPositions[i]);
    }
  }

  canvas.requestRenderAll();
}

// --- Redo Helpers ---

export async function redoMoveObjectsToFront(
  ctx: HistoryContext,
  action: HistoryAction<HistoryEvent.MoveObjectToFront>
): Promise<HistoryAction<HistoryEvent.MoveObjectToFront>> {
  const objects = ctx.getObjectsById(action.params.objectIds);

  // Capture current indices before moving
  const prevObjectPositions = objects.map((o) => ctx.canvas.getObjects().indexOf(o!));

  drawActionMapping[DrawAction.MoveObjectToFront]({ objects });

  const nextAction = {
    ...action,
    params: { ...action.params, prevObjectPositions }
  };

  return nextAction;
}

export async function redoMoveObjectsToBack(
  ctx: HistoryContext,
  action: HistoryAction<HistoryEvent.MoveObjectToBack>
): Promise<HistoryAction<HistoryEvent.MoveObjectToBack>> {
  const objects = ctx.getObjectsById(action.params.objectIds);
  const prevObjectPositions = objects.map((o) => ctx.canvas.getObjects().indexOf(o!));

  drawActionMapping[DrawAction.MoveObjectToBack]({ objects });

  const nextAction = {
    ...action,
    params: { ...action.params, prevObjectPositions }
  };

  return nextAction;
}

export async function redoMoveObjectsUpOneLayer(
  ctx: HistoryContext,
  action: HistoryAction<HistoryEvent.MoveObjectUpOneLayer>
): Promise<HistoryAction<HistoryEvent.MoveObjectUpOneLayer>> {
  const objects = ctx.getObjectsById(action.params.objectIds);
  drawActionMapping[DrawAction.MoveObjectUpOneLayer]({ objects });

  
  return action;
}

export async function redoMoveObjectsDownOneLayer(
  ctx: HistoryContext,
  action: HistoryAction<HistoryEvent.MoveObjectDownOneLayer>
): Promise<HistoryAction<HistoryEvent.MoveObjectDownOneLayer>> {
  const objects = ctx.getObjectsById(action.params.objectIds);
  drawActionMapping[DrawAction.MoveObjectDownOneLayer]({ objects });

  
  return action;
}

// --- Undo Helpers ---

export async function undoMoveObjectsToFront(
  ctx: HistoryContext,
  action: HistoryAction<HistoryEvent.MoveObjectToFront>
): Promise<HistoryAction<HistoryEvent.MoveObjectToFront>> {
  moveObjectsToOriginalPosition(ctx, action);
  return action;
}

export async function undoMoveObjectsToBack(
  ctx: HistoryContext,
  action: HistoryAction<HistoryEvent.MoveObjectToBack>
): Promise<HistoryAction<HistoryEvent.MoveObjectToBack>> {
  moveObjectsToOriginalPosition(ctx, action);
  return action;
}

export async function undoMoveObjectsUpOneLayer(
  ctx: HistoryContext,
  action: HistoryAction<HistoryEvent.MoveObjectUpOneLayer>
): Promise<HistoryAction<HistoryEvent.MoveObjectUpOneLayer>> {
  const objects = ctx.getObjectsById(action.params.objectIds);
  // Undo "Up" by moving "Down"
  drawActionMapping[DrawAction.MoveObjectDownOneLayer]({ objects });

  return action;
}

export async function undoMoveObjectsDownOneLayer(
  ctx: HistoryContext,
  action: HistoryAction<HistoryEvent.MoveObjectDownOneLayer>
): Promise<HistoryAction<HistoryEvent.MoveObjectDownOneLayer>> {
  const objects = ctx.getObjectsById(action.params.objectIds);
  // Undo "Down" by moving "Up"
  drawActionMapping[DrawAction.MoveObjectUpOneLayer]({ objects });

  return action;
}