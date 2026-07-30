import { useDrawStore } from "@/draw/session/draw.store";
import { DrawTool } from "@/draw/tools/tool.types";
import { BACKGROUND } from "@/draw/config/canvas.config";
import { useToolSelection } from "@/draw/tools/toolSelection.store";
import { useDrawSyncer } from "@/draw/sync/session.store";
import { useAuthStore } from "@/store/auth.store";
import { removeObjects } from "@/draw/objects/objectActions";
import { useDrawObjectManager } from "@/draw/canvas/drawObjectManager";

export function fullErase() {
	const { getCanvas } = useDrawStore();
	const { roomId } = useDrawSyncer();
	if (roomId) {
		const { user } = useAuthStore();
		if (!user) return;
		const objectsToDelete = getCanvas()
			.getObjects()
			.filter((obj) => obj.userId === user._id);
		removeObjects(objectsToDelete);
	} else {
		const { selectTool, selectedTool } = useToolSelection();
		const c = getCanvas();
		if (!c) return;
		const mgr = useDrawObjectManager();

		const prevCanvasJSON = c.toJSON();

		mgr.clearAllObjects();
		c.discardActiveObject();
		(c as any)._objects.length = 0;
		c.backgroundColor = BACKGROUND;

		c.fire("fullErase", { prevCanvasJSON });

		if (selectedTool !== DrawTool.Pen) selectTool(DrawTool.Pen);
	}
}
