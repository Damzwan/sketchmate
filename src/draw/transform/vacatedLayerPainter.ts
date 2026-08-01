interface LayerSize {
	width: number;
	height: number;
}

type LayerContext = Pick<
	CanvasRenderingContext2D,
	"clearRect" | "drawImage" | "fillRect" | "fillStyle"
>;

/** Paint in the same order as the committed canvas: background, then objects. */
export function paintVacatedLayer(
	ctx: LayerContext,
	size: LayerSize,
	background: string | undefined,
	bitmap: ImageBitmap,
): void {
	ctx.clearRect(0, 0, size.width, size.height);
	if (background && background !== "transparent") {
		ctx.fillStyle = background;
		ctx.fillRect(0, 0, size.width, size.height);
	}
	ctx.drawImage(bitmap, 0, 0);
}
