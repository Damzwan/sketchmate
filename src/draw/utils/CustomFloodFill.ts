import {
	ColorRGBA,
	getColorAtPixel,
	isSameColor,
	setColorAtPixel,
} from "q-floodfill";

import { hex2RGBA } from "@/draw/utils/color.utils";

type PixelCoords = {
	x: number;
	y: number;
};

type LineQueued = [number, number];

export class CustomFloodFill {
	public imageData: ImageData;
	public isSameColor: typeof isSameColor;
	public setColorAtPixel: typeof setColorAtPixel;
	public getColorAtPixel: typeof getColorAtPixel;
	public colorToRGBA: typeof hex2RGBA;
	public collectModifiedPixels = false;
	public modifiedPixelsCount = 0;
	public modifiedPixels: Set<string> = new Set();

	public modifiedMinX = Number.POSITIVE_INFINITY;
	public modifiedMinY = Number.POSITIVE_INFINITY;
	public modifiedMaxX = Number.NEGATIVE_INFINITY;
	public modifiedMaxY = Number.NEGATIVE_INFINITY;

	// Per-pixel fill mask: 1 where the flood fill wrote, 0 elsewhere.
	// Length = imageData.width * imageData.height. Same layout as imageData
	// but one byte per pixel instead of four.
	private filledMask: Uint8Array;

	private _tolerance = 0;
	private queue: Array<LineQueued> = [];
	private _replacedColor: ColorRGBA;
	private _newColor: ColorRGBA;
	private baseColor = hex2RGBA("#000000");

	constructor(imageData: ImageData) {
		this.imageData = imageData;
		this._replacedColor = this.baseColor;
		this._newColor = this.baseColor;
		this.isSameColor = isSameColor;
		this.setColorAtPixel = setColorAtPixel;
		this.getColorAtPixel = getColorAtPixel;
		this.colorToRGBA = hex2RGBA;
		this.filledMask = new Uint8Array(imageData.width * imageData.height);
	}

	public fill(color: string, x: number, y: number, tolerance: number): void {
		this._newColor = hex2RGBA(color);
		this._replacedColor = this.getColorAtPixel(this.imageData, x, y);
		this._tolerance = tolerance;
		this.resetModifiedArea();
		// Reset the mask in case fill() is called more than once on the same instance.
		this.filledMask.fill(0);

		if (
			this.isSameColor(this._replacedColor, this._newColor, this._tolerance)
		) {
			return;
		}

		const visited = Array.from({ length: this.imageData.height }, () =>
			new Array(this.imageData.width).fill(false),
		);

		this.queue.push([x, y]);
		visited[y][x] = true;

		while (this.queue.length) {
			const [curX, curY] = this.queue.pop()!;
			this.setPixelColor(this._newColor, curX, curY);

			const neighbors = this.getNeighboursWithinRadius(curX, curY, 2);
			for (const { x: nX, y: nY } of neighbors) {
				if (!visited[nY][nX]) {
					if (this.isValidTarget(nX, nY)) {
						this.queue.push([nX, nY]);
						visited[nY][nX] = true;
					} else {
						this.setPixelColor(this._newColor, nX, nY);
					}
				}
			}
		}
	}

	private getNeighboursWithinRadius(
		x: number,
		y: number,
		radius: number,
	): PixelCoords[] {
		const neighbours = [];
		for (let i = -radius; i <= radius; i++) {
			for (let j = -radius; j <= radius; j++) {
				if (i === 0 && j === 0) continue;
				if (this.isInRange(x + i, y + j)) {
					neighbours.push({ x: x + i, y: y + j });
				}
			}
		}
		return neighbours;
	}

	private isInRange(x: number, y: number): boolean {
		return (
			x >= 0 && x < this.imageData.width && y >= 0 && y < this.imageData.height
		);
	}

	private isValidTarget(x: number, y: number) {
		if (
			x <= -1 ||
			x >= this.imageData.width ||
			y <= -1 ||
			y >= this.imageData.height
		)
			return false;
		const pixelColor = this.getColorAtPixel(this.imageData, x, y);
		return this.isSameColor(this._replacedColor, pixelColor, this._tolerance);
	}

	private setPixelColor(color: ColorRGBA, curX: number, curY: number): void {
		this.setColorAtPixel(this.imageData, color, curX, curY);

		// Mark this pixel in the mask. Only count + update bounds on the
		// first write so re-writes from radius-2 neighbour passes don't
		// double-count.
		const idx = curY * this.imageData.width + curX;
		if (this.filledMask[idx] === 0) {
			this.filledMask[idx] = 1;
			this.modifiedPixelsCount++;
			if (curX < this.modifiedMinX) this.modifiedMinX = curX;
			if (curY < this.modifiedMinY) this.modifiedMinY = curY;
			if (curX > this.modifiedMaxX) this.modifiedMaxX = curX;
			if (curY > this.modifiedMaxY) this.modifiedMaxY = curY;
		}

		if (this.collectModifiedPixels) {
			this.modifiedPixels.add(`${curX}|${curY}`);
		}
	}

	private resetModifiedArea() {
		this.modifiedMinX = Number.POSITIVE_INFINITY;
		this.modifiedMinY = Number.POSITIVE_INFINITY;
		this.modifiedMaxX = Number.NEGATIVE_INFINITY;
		this.modifiedMaxY = Number.NEGATIVE_INFINITY;
		this.modifiedPixelsCount = 0;
		this.modifiedPixels.clear();
	}

	public getModifiedArea() {
		return {
			minX: this.modifiedMinX,
			minY: this.modifiedMinY,
			maxX: this.modifiedMaxX,
			maxY: this.modifiedMaxY,
			width: this.modifiedMaxX - this.modifiedMinX + 1,
			height: this.modifiedMaxY - this.modifiedMinY + 1,
		};
	}

	/**
	 * Returns the per-pixel fill mask. Length is width*height; values are
	 * 1 where the flood fill wrote and 0 elsewhere. Row-major:
	 * mask[y * width + x].
	 *
	 * The returned array is the live internal buffer. Don't mutate it.
	 */
	public getFilledMask(): Uint8Array {
		return this.filledMask;
	}

	public getModifiedImageData(fillColor: ColorRGBA) {
		const { minX, minY, maxX, maxY, width, height } = this.getModifiedArea();
		const modifiedImageData = new ImageData(width, height);

		for (let y = minY; y <= maxY; y++) {
			for (let x = minX; x <= maxX; x++) {
				const color = this.getColorAtPixel(this.imageData, x, y);

				if (this.isSameColor(color, fillColor)) {
					this.setColorAtPixel(modifiedImageData, color, x - minX, y - minY);
				}
			}
		}

		return modifiedImageData;
	}
}
