import { Path, config, type TBBox, type TSimplePathData, util } from "fabric";
import { isCompactStrokeGeometryEnabled } from "@/draw/config/strokeGeometry.config";
import {
	compactPathStorageInfo,
	type CompactPathStorageInfo,
} from "@/draw/utils/brushes/pathStorage";

const enum PackedCommand {
	Move = 0,
	Line = 1,
	Cubic = 2,
	Quadratic = 3,
	Close = 4,
}

const COMMAND_NAMES = ["M", "L", "C", "Q", "Z"] as const;
const COORDINATE_COUNTS = [2, 2, 6, 4, 0] as const;

export interface PackedPathGeometry {
	readonly commands: Uint8Array;
	readonly coordinates: Float32Array;
}

function commandCode(command: string): PackedCommand {
	switch (command) {
		case "M":
			return PackedCommand.Move;
		case "L":
			return PackedCommand.Line;
		case "C":
			return PackedCommand.Cubic;
		case "Q":
			return PackedCommand.Quadratic;
		case "Z":
			return PackedCommand.Close;
		default:
			throw new Error(`Unsupported simplified path command: ${command}`);
	}
}

function packPath(path: TSimplePathData): PackedPathGeometry {
	let coordinateCount = 0;
	for (const command of path) {
		coordinateCount += COORDINATE_COUNTS[commandCode(command[0])];
	}

	const commands = new Uint8Array(path.length);
	const coordinates = new Float32Array(coordinateCount);
	let coordinateIndex = 0;
	for (let i = 0; i < path.length; i++) {
		const command = path[i];
		const code = commandCode(command[0]);
		commands[i] = code;
		const count = COORDINATE_COUNTS[code];
		for (let j = 0; j < count; j++) {
			coordinates[coordinateIndex++] = command[j + 1] as number;
		}
	}
	return { commands, coordinates };
}

/**
 * Fabric Path backed by two typed arrays instead of an array per command.
 *
 * Fabric's constructor still assigns `this.path`; the prototype accessor below
 * intercepts that assignment before bounds are calculated. Hot Fabric methods
 * are implemented directly against the packed data. The compatibility getter
 * materializes a detached path only for rare external consumers (lasso/path
 * controls), so mutating the returned value cannot corrupt resident geometry.
 */
export class TracedPath extends Path {
	private declare _packedPath?: PackedPathGeometry;
	private declare _suppressPathMaterialization?: boolean;

	_hasCompactPathGeometry(): boolean {
		return this._packedPath !== undefined;
	}

	getCompactPathStorageInfo(): CompactPathStorageInfo | null {
		const packed = this._packedPath;
		return packed
			? compactPathStorageInfo(
					packed.commands.length,
					packed.coordinates.length,
					packed,
				)
			: null;
	}

	/** Share immutable geometry with a clone while keeping transform/style state separate. */
	_shareCompactPathGeometryFrom(source: TracedPath): boolean {
		const packed = source._packedPath;
		if (!packed) return false;
		this._packedPath = packed;
		// The receiver was constructed with an empty placeholder path. Restore the
		// shared geometry's dimensions without changing its already-copied position.
		this.setBoundingBox();
		return true;
	}

	_sharesCompactPathGeometryWith(source: TracedPath): boolean {
		return !!this._packedPath && this._packedPath === source._packedPath;
	}

	_setCompactPath(path: TSimplePathData): void {
		if (!isCompactStrokeGeometryEnabled()) {
			// Shadow the prototype accessor with Fabric's normal mutable data field.
			Object.defineProperty(this, "path", {
				value: path,
				writable: true,
				configurable: true,
				enumerable: true,
			});
			return;
		}
		this._packedPath = packPath(path);
	}

	_getMaterializedPath(): TSimplePathData {
		if (this._suppressPathMaterialization) return [];
		const packed = this._packedPath;
		if (!packed) return [];

		const path: any[] = new Array(packed.commands.length);
		let coordinateIndex = 0;
		for (let i = 0; i < packed.commands.length; i++) {
			const code = packed.commands[i] as PackedCommand;
			const count = COORDINATE_COUNTS[code];
			const command: any[] = new Array(count + 1);
			command[0] = COMMAND_NAMES[code];
			for (let j = 0; j < count; j++) {
				command[j + 1] = packed.coordinates[coordinateIndex++];
			}
			path[i] = command;
		}
		return path as TSimplePathData;
	}

	_serializeWithPathSuppressed<T>(serialize: () => T): T {
		this._suppressPathMaterialization = true;
		try {
			return serialize();
		} finally {
			this._suppressPathMaterialization = false;
		}
	}

	protected _forEachPathCommand(
		visitor: (
			command: string,
			coordinates: ArrayLike<number | string>,
			coordinateOffset: number,
		) => void,
	): void {
		const packed = this._packedPath;
		if (!packed) {
			for (const command of this.path) visitor(command[0], command, 1);
			return;
		}

		let coordinateIndex = 0;
		for (let i = 0; i < packed.commands.length; i++) {
			const code = packed.commands[i] as PackedCommand;
			visitor(COMMAND_NAMES[code], packed.coordinates, coordinateIndex);
			coordinateIndex += COORDINATE_COUNTS[code];
		}
	}

