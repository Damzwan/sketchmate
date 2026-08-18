import { describe, expect, it } from "vitest";
import {
	buildCalligraphyPathString,
	type RawPoint,
} from "@/draw/utils/brushes/CalligraphyBrush";

/** Straight stroke of `length` px in direction (dx, dy), sampled like a hand. */
function straight(
	dx: number,
	dy: number,
	length: number,
	step = 4,
): RawPoint[] {
	const norm = Math.hypot(dx, dy);
	const points: RawPoint[] = [];
	for (let d = 0; d <= length; d += step) {
		points.push({
			x: (dx / norm) * d,
			y: (dy / norm) * d,
			// ~4px per 8ms: a normal, confident stroke speed.
			time: 1000 + (d / step) * 8,
		});
	}
	return points;
}

function subpaths(d: string): { x: number; y: number }[][] {
	return d
		.split("M")
		.filter((part) => part.trim().length > 0)
		.map((part) =>
			part
				.replace(/Z/g, "")
				.trim()
				.split(/L/)
				.map((pair) => {
					const [x, y] = pair.trim().split(/\s+/).map(Number);
					return { x, y };
				}),
		);
}

/** Extent of the ink measured across the direction of travel. */
function widthAcross(d: string, dx: number, dy: number): number {
	const norm = Math.hypot(dx, dy);
	const px = -dy / norm;
	const py = dx / norm;
	let min = Infinity;
	let max = -Infinity;
	for (const path of subpaths(d)) {
		for (const point of path) {
			const projection = point.x * px + point.y * py;
			min = Math.min(min, projection);
			max = Math.max(max, projection);
		}
	}
	return max - min;
}

describe("calligraphy nib geometry", () => {
	it("opens to full width across the nib and to a hairline along it", () => {
		// The nib sits at -45°, so a stroke down-right travels ACROSS it and one
		// up-right travels ALONG it. That contrast is the entire point of the tool.
		const across = widthAcross(
			buildCalligraphyPathString(straight(1, 1, 120), 0, 40),
			1,
			1,
		);
		const along = widthAcross(
			buildCalligraphyPathString(straight(1, -1, 120), 0, 40),
			1,
			-1,
		);

		expect(across).toBeGreaterThan(34);
		expect(across).toBeLessThanOrEqual(41);
		// A hairline, not nothing: a steel nib always leaves its own thickness.
		expect(along).toBeGreaterThan(1);
		expect(along).toBeLessThan(6);
		// The ratio between the two axes is what reads as calligraphy at all.
		expect(across / along).toBeGreaterThan(7);
	});

	it("emits only convex subpaths, so the fill can never bowtie", () => {
		// A loop turns through the nib axis repeatedly — the exact case where the
		// old single-outline construction crossed itself and filled solid.
		const points: RawPoint[] = [];
		for (let i = 0; i <= 90; i++) {
			const angle = (i / 90) * Math.PI * 2;
			points.push({
				x: 80 + Math.cos(angle) * 60,
				y: 80 + Math.sin(angle) * 60,
				time: 1000 + i * 8,
			});
		}

		const paths = subpaths(buildCalligraphyPathString(points, 0, 36));
		expect(paths.length).toBeGreaterThan(4);
		for (const path of paths) {
			let positive = 0;
			let negative = 0;
			for (let i = 0; i < path.length; i++) {
				const a = path[i];
				const b = path[(i + 1) % path.length];
				const c = path[(i + 2) % path.length];
				const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
				if (cross > 1e-6) positive++;
				if (cross < -1e-6) negative++;
			}
			// Every turn the same way = convex.
			expect(Math.min(positive, negative)).toBe(0);
		}
	});

	it("merges collinear sweeps so a straight run stays cheap", () => {
		const short = subpaths(
			buildCalligraphyPathString(straight(1, 1, 60), 0, 40),
		).length;
		const long = subpaths(
			buildCalligraphyPathString(straight(1, 1, 600), 0, 40),
		).length;

		// Ten times the length must not cost ten times the geometry: a straight
		// run collapses to a handful of hulls however long it is.
		expect(long).toBeLessThan(short * 3);
		expect(long).toBeLessThan(12);
	});

	it("stamps a single nib footprint for a tap", () => {
		const d = buildCalligraphyPathString([{ x: 10, y: 10, time: 1000 }], 0, 40);
		const paths = subpaths(d);
		expect(paths).toHaveLength(1);
		expect(paths[0]).toHaveLength(4);
	});

	it("rebuilds identical geometry from the same trace", () => {
		const points = straight(1, 0.4, 200);
		expect(buildCalligraphyPathString(points, 0, 40)).toBe(
			buildCalligraphyPathString(points, 0, 40),
		);
	});
});
