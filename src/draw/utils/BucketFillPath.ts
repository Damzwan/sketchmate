import { Path } from "fabric";
import {
	enlivenStrokeProps,
	toObjectWithoutPath,
} from "@/draw/utils/brushes/brush.helpers";

export class BucketFillPath extends Path {
	static override type = "BucketFillPath";
	static override cacheProperties = [...Path.cacheProperties, "isBucketFill"];

	// @ts-expect-error
	toObject(additionalProperties: string[] = []) {
		// 1. Get the standard base object. Path.toObject deep-copies every segment
		// and it is discarded at step 3 — fromObject rebuilds from
		// `compressedTrace`. See toObjectWithoutPath.
		const baseObj = toObjectWithoutPath(this, (p) => super.toObject(p as any), [
			"isBucketFill",
			...additionalProperties,
		]);

		// 2. DEFLATION: Compress the parsed path array Fabric generated
		const compressedTrace: (number | string)[] = [];
		let lastX = 0,
			lastY = 0;

		// Fabric parses the SVG string into an array: [['M', x, y], ['L', x, y], ['Z']]
		for (const cmd of this.path) {
			const type = cmd[0];

			if (type === "Z") {
				compressedTrace.push("Z");
			} else if (type === "M" || type === "L") {
				const ix = Math.round((cmd[1] as number) * 10);
				const iy = Math.round((cmd[2] as number) * 10);

				if (type === "M") {
					compressedTrace.push("M", ix, iy);
					lastX = ix;
					lastY = iy;
				} else {
					// Delta encode the LineTo commands
					compressedTrace.push(ix - lastX, iy - lastY);
					lastX = ix;
					lastY = iy;
				}
			}
		}

		// 3. Attach the lightweight trace (the heavy array was never built)
		return {
			...baseObj,
			compressedTrace,
		};
	}

	static override async fromObject(object: any) {
		// INFLATION: Convert the compressed trace back into an SVG string
		if (object.compressedTrace && !object.path) {
			let svg = "";
			let lastX = 0,
				lastY = 0;

			for (let i = 0; i < object.compressedTrace.length; i++) {
				const val = object.compressedTrace[i];

				if (val === "Z") {
					svg += "Z ";
				} else if (val === "M") {
					const ix = object.compressedTrace[i + 1] as number;
					const iy = object.compressedTrace[i + 2] as number;
					svg += `M ${ix / 10} ${iy / 10} `;
					lastX = ix;
					lastY = iy;
					i += 2; // Skip the coordinates we just read
				} else {
					// It's a delta LineTo
					const ix = (val as number) + lastX;
					const iy = (object.compressedTrace[i + 1] as number) + lastY;
					svg += `L ${ix / 10} ${iy / 10} `;
					lastX = ix;
					lastY = iy;
					i += 1; // Skip the Y delta
				}
			}
			object.path = svg;
		}

		const enlivenedProps = await enlivenStrokeProps(object);
		return new BucketFillPath(object.path, enlivenedProps);
	}
}
