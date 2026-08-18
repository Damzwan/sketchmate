import {
	ActiveSelection,
	Canvas,
	type CanvasOptions,
	config,
	FabricObject,
	InteractiveFabricObject,
	IText,
	util,
} from "fabric";
import { useDrawEventManager } from "@/draw/canvas/drawEventManager";
import { useDrawObjectManager } from "@/draw/canvas/drawObjectManager";
import { useClaimArea } from "@/draw/claims/claimArea.store";
import { BACKGROUND } from "@/draw/config/canvas.config";
import { getRenderDpr } from "@/draw/config/renderQuality.config";
import { activeLayerId } from "@/draw/layers/layerRegistry";
import { registerBrushClasses } from "@/draw/utils/brushes/registry";
import { useAuthStore } from "@/store/auth.store";
import { uuidv4 } from "@/utils/uuid";

const customProperties = [
	"id",
	"erasable",
	"oldText",
	"isBucketFill",
	"insertedIndex",
	"userId",
	// Layer membership. Registering it here is the whole layer wire format: it
	// rides inside every toJSON, so drafts, the `draw-event` payload, history
	// entries and the worker mirror all carry it with no new message and no
	// server change. Objects from before layers existed simply lack it and fold
	// into the base layer.
	"layerId",
	// Marks an image the APP produced to replace vector content (a flattened
	// layer, a rasterized oversized import) rather than one the user inserted.
	// Must round-trip: the draft/document restore path uses it to keep the raster
	// at full resolution instead of applying the inserted-photo bound
	// (see imageMaxDimensionFor).
	"flattened",
];

let configured = false;

export function applyRenderDpr(): void {
	config.devicePixelRatio = getRenderDpr();
}

export function configureFabric(): void {
	applyRenderDpr();
	if (configured) return;
	configured = true;

	disableObjectCaching();
	registerBrushClasses();
	installObjectMetadata();
	installZoomCalculation();
	installControlRenderer();
	installSelectionBorderPolicy();
	applyInteractionDefaults();
}

export function createCanvasOptions(
	width: number,
	height: number,
): Partial<CanvasOptions> {
	return {
		width,
		height,
		isDrawingMode: true,
		backgroundColor: BACKGROUND,
		fireMiddleClick: true,
		selection: false,
		preserveObjectStacking: true,
		renderOnAddRemove: false,
	};
}

function disableObjectCaching(): void {
	const defaults = (FabricObject as any).ownDefaults;
	if (defaults) {
		defaults.objectCaching = false;
		defaults.erasable = true;
	}
	FabricObject.prototype.objectCaching = false;
	IText.prototype.editable = false;
	FabricObject.customProperties = customProperties;
}

function installObjectMetadata(): void {
	const add = Canvas.prototype.add;
	const insertAt = Canvas.prototype.insertAt;

	Canvas.prototype.add = function (...objects: any[]) {
		for (const object of objects) injectMetadata(object);

		const claimArea = useClaimArea();
		const shouldEnforceClaims =
			(this as any).__isMainDrawCanvas &&
			!useDrawEventManager().isSuspended() &&
			claimArea.foreignAreas.length > 0;

		if (!shouldEnforceClaims) return add.call(this, ...objects);

		const userId = useAuthStore().user?._id;
		const allowed = objects.filter(
			(object) =>
				!(
					object.userId === userId &&
					claimArea.objectIntersectsForeignArea(object)
				),
		);
		if (allowed.length === objects.length) return add.call(this, ...objects);

		claimArea.notifyBlocked();
		try {
			this.clearContext(this.getTopContext());
		} catch {
			// A rejected stroke must not prevent the model update.
		}
		useDrawObjectManager().renderMain();
		return add.call(this, ...allowed);
	};

	Canvas.prototype.insertAt = function (index, ...objects: any[]) {
		for (const object of objects) injectMetadata(object);
		return insertAt.call(this, index, ...objects);
	};
}

function injectMetadata(object: any): void {
	if (!object.id) object.id = uuidv4();
	if (object.editable) object.editable = false;
	if (!object.userId) object.userId = useAuthStore().user?._id;
	// `??=`, never `=`: a remote object, a history restore and a loaded draft all
	// arrive WITH a layerId and must keep it. Only genuinely new local content
	// lands on the layer the user is drawing into.
	if (object.layerId === undefined) object.layerId = activeLayerId();
}

function installZoomCalculation(): void {
	Canvas.prototype.getZoom = function () {
		return util.qrDecompose(this.viewportTransform).scaleX;
	};
}

