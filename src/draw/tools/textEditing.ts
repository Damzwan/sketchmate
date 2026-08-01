import { FabricObject } from "fabric";
import { ObjectType } from "@/draw/objects/object.types";
import { storeToRefs } from "pinia";
import { useSelect } from "@/draw/tools/select.store";
import FontFaceObserver from "fontfaceobserver";

import { FONTS } from "@/draw/config/fonts.config";

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
	} catch (err) {
		console.warn("Some fonts timed out, but we can still start drawing.");
	}
}
