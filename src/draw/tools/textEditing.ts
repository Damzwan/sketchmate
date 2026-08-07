import type { FabricObject } from "fabric";
import FontFaceObserver from "fontfaceobserver";
import { storeToRefs } from "pinia";
import { FONTS } from "@/draw/config/fonts.config";
import { ObjectType } from "@/draw/objects/object.types";
import { useSelect } from "@/draw/tools/select.store";

export function isText(objects: FabricObject[]) {
	return objects.length == 1 && objects[0].type == ObjectType.text;
}

export function exitEditing(text: any) {
	if (text.type != ObjectType.text || !text.isEditing || text.text == "")
		return;
	text.exitEditing();
	const { isEditingText } = storeToRefs(useSelect());
	isEditingText.value = false;
}

export async function loadFonts() {
	const observers = FONTS.map((font) => new FontFaceObserver(font).load());

	try {
		await Promise.all(observers);
		console.log("Fonts loaded");
	} catch (_err) {
		console.warn("Some fonts timed out, but we can still start drawing.");
	}
}
