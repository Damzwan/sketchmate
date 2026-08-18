import { useBucket } from "@/draw/tools/bucket.store";
import { useEraser } from "@/draw/tools/eraser.store";
import { createLassoTool } from "@/draw/tools/lassoTool";
import { usePen } from "@/draw/tools/pen.store";
import { useSelect } from "@/draw/tools/select.store";
import { useSmudge } from "@/draw/tools/smudge.store";
import { DrawTool, type ToolService } from "@/draw/tools/tool.types";

export function createToolsMapping(): { [key in DrawTool]: ToolService } {
	return {
		[DrawTool.Pen]: usePen(),
		[DrawTool.MobileEraser]: useEraser(),
		[DrawTool.Select]: useSelect(),
		[DrawTool.Lasso]: createLassoTool(),
		[DrawTool.Bucket]: useBucket(),
		[DrawTool.Smudge]: useSmudge(),
	};
}