function installControlRenderer(): void {
	InteractiveFabricObject.prototype._renderControls = function (
		_context,
		styleOverride = {},
	) {
		if (!this.canvas) return;

		const context = this.canvas.getTopContext();
		const style = {
			hasBorders: this.hasBorders,
			hasControls: this.hasControls,
			...styleOverride,
		};
		const matrix = util.multiplyTransformMatrices(
			this.getViewportTransform(),
			this.calcTransformMatrix(),
		);
		const transform = util.qrDecompose(matrix);

		context.save();
		context.translate(transform.translateX, transform.translateY);
		context.lineWidth = this.borderScaleFactor;
		if (this.group === this.parent) {
			context.globalAlpha = this.isMoving ? this.borderOpacityWhenMoving : 1;
		}
		if (this.flipX) transform.angle -= 180;
		context.rotate(
			util.degreesToRadians(this.group ? transform.angle : this.angle),
		);
		if (style.hasBorders) this.drawBorders(context, transform, styleOverride);
		if (style.hasControls) this.drawControls(context, styleOverride);
		context.restore();
	};
}

/**
 * Members above which a multi-selection shows ONLY its own bounding box.
 *
 * Fabric draws a border around EVERY member of an `ActiveSelection` on top of
 * the selection's own box. For two or three objects that is useful — it says
 * exactly what is selected. For thirty it is a thicket of rectangles over the
 * user's artwork, and the one box that actually matters is lost in it.
 *
 * 8 is the point where naming the individual members stops being the useful
 * information and "this region is selected" starts being it.
 */
export const SELECTION_MEMBER_BORDER_LIMIT = 8;

/**
 * Draw one box instead of N for a large selection.
 *
 * Fabric already provides the seam: `ActiveSelection._renderControls` takes a
 * `childrenOverride` it merges into the per-member style. But suppressing the
 * borders that way still walks every member and still pays
 * `calcTransformMatrix` + `qrDecompose` per member — and this runs on EVERY
 * composited frame while a selection exists (see `rerenderActiveObjectControls`,
 * wired into `afterComposite`). On a large selection that is per-frame matrix
 * math for borders nobody is going to see.
 *
 * So the large case skips the member loop entirely and renders just the
 * selection's own box, which is what `super._renderControls` does — here
 * resolved explicitly through `InteractiveFabricObject.prototype`, the same
 * function `super` reaches, and the one `installControlRenderer` replaced.
 * Looked up per call rather than captured, so install order does not matter.
 */
export function installSelectionBorderPolicy(): void {
	const withMembers = ActiveSelection.prototype._renderControls;

	ActiveSelection.prototype._renderControls = function (
		this: any,
		ctx: CanvasRenderingContext2D,
		styleOverride?: any,
		childrenOverride?: any,
	) {
		const members = this._objects?.length ?? 0;
		if (members <= SELECTION_MEMBER_BORDER_LIMIT) {
			return withMembers.call(this, ctx, styleOverride, childrenOverride);
		}
		ctx.save();
		ctx.globalAlpha = this.isMoving ? this.borderOpacityWhenMoving : 1;
		InteractiveFabricObject.prototype._renderControls.call(
			this,
			ctx,
			styleOverride,
		);
		ctx.restore();
	};
}

function applyInteractionDefaults(): void {
	// Secondary, not primary: the handles sit on top of the user's own artwork,
	// where the muted primary was hard to pick out. The brand red reads as UI
	// chrome at a glance and never gets mistaken for part of the drawing.
	const styles = getComputedStyle(document.documentElement);
	const controlColor = styles.getPropertyValue("--ion-color-secondary").trim();
	const controlBorderColor =
		styles.getPropertyValue("--ion-color-secondary-shade").trim() ||
		controlColor;

	Object.assign(InteractiveFabricObject.ownDefaults, {
		transparentCorners: false,
		cornerColor: controlColor,
		cornerStrokeColor: controlBorderColor,
		borderColor: controlColor,
		cornerStyle: "circle",
		cornerSize: 30,
		originX: "center",
		originY: "center",
		lockScalingFlip: true,
		_controlsVisibility: {
			bl: false,
			br: true,
			mb: false,
			ml: false,
			mr: false,
			mt: false,
			mtr: true,
			tl: false,
			tr: false,
		},
	});

	if (IText.ownDefaults.keysMap) {
		delete IText.ownDefaults.keysMap[9];
		delete IText.ownDefaults.keysMap[27];
	}
}
