import { Canvas, FabricObject } from "fabric";
import { CustomFloodFill } from "@/draw/utils/CustomFloodFill";
import { usePen } from "@/draw/store/tools/pen.store";
import { hex2RGBA } from "@/draw/utils/color.utils";
// @ts-ignore
import { contours } from "d3-contour";
import { BucketFillPath } from "@/draw/utils/BucketFillPath";
import { useDrawObjectManager } from "@/draw/store/drawObjectManager.store";
import { Rect } from "@/draw/utils/QuadTree";
import { useToast } from "@/service/toast.service";

type Point = { x: number; y: number };

// Fixed spatial constants ensuring deterministic performance & fidelity
const PIXELS_PER_WORLD_UNIT = 1.25; // Locked base resolution ratio (1.0 - 1.5 is ideal)
const MAX_WORLD_DIM = 2500; // Fixed-size virtual workspace centered around click
const RDP_TOLERANCE = 1.2; // Vector simplification tuning variable
const MAX_WORLD_AREA = 2500000; // Maximum vector area threshold before safety guard triggers
const MAX_OFFSCREEN_PIXELS = 1200;

function simplifyPathIterative(
	points: number[][],
	tolerance: number,
): number[][] {
	if (points.length <= 2) return points;
	const sqTol = tolerance * tolerance;
	const stack: [number, number][] = [[0, points.length - 1]];
	const keep = new Uint8Array(points.length);
	keep[0] = 1;
	keep[points.length - 1] = 1;

	while (stack.length > 0) {
		const [first, last] = stack.pop()!;
		let maxSqDist = 0;
		let index = -1;

		const [x1, y1] = points[first];
		const [x2, y2] = points[last];
		const dx = x2 - x1;
		const dy = y2 - y1;
		const lenSq = dx * dx + dy * dy;

		for (let i = first + 1; i < last; i++) {
			const [px, py] = points[i];
			let sqDist: number;
			if (lenSq === 0) {
				const ex = px - x1,
					ey = py - y1;
				sqDist = ex * ex + ey * ey;
			} else {
				const t = Math.max(
					0,
					Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq),
				);
				const ex = px - (x1 + t * dx);
				const ey = py - (y1 + t * dy);
				sqDist = ex * ex + ey * ey;
			}
			if (sqDist > maxSqDist) {
				maxSqDist = sqDist;
				index = i;
			}
		}

		if (maxSqDist > sqTol && index !== -1) {
			keep[index] = 1;
			if (index - first > 1) stack.push([first, index]);
			if (last - index > 1) stack.push([index, last]);
		}
	}

	const result: number[][] = [];
	for (let i = 0; i < points.length; i++) {
		if (keep[i]) result.push(points[i]);
	}
	return result;
}

/**
 * Builds a smart virtual canvas anchored precisely on the user's click coordinate.
 * It functions perfectly even if the target objects are mostly off-screen.
 */
function buildSmartOffscreenCanvas(c: Canvas, clickPoint: Point) {
	const { query, getZIndexMap } = useDrawObjectManager();

	const expandLeft = clickPoint.x - MAX_WORLD_DIM / 2;
	const expandTop = clickPoint.y - MAX_WORLD_DIM / 2;

	// DYNAMIC RESOLUTION DEFENSE
	// Start with ideal resolution, but crush it down if it exceeds our safe pixel budget
	let currentPxScale = PIXELS_PER_WORLD_UNIT;
	let targetOffW = Math.floor(MAX_WORLD_DIM * currentPxScale);

	if (targetOffW > MAX_OFFSCREEN_PIXELS) {
		currentPxScale = MAX_OFFSCREEN_PIXELS / MAX_WORLD_DIM;
		targetOffW = MAX_OFFSCREEN_PIXELS;
	}

	const offW = targetOffW;
	const offH = targetOffW; // Square aspect ratio

	const offscreen = document.createElement("canvas");
	offscreen.width = offW;
	offscreen.height = offH;
	const ctx = offscreen.getContext("2d", { alpha: false })!;

	ctx.fillStyle = (c.backgroundColor as string) || "#ffffff";
	ctx.fillRect(0, 0, offW, offH);

	// Apply the safe, dynamically calculated scale
	ctx.setTransform(
		currentPxScale,
		0,
		0,
		currentPxScale,
		-expandLeft * currentPxScale,
		-expandTop * currentPxScale,
	);

	const renderRect: Rect = {
		x: expandLeft,
		y: expandTop,
		w: MAX_WORLD_DIM,
		h: MAX_WORLD_DIM,
	};

	const objectsToRender = query(renderRect);
	const zIndexMap = getZIndexMap();

	objectsToRender.sort(
		(a, b) => (zIndexMap.get(a) ?? 0) - (zIndexMap.get(b) ?? 0),
	);

	for (const obj of objectsToRender) {
		obj.render(ctx);
	}

	return {
		offscreen,
		worldRect: renderRect,
		pxScale: currentPxScale, // Pass this down so mapping still aligns perfectly
	};
}

