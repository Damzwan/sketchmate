/**
 * Properties every serialized stroke carries at a value it almost never
 * differs from.
 *
 * Fabric's `toObject` is exhaustive: `strokeDashArray: null`, `skewX: 0`,
 * `strokeMiterLimit: 4`, `version`, and eighteen more, on every object. Measured
 * at ~371 bytes per stroke — on a 3,100-object drawing that is ~1.1 MB of pure
 * defaults, paid in the draft, in every `draw-event`, in every history entry and
 * in the worker mirror.
 *
 * Stripping them is safe only because it is SYMMETRIC: `toObjectWithoutPath`
 * removes them and `enlivenStrokeProps` puts them back, and both live in
 * `brush.helpers` so every stroke class gets both halves or neither.
 *
 * DELIBERATELY ABSENT: `originX` / `originY`. Fabric ships "left"/"top" and this
 * app overrides them to "center" via `InteractiveFabricObject.ownDefaults`. A
 * stripped origin therefore depends on that override still being in place when
 * the drawing is read back — and if it ever isn't, every stroke silently jumps
 * by half its size. The ~34 bytes are not worth a failure mode that corrupts
 * geometry rather than announcing itself.
 */
export const STROKE_DEFAULTS: Readonly<Record<string, unknown>> = Object.freeze(
	{
		strokeDashArray: null,
		strokeDashOffset: 0,
		strokeUniform: false,
		strokeMiterLimit: 4,
		scaleX: 1,
		scaleY: 1,
		angle: 0,
		flipX: false,
		flipY: false,
		shadow: null,
		visible: true,
		backgroundColor: "",
		fillRule: "nonzero",
		paintFirst: "fill",
		skewX: 0,
		skewY: 0,
		globalCompositeOperation: "source-over",
		erasable: true,
	},
);

const DEFAULT_KEYS = Object.keys(STROKE_DEFAULTS);

/**
 * Only primitives and `null` are compared by value. `strokeDashArray` is the
 * one nullable here; an actual dash array is an object and simply never
 * matches, which is the correct outcome.
 */
function isDefault(key: string, value: unknown): boolean {
	const fallback = STROKE_DEFAULTS[key];
	if (fallback === null) return value === null;
	return value === fallback;
}

/** Remove every property still sitting at its default. Mutates `json`. */
export function stripStrokeDefaults<T extends Record<string, any>>(json: T): T {
	for (let i = 0; i < DEFAULT_KEYS.length; i++) {
		const key = DEFAULT_KEYS[i];
		if (key in json && isDefault(key, json[key])) delete json[key];
	}
	return json;
}

/**
 * Put back anything the strip removed, so the object reaching Fabric's
 * constructor is indistinguishable from an unstripped one.
 *
 * Fabric would apply most of these from `ownDefaults` anyway, but relying on
 * that makes the format silently dependent on a global whose value has already
 * changed once in this codebase. Being explicit costs one loop per enliven.
 */
export function restoreStrokeDefaults<T extends Record<string, any>>(
	json: T,
): T {
	for (let i = 0; i < DEFAULT_KEYS.length; i++) {
		const key = DEFAULT_KEYS[i];
		if (!(key in json)) (json as any)[key] = STROKE_DEFAULTS[key];
	}
	return json;
}
