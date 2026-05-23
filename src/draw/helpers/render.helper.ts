import { Canvas } from "fabric";

export function rerenderActiveObjectControls(c: Canvas) {
	const ab = c.getActiveObject();
	if (ab) {
		c.clearContext(c.getTopContext());
		ab._renderControls(c.getTopContext());
	}
}
