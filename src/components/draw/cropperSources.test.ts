import { describe, expect, it } from "vitest";
import profilePictureSelector from "@/components/account/ProfilePictureSelector.vue?raw";
import imageCropper from "./ImageCropper.vue?raw";
import previewDrawing from "./PreviewDrawing.vue?raw";

const sources = [
	["drawing background", imageCropper, 'ref="imgRef"'],
	["profile picture", profilePictureSelector, 'ref="imgRef"'],
	["drawing preview", previewDrawing, 'ref="imageRef"'],
] as const;

describe("Cropper source images", () => {
	it.each(
		sources,
	)("keeps the %s source free of synthetic image dimensions", (_name, source, refAttribute) => {
		const tag = [...source.matchAll(/<img[\s\S]*?>/g)]
			.map((match) => match[0])
			.find((candidate) => candidate.includes(refAttribute));

		expect(tag).toBeDefined();
		expect(tag).not.toMatch(/\b(?:width|height|loading|decoding)\s*=/);
	});
});
