export const MAX_SAVED_OBJECTS = 500;
export const MAX_SAVED_DRAWING_JSON_BYTES = 4 * 1024 * 1024;
export const MAX_ROOM_SAVED_DRAWING_JSON_BYTES = 512 * 1024;

export type SavedObjectLimitFailure = "object-count" | "json-bytes";

export function validateSavedObjectCount(
	objectCount: number,
): SavedObjectLimitFailure | null {
	return objectCount > MAX_SAVED_OBJECTS ? "object-count" : null;
}

export function validateSavedDrawingBytes(
	jsonBytes: number,
	options: { inRoom?: boolean } = {},
): SavedObjectLimitFailure | null {
	const limit = options.inRoom
		? MAX_ROOM_SAVED_DRAWING_JSON_BYTES
		: MAX_SAVED_DRAWING_JSON_BYTES;
	return jsonBytes > limit ? "json-bytes" : null;
}

export function savedObjectLimitMessage(
	failure: SavedObjectLimitFailure,
	options: { inRoom?: boolean } = {},
): string {
	if (failure === "object-count") {
		return `Saved objects are limited to ${MAX_SAVED_OBJECTS} items`;
	}
	return options.inRoom
		? "This saved object is too large for live collaboration"
		: "This saved object is too large to use safely";
}