export async function bucketFill(
	c: Canvas,
	p: Point,
): Promise<BucketFillPath | null> {
	const { brushColorWithOpacity } = usePen();

	// Fix precision floating issues in Fabric generation
	// @ts-ignore
	FabricObject.NUM_FRACTION_DIGITS = 1;

	// Generate localized virtual environment
	const { offscreen, worldRect, pxScale } = buildSmartOffscreenCanvas(c, p);

	// Map absolute click onto localized pixels
	const fillX = Math.round((p.x - worldRect.x) * pxScale);
	const fillY = Math.round((p.y - worldRect.y) * pxScale);

	if (
		fillX < 0 ||
		fillY < 0 ||
		fillX >= offscreen.width ||
		fillY >= offscreen.height
	) {
		return null;
	}

	const offCtx = offscreen.getContext("2d")!;
	const imgData = offCtx.getImageData(0, 0, offscreen.width, offscreen.height);
	const brushColor = brushColorWithOpacity();

	const floodFill = new CustomFloodFill(imgData);
	floodFill.fill(brushColor, fillX, fillY, 10);

	if (floodFill.modifiedPixelsCount === 0) return null;

	const modifiedArea = floodFill.getModifiedArea();
	const worldArea =
		(modifiedArea.width / pxScale) * (modifiedArea.height / pxScale);

	if (worldArea > MAX_WORLD_AREA) {
		const { toast } = useToast();
		toast("Area too large. Please close the shape to fill.", {
			color: "warning",
		});
		return null;
	}

	const modifiedImgData = floodFill.getModifiedImageData(hex2RGBA(brushColor));
	const { width, height, data } = modifiedImgData;

	// Give threading breathing room to keep animations fluid
	await new Promise<void>((r) => setTimeout(r, 0));

	const values = new Float32Array(width * height);
	for (let i = 0, j = 0; i < data.length; i += 4, j++) {
		values[j] = data[i + 3] > 0 ? 1 : 0;
	}

	const contourGenerator = contours().size([width, height]).thresholds([0.5]);
	const contourData = contourGenerator(values);

	if (!contourData.length || !contourData[0].coordinates.length) return null;

	const toWorldX = (offPx: number) => offPx / pxScale + worldRect.x;
	const toWorldY = (offPx: number) => offPx / pxScale + worldRect.y;

	const pathParts: string[] = [];

	for (const polygon of contourData[0].coordinates) {
		for (const ring of polygon) {
			const pts = ring as [number, number][];
			if (pts.length < 2) continue;

			const worldPoints = pts.map(([px, py]) => [toWorldX(px), toWorldY(py)]);
			const simplified = simplifyPathIterative(worldPoints, RDP_TOLERANCE);
			if (simplified.length < 2) continue;

			const cmds = new Array(simplified.length);
			cmds[0] = `M ${((simplified[0][0] * 10) | 0) / 10} ${((simplified[0][1] * 10) | 0) / 10}`;
			for (let i = 1; i < simplified.length; i++) {
				cmds[i] =
					`L ${((simplified[i][0] * 10) | 0) / 10} ${((simplified[i][1] * 10) | 0) / 10}`;
			}
			pathParts.push(cmds.join(" ") + " Z");
		}
	}

	const svgPath = pathParts.join(" ");
	if (!svgPath) return null;

	const centerX = toWorldX(modifiedArea.minX + modifiedArea.width / 2);
	const centerY = toWorldY(modifiedArea.minY + modifiedArea.height / 2);

	// Set the "bleed" constant purely in world units (e.g., 1.5 units wide).
	// This keeps anti-aliased edge coverage perfectly identical regardless of zoom level.
	const worldUnitBleedExpansion = 1.5;

	return new BucketFillPath(svgPath, {
		fill: brushColor,
		stroke: brushColor,
		strokeWidth: worldUnitBleedExpansion,
		strokeLineJoin: "round",
		strokeLineCap: "round",
		isBucketFill: true,
		left: centerX,
		top: centerY,
		fillRule: "evenodd",
		paintFirst: "stroke",
	});
}
