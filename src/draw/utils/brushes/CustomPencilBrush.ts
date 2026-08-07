import type { TSimplePathData } from "fabric";
import { PencilBrush, Shadow } from "fabric";
import { isLayerHidden } from "@/draw/layers/layerRegistry";
import {
	enlivenStrokeProps,
	simplifyPathDouglasPeucker,
	toObjectWithoutPath,
} from "@/draw/utils/brushes/brush.helpers";
import {
	strokeDecimateDistance,
	strokeSimplifyTolerance,
} from "@/draw/utils/brushes/strokeSimplification";
import { TracedPath } from "@/draw/utils/brushes/TracedPath";

// ==========================================
// THE OPTIMIZED BRUSH
// ==========================================

export class OptimizedPencilBrush extends PencilBrush {
	decimate = 0.3;

	/**
	 * Capture-time decimation is read by fabric in `_finalizeAndAddPath`, but the
	 * points it governs are collected from the first move event onward — so it has
	 * to be set when the stroke STARTS, not when it ends. Width and zoom are both
	 * fixed for the duration of one stroke (a gesture cancels drawing), so one
	 * read here is correct for the whole path.
	 */
	onMouseDown(pointer: any, ev: any) {
		this.decimate = strokeDecimateDistance(this.width, this.canvas.getZoom());
		return super.onMouseDown(pointer, ev);
	}

	// @ts-expect-error
	createPath(pathData: TSimplePathData) {
		// 1. SURGICAL EXTRACTION: Run DP on the raw data to permanently remove bloat.
		//
		// Tolerance scales with the stroke's own width and with input resolution
		// rather than being a fixed 0.3 world units — see strokeSimplification.ts.
		// A wide fill stroke keeps a small fraction of the points it used to; a thin
		// stroke zoomed in keeps MORE than it used to, which is the half of this
		// that improves quality rather than cost.
		const tolerance = strokeSimplifyTolerance(
			this.width,
			this.canvas.getZoom(),
		);
		const optimizedData = simplifyPathDouglasPeucker(pathData, tolerance);

		const path = new OptimizedPencilStroke(optimizedData, {
			fill: null,
			stroke: this.color,
			strokeWidth: this.width,
			strokeLineCap: this.strokeLineCap,
			strokeMiterLimit: this.strokeMiterLimit,
			strokeLineJoin: this.strokeLineJoin,
			strokeDashArray: this.strokeDashArray,
		});

		if (this.shadow) {
			this.shadow.affectStroke = true;
			path.shadow = new Shadow(this.shadow);
		}

		return path;
	}

	_finalizeAndAddPath() {
		// 1. Get the TOP context (temporary drawing layer) just to close and clear it
		const topCtx = this.canvas.contextTop;
		topCtx.closePath();

		const pathData = this.convertPointsToSVGPath(this._points);
		const path = this.createPath(pathData);

		// Clear the temporary drawing buffer
		this.canvas.clearContext(topCtx);
		this.canvas.fire("before:path:created", { path: path });

		this.canvas.add(path);
		path.setCoords();

		// Hidden-layer strokes are stored normally but stay off every render
		// surface until the layer is shown.
		if (!isLayerHidden((path as any).layerId)) {
			// 3. THE FIX: Grab the MAIN lower canvas context
			const mainCtx = this.canvas.getContext();

			// 4. THE FIX: Apply the viewport transform so it renders correctly when zoomed/panned
			mainCtx.save();
			const vpt = this.canvas.viewportTransform;
			if (vpt) {
				mainCtx.transform(vpt[0], vpt[1], vpt[2], vpt[3], vpt[4], vpt[5]);
			}

			// 5. Render directly to the main canvas
			path.render(mainCtx);

			// Clean up the context state
			mainCtx.restore();
		}
		this._resetShadow();

		// Fire the final event
		this.canvas.fire("path:created", { path: path });
	}
}

// ==========================================
// THE OPTIMIZED STROKE
// ==========================================

export class OptimizedPencilStroke extends TracedPath {
	static type = "OptimizedPencilStroke";

	constructor(path: any, options: any) {
		let inflatedPath = path;
		if (options?.compressedTrace && (!path || path.length === 0)) {
			inflatedPath = OptimizedPencilStroke.inflateTrace(
				options.compressedTrace,
			);
		}

		// The packed geometry can reproduce compressedTrace on demand. Do not keep
		// the loaded JSON number[] as a second permanent copy beside it.
		const { compressedTrace: _compressedTrace, ...pathOptions } = options || {};
		super(inflatedPath, pathOptions);
	}

	// Note: The custom _render method has been amputated.
	// Fabric will handle the drawing natively and efficiently.

	static inflateTrace(trace: (number | string)[]): any[] {
		const inflated: any[] = [];
		let lastX = 0,
			lastY = 0;

		for (let i = 0; i < trace.length; ) {
			const cmd = trace[i];
			if (cmd === "M" || cmd === "L") {
				let ix = trace[i + 1] as number;
				let iy = trace[i + 2] as number;
				if (cmd === "L") {
					ix += lastX;
					iy += lastY;
				}
				inflated.push([cmd, ix / 10, iy / 10]);
				lastX = ix;
				lastY = iy;
				i += 3;
			} else if (cmd === "Q") {
				const icpx = (trace[i + 1] as number) + lastX;
				const icpy = (trace[i + 2] as number) + lastY;
				const ix = (trace[i + 3] as number) + lastX;
				const iy = (trace[i + 4] as number) + lastY;
				inflated.push(["Q", icpx / 10, icpy / 10, ix / 10, iy / 10]);
				lastX = ix;
				lastY = iy;
				i += 5;
			} else {
				i++;
			}
		}
		return inflated;
	}

	// @ts-expect-error
	toObject(additionalProperties: string[] = []) {
		// Path.toObject deep-copies every segment and we discard it below —
		// fromObject rebuilds from `compressedTrace`. See toObjectWithoutPath.
		const baseObj = toObjectWithoutPath(this, (p) => super.toObject(p as any), [
			...additionalProperties,
		]);
		const compressedTrace: (number | string)[] = [];
		let lastX = 0,
			lastY = 0;

		// Encode directly from resident typed geometry. Reading `this.path` here
		// would materialize the array-of-arrays representation we are avoiding.
		this._forEachPathCommand((type, coordinates, offset) => {
			if (type === "M" || type === "L") {
				const ix = Math.round((coordinates[offset] as number) * 10);
				const iy = Math.round((coordinates[offset + 1] as number) * 10);
				if (type === "M") {
					compressedTrace.push("M", ix, iy);
				} else {
					compressedTrace.push("L", ix - lastX, iy - lastY);
				}
				lastX = ix;
				lastY = iy;
			} else if (type === "Q") {
				const icpx = Math.round((coordinates[offset] as number) * 10);
				const icpy = Math.round((coordinates[offset + 1] as number) * 10);
				const ix = Math.round((coordinates[offset + 2] as number) * 10);
				const iy = Math.round((coordinates[offset + 3] as number) * 10);
				compressedTrace.push(
					"Q",
					icpx - lastX,
					icpy - lastY,
					ix - lastX,
					iy - lastY,
				);
				lastX = ix;
				lastY = iy;
			}
		});

		return { ...baseObj, compressedTrace };
	}

	static async fromObject(object: any) {
		const enlivenedProps = await enlivenStrokeProps(object);
		return new OptimizedPencilStroke(enlivenedProps.path, enlivenedProps);
	}
}
