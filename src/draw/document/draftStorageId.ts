/** IndexedDB key-path rows in the draft database always use a string id. */
export function isValidDraftStorageId(id: unknown): id is string {
	return typeof id === "string" && id.trim().length > 0;
}

export function assertValidDraftStorageId(id: unknown): asserts id is string {
	if (!isValidDraftStorageId(id)) {
		throw new TypeError("Draft storage write requires a non-empty string id");
	}
}
