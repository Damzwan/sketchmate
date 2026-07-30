import { DrawTool, type ToolService } from "@/draw/tools/tool.types";
import { usePen } from "@/draw/tools/pen.store";
import { useEraser } from "@/draw/tools/eraser.store";
import { useSelect } from "@/draw/tools/select.store";
import { useBucket } from "@/draw/tools/bucket.store";
import { createLassoTool } from "@/draw/tools/lassoTool";

export function createToolsMapping(): { [key in DrawTool]: ToolService } {
	return {
		[DrawTool.Pen]: usePen(),
		[DrawTool.MobileEraser]: useEraser(),
		[DrawTool.Select]: useSelect(),
		[DrawTool.Lasso]: createLassoTool(),
		[DrawTool.Bucket]: useBucket(),
	};
}
