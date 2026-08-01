import { useDrawStore } from "@/draw/session/draw.store";
import * as fabric from "fabric";
import { DrawAction, type DrawActionParams } from "@/draw/actions/drawAction.types";
import { DrawTool } from "@/draw/tools/tool.types";
import { centerObjectInViewport } from "@/draw/canvas/viewport";
import { useToolSelection } from "@/draw/tools/toolSelection.store";
import { downsampleImageToDataURL } from "@/draw/tools/imageDownsampling";

export async function addImageToCanvas(
	params: DrawActionParams[DrawAction.AddImage],
) {
	const { getCanvas } = useDrawStore();
	const c = getCanvas();

	if (!c) return;
	const boundedImageURL = await downsampleImageToDataURL(params.imageUrl);
	const fabricImg = await fabric.Image.fromURL(boundedImageURL, {
		crossOrigin: "anonymous",
	});
	centerObjectInViewport(c, fabricImg);

	c.add(fabricImg);
	const { selectTool, selectedTool } = useToolSelection();
	if (selectedTool !== DrawTool.Select) {
		selectTool(DrawTool.Select);
	}

	c.setActiveObject(fabricImg);
}

export function addFilterToImg(
	params: DrawActionParams[DrawAction.AddImgFilter],
) {
	const { getCanvas } = useDrawStore();
	const c = getCanvas();

	const img = params.image;
	const filter = params.filter;

	if (params.remove) {
		const filterIndexToFind = img.filters!.findIndex(
			(f: any) => f.type == filter.type,
		);
		if (filterIndexToFind == -1) return;
		const f = (img.filters as any)?.at(filterIndexToFind);
		c.fire("imgFilterChanged", { target: img, prevFilter: f, filter: null });

		img.filters?.splice(filterIndexToFind, 1);
	} else {
		c.fire("imgFilterChanged", {
			target: img,
			prevFilter: null,
			filter: filter,
			prevBlendColorFilter: img.filters.find((f) => f.type == "BlendColor"),
		});
		if (filter.type == "BlendColor")
			img.filters = img.filters?.filter((f: any) => f.type != "BlendColor");
		img.filters?.push(filter);
	}

	img.applyFilters();
}
