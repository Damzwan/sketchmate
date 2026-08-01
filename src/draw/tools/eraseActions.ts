import { useDrawStore } from "@/draw/session/draw.store";
import { DrawTool } from "@/draw/tools/tool.types";
import { BACKGROUND } from "@/draw/config/canvas.config";
import { useToolSelection } from "@/draw/tools/toolSelection.store";
import { useDrawSyncer } from "@/draw/sync/session.store";
import { useAuthStore } from "@/store/auth.store";
import { removeObjects } from "@/draw/objects/objectActions";
import { useDrawObjectManager } from "@/draw/canvas/drawObjectManager";
import type { FabricObject } from "fabric";

export async function fullErase() {
	const { getCanvas } = useDrawStore();
	const { roomId } = useDrawSyncer();
	if (roomId) {
		const { user } = useAuthStore();
		if (!user) return;
		const objectsToDelete = getCanvas()
			.getObjects()
			.filter((obj) => obj.userId === user._id);
		await removeObjects(objectsToDelete);
	} else {
		const { selectTool, selectedTool } = useToolSelection();
		const c = getCanvas();
		if (!c) return;
		const mgr = useDrawObjectManager();

		const objects = ((c as any)._objects as FabricObject[]).slice();
		const previousBackgroundColor = c.backgroundColor as string;

		mgr.clearAllObjects();
		c.discardActiveObject();
		(c as any)._objects.length = 0;
		c.backgroundColor = BACKGROUND;

		// Undo retains the detached Fabric instances themselves. This avoids a
		// whole-scene JSON clone now and an atomic loadFromJSON during undo.
		c.fire("fullErase", { objects, previousBackgroundColor });

		if (selectedTool !== DrawTool.Pen) selectTool(DrawTool.Pen);
	}
}
