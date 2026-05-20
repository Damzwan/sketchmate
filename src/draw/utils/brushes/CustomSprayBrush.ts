import {
	BaseBrush,
	Canvas,
	FabricImage,
	Path,
	Point,
	Shadow,
	SprayBrushPoint,
} from "fabric";
import * as fabric from "fabric";

export class FastSprayBrush extends BaseBrush {
	/** Width of a spray */
	width = 10;

	/** Density of a spray (number of dots per chunk) */
	density = 20;

	/** Fixed width of spray dots. (Variance removed for max compression) */
	dotWidth = 1;

	private declare sprayDots: SprayBrushPoint[];
	private declare latestChunkStart: number;

	constructor(canvas: Canvas) {
		super(canvas);
		this.sprayDots = [];
		this.latestChunkStart = 0;
	}

	onMouseDown(pointer: Point) {
		this.sprayDots = [];
		this.latestChunkStart = 0;
		this.canvas.clearContext(this.canvas.contextTop);
		this._setShadow();

		this.addSprayChunk(pointer);
		this.renderChunk();
	}

	onMouseMove(pointer: Point) {
		if (this.limitedToCanvasSize === true && this._isOutSideCanvas(pointer)) {
			return;
		}
		this.addSprayChunk(pointer);
		this.renderChunk();
	}

	onMouseUp() {
		const originalRenderOnAddRemove = this.canvas.renderOnAddRemove;
		this.canvas.renderOnAddRemove = false;

		if (this.sprayDots.length > 0) {
			// 1. Diagnose the exact bounding box of the affected area
			let minX = Infinity,
				minY = Infinity,
				maxX = -Infinity,
				maxY = -Infinity;

			for (let i = 0; i < this.sprayDots.length; i++) {
				const dot = this.sprayDots[i];
				if (dot.x < minX) minX = dot.x;
				if (dot.y < minY) minY = dot.y;

				// Use dot.width to calculate max bounds properly if variance is restored
				const width = dot.width || this.dotWidth;
				if (dot.x + width > maxX) maxX = dot.x + width;
				if (dot.y + width > maxY) maxY = dot.y + width;
			}

			// Add a slight padding to safely encapsulate the entire spray
			const padding = this.dotWidth;
			minX -= padding;
			minY -= padding;
			maxX += padding;
			maxY += padding;

			const physicalWidth = maxX - minX;
			const physicalHeight = maxY - minY;

			// 2. Extract the patient's display density (Retina/High-DPI support)
			const dpr = typeof window !== "undefined" ? window.devicePixelRatio : 1;

			// 3. Prepare the sterile offscreen environment at high resolution
			const offscreenCanvas = document.createElement("canvas");
			offscreenCanvas.width = physicalWidth * dpr;
			offscreenCanvas.height = physicalHeight * dpr;
			const ctx = offscreenCanvas.getContext("2d");

			if (ctx) {
				// Scale the surgical context so our coordinates map to the high-res grid automatically
				ctx.scale(dpr, dpr);
				ctx.fillStyle = this.color;

				// 4. Paint the dots onto the mini-canvas
				for (let i = 0; i < this.sprayDots.length; i++) {
					const dot = this.sprayDots[i];
					const width = dot.width || this.dotWidth;

					// Restore the opacity variance if you brought that back for the denser feel
					ctx.globalAlpha = dot.opacity ?? 1;
					ctx.fillRect(dot.x - minX, dot.y - minY, width, width);
				}

				const width = maxX - minX;
				const height = maxY - minY;

				// 5. Transplant the canvas back into Fabric, applying inverse scaling and origin alignment
				const sprayImage = new FabricImage(offscreenCanvas, {
					left: minX + width / 2,
					top: minY + height / 2,
					originX: "center",
					originY: "center",
					scaleX: 1 / dpr, // Shrink visual size back to normal physical bounds
					scaleY: 1 / dpr,
					objectCaching: false,
					interactive: false,
				});

				this.shadow && sprayImage.set("shadow", new Shadow(this.shadow));
				this.canvas.fire("before:path:created", { path: sprayImage });
				this.canvas.add(sprayImage);
				this.canvas.fire("path:created", { path: sprayImage });
			}
		}

		// Clean up and restore canvas vitals
		this.canvas.clearContext(this.canvas.contextTop);
		this._resetShadow();
		this.canvas.renderOnAddRemove = originalRenderOnAddRemove;
		this.canvas.requestRenderAll();

		// Clear out the memory
		this.sprayDots = [];
	}

	renderChunk() {
		const ctx = this.canvas.contextTop;
		ctx.fillStyle = this.color;

		this._saveAndTransform(ctx);

		// Live preview uses basic fillRect for max drawing speed while mouse is down
		for (let i = this.latestChunkStart; i < this.sprayDots.length; i++) {
			const point = this.sprayDots[i];
			ctx.fillRect(point.x, point.y, this.dotWidth, this.dotWidth);
		}

		ctx.restore();
		this.latestChunkStart = this.sprayDots.length;
	}

	_render() {
		const ctx = this.canvas.contextTop;
		ctx.fillStyle = this.color;

		this._saveAndTransform(ctx);

		for (let i = 0; i < this.sprayDots.length; i++) {
			const point = this.sprayDots[i];
			ctx.fillRect(point.x, point.y, this.dotWidth, this.dotWidth);
		}
		ctx.restore();
	}

	addSprayChunk(pointer: Point) {
		const radius = this.width / 2;

		for (let i = 0; i < this.density; i++) {
			this.sprayDots.push({
				x: fabric.util.getRandomInt(pointer.x - radius, pointer.x + radius),
				y: fabric.util.getRandomInt(pointer.y - radius, pointer.y + radius),
				width: this.dotWidth,
				opacity: 1,
			});
		}
	}
}