	_renderPathCommands(ctx: CanvasRenderingContext2D): void {
		const packed = this._packedPath;
		if (!packed) {
			super._renderPathCommands(ctx);
			return;
		}

		const left = -this.pathOffset.x;
		const top = -this.pathOffset.y;
		let coordinateIndex = 0;
		ctx.beginPath();
		for (let i = 0; i < packed.commands.length; i++) {
			const code = packed.commands[i] as PackedCommand;
			switch (code) {
				case PackedCommand.Move:
					ctx.moveTo(
						packed.coordinates[coordinateIndex] + left,
						packed.coordinates[coordinateIndex + 1] + top,
					);
					break;
				case PackedCommand.Line:
					ctx.lineTo(
						packed.coordinates[coordinateIndex] + left,
						packed.coordinates[coordinateIndex + 1] + top,
					);
					break;
				case PackedCommand.Cubic:
					ctx.bezierCurveTo(
						packed.coordinates[coordinateIndex] + left,
						packed.coordinates[coordinateIndex + 1] + top,
						packed.coordinates[coordinateIndex + 2] + left,
						packed.coordinates[coordinateIndex + 3] + top,
						packed.coordinates[coordinateIndex + 4] + left,
						packed.coordinates[coordinateIndex + 5] + top,
					);
					break;
				case PackedCommand.Quadratic:
					ctx.quadraticCurveTo(
						packed.coordinates[coordinateIndex] + left,
						packed.coordinates[coordinateIndex + 1] + top,
						packed.coordinates[coordinateIndex + 2] + left,
						packed.coordinates[coordinateIndex + 3] + top,
					);
					break;
				case PackedCommand.Close:
					ctx.closePath();
					break;
			}
			coordinateIndex += COORDINATE_COUNTS[code];
		}
	}

	_calcBoundsFromPath(): TBBox {
		const packed = this._packedPath;
		if (!packed) return super._calcBoundsFromPath();

		const bounds: { x: number; y: number }[] = [];
		let subpathStartX = 0;
		let subpathStartY = 0;
		let x = 0;
		let y = 0;
		let coordinateIndex = 0;

		for (let i = 0; i < packed.commands.length; i++) {
			const code = packed.commands[i] as PackedCommand;
			const coordinates = packed.coordinates;
			switch (code) {
				case PackedCommand.Line:
					x = coordinates[coordinateIndex];
					y = coordinates[coordinateIndex + 1];
					bounds.push({ x: subpathStartX, y: subpathStartY }, { x, y });
					break;
				case PackedCommand.Move:
					x = coordinates[coordinateIndex];
					y = coordinates[coordinateIndex + 1];
					subpathStartX = x;
					subpathStartY = y;
					break;
				case PackedCommand.Cubic: {
					const endX = coordinates[coordinateIndex + 4];
					const endY = coordinates[coordinateIndex + 5];
					bounds.push(
						...util.getBoundsOfCurve(
							x,
							y,
							coordinates[coordinateIndex],
							coordinates[coordinateIndex + 1],
							coordinates[coordinateIndex + 2],
							coordinates[coordinateIndex + 3],
							endX,
							endY,
						),
					);
					x = endX;
					y = endY;
					break;
				}
				case PackedCommand.Quadratic: {
					const controlX = coordinates[coordinateIndex];
					const controlY = coordinates[coordinateIndex + 1];
					const endX = coordinates[coordinateIndex + 2];
					const endY = coordinates[coordinateIndex + 3];
					bounds.push(
						...util.getBoundsOfCurve(
							x,
							y,
							controlX,
							controlY,
							controlX,
							controlY,
							endX,
							endY,
						),
					);
					x = endX;
					y = endY;
					break;
				}
				case PackedCommand.Close:
					x = subpathStartX;
					y = subpathStartY;
					break;
			}
			coordinateIndex += COORDINATE_COUNTS[code];
		}

		return util.makeBoundingBoxFromPoints(bounds);
	}

	complexity(): number {
		return this._packedPath?.commands.length ?? super.complexity();
	}

	_toSVG(): string[] {
		const packed = this._packedPath;
		if (!packed) return super._toSVG();

		const parts: string[] = [];
		let coordinateIndex = 0;
		for (let i = 0; i < packed.commands.length; i++) {
			const code = packed.commands[i] as PackedCommand;
			parts.push(COMMAND_NAMES[code]);
			const count = COORDINATE_COUNTS[code];
			for (let j = 0; j < count; j++) {
				parts.push(
					String(
						Number(
							packed.coordinates[coordinateIndex++].toFixed(
								config.NUM_FRACTION_DIGITS,
							),
						),
					),
				);
			}
		}
		return [
			"<path ",
			"COMMON_PARTS",
			`d="${parts.join(" ")}" stroke-linecap="round" />\n`,
		];
	}
}

// `Path` declares `path` as a data property, so TypeScript disallows an
// accessor override in the class body. Defining it on the prototype preserves
// the runtime semantics we need while keeping Fabric's public `path` type.
Object.defineProperty(TracedPath.prototype, "path", {
	get(this: TracedPath) {
		return this._getMaterializedPath();
	},
	set(this: TracedPath, path: TSimplePathData) {
		this._setCompactPath(path);
	},
	configurable: true,
	enumerable: true,
});
