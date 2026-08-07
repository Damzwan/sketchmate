import type { Canvas } from "fabric";
import { storeToRefs } from "pinia";
import { useDrawObjectManager } from "@/draw/canvas/drawObjectManager";
import type { HistoryAction, HistoryEvent } from "@/draw/history/history.types";
import type { HistoryContext } from "@/draw/history/historyActions";
import { createYielder } from "@/draw/scheduling/yielder";
import { useDrawStore } from "@/draw/session/draw.store";
import { fullErase } from "@/draw/tools/eraseActions";

export async function redoChangeBackgroundColor(
	ctx: HistoryContext,
	action: HistoryAction<HistoryEvent.BackgroundColorChanged>,
): Promise<HistoryAction<HistoryEvent.BackgroundColorChanged>> {
	const { backgroundColor } = storeToRefs(useDrawStore());

	const { canvas } = ctx;

	// Swap current color with the one in history
	const currentColor = canvas.backgroundColor as string;
	canvas.backgroundColor = action.params.previousColor;
	backgroundColor.value = canvas.backgroundColor;

	canvas.fire("backgroundColorChanged", {
		previousColor: currentColor,
		color: canvas.backgroundColor,
	});

	return { ...action, params: { previousColor: currentColor } };
}

export async function redoFullErase(
	// Dispatched from a uniform (ctx, action) handler table in historyActions.ts.
	_ctx: HistoryContext,
	action: HistoryAction<HistoryEvent.FullErase>,
): Promise<HistoryAction<HistoryEvent.FullErase>> {
	await fullErase();
	return action;
}

export async function undoFullErase(
	ctx: HistoryContext,
	action: HistoryAction<HistoryEvent.FullErase>,
): Promise<HistoryAction<HistoryEvent.FullErase>> {
	const { canvas } = ctx;

	const mgr = useDrawObjectManager();
	const yielder = createYielder({
		budgetMs: 4,
		frameYieldIntervalMs: 12,
		label: "history-full-erase-restore",
	});
	mgr.beginBatch();
	try {
		for (const object of action.params.objects) {
			canvas.add(object);
			await yielder.maybeYield();
		}
	} finally {
		mgr.endBatch();
	}
	const erasedBackgroundColor = canvas.backgroundColor as string;
	canvas.backgroundColor = action.params.previousBackgroundColor;
	const { backgroundColor } = storeToRefs(useDrawStore());
	backgroundColor.value = action.params.previousBackgroundColor;
	canvas.fire("backgroundColorChanged", {
		previousColor: erasedBackgroundColor,
		color: action.params.previousBackgroundColor,
	});

	return action;
}

export async function undoChangeBackgroundColor(
	ctx: HistoryContext,
	action: HistoryAction<HistoryEvent.BackgroundColorChanged>,
): Promise<HistoryAction<HistoryEvent.BackgroundColorChanged>> {
	const { backgroundColor } = storeToRefs(useDrawStore());
	const { canvas } = ctx;

	const currentColor = canvas.backgroundColor as string;
	canvas.backgroundColor = action.params.previousColor;
	backgroundColor.value = canvas.backgroundColor;

	canvas.fire("backgroundColorChanged", {
		previousColor: currentColor,
		color: canvas.backgroundColor,
	});

	return { ...action, params: { previousColor: currentColor } };
}

export function hasContent(c: Canvas) {
	return c.getObjects().length > 0;
}
