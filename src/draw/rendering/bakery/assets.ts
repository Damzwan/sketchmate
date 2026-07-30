import { FabricImage } from "fabric";

interface PendingAsset {
	epoch: number;
	version: number;
	bytes: number;
}

export class BakeryAssets {
	private readonly budgetBytes =
		typeof navigator !== "undefined" &&
		/Mobi|Android/i.test(navigator.userAgent)
			? 24 * 1024 * 1024
			: 64 * 1024 * 1024;

	private sent = new Set<string>();
	private sizes = new Map<string, number>();
	private versions = new Map<string, number>();
	private pending = new Map<string, PendingAsset>();
	private fonts = new Set<string>();
	private usedBytes = 0;
	private reservedBytes = 0;
	private epoch = 0;

	constructor(private readonly getWorker: () => Worker | null) {}

	setFonts(fonts: readonly string[]): void {
		this.fonts = new Set(fonts);
	}

	reset(clearFonts = false): void {
		this.epoch++;
		this.sent.clear();
		this.sizes.clear();
		this.versions.clear();
		this.pending.clear();
		if (clearFonts) this.fonts.clear();
		this.usedBytes = 0;
		this.reservedBytes = 0;
	}

	forget(id: string): void {
		this.versions.set(id, (this.versions.get(id) ?? 0) + 1);
		const pending = this.pending.get(id);
		if (pending) this.releasePending(id, pending);

		this.usedBytes = Math.max(0, this.usedBytes - (this.sizes.get(id) ?? 0));
		this.sizes.delete(id);
		this.sent.delete(id);
	}

	canShip(object: any): boolean {
		if (object.group || this.hasImageClip(object)) return false;
		if (object.text !== undefined) return this.canRenderText(object);
		if (object.type === "image") return false;
		if (!this.isBitmapBacked(object)) return true;
		if (this.sent.has(object.id)) return true;

		this.ensureTransferred(object);
		return false;
	}

	private canRenderText(object: any): boolean {
		if (this.fonts.size === 0 || typeof object.fontFamily !== "string")
			return false;
		return object.fontFamily
			.split(",")
			.every((font: string) =>
				this.fonts.has(font.trim().replace(/^["']|["']$/g, "")),
			);
	}

	private hasImageClip(object: any): boolean {
		if (object.__hasImageClip) return true;
		const children = object.clipPath?._objects;
		if (!Array.isArray(children)) return false;
		const hasImage = children.some(
			(child) => child?.type === "image" || child instanceof FabricImage,
		);
		if (hasImage) object.__hasImageClip = true;
		return hasImage;
	}

	private isBitmapBacked(object: any): boolean {
		return (
			object?.constructor?.bakesOnMainThread === true ||
			object instanceof FabricImage
		);
	}

	private ensureTransferred(object: any): void {
		const id = object?.id;
		if (
			!id ||
			this.sent.has(id) ||
			this.pending.has(id) ||
			typeof createImageBitmap === "undefined"
		) {
			return;
		}

		const source =
			(object.stampCanvas as CanvasImageSource | undefined) ??
			object.getElement?.();
		const width = (source as any)?.width | 0;
		const height = (source as any)?.height | 0;
		const bytes = width * height * 4;
		if (
			!source ||
			bytes <= 0 ||
			this.usedBytes + this.reservedBytes + bytes > this.budgetBytes
		) {
			return;
		}

		const transfer = {
			epoch: this.epoch,
			version: this.versions.get(id) ?? 0,
			bytes,
		};
		this.pending.set(id, transfer);
		this.reservedBytes += bytes;

		void createImageBitmap(source).then(
			(bitmap) => this.finishTransfer(id, bitmap, transfer),
			() => this.releasePending(id, transfer),
		);
	}

	private finishTransfer(
		id: string,
		bitmap: ImageBitmap,
		transfer: PendingAsset,
	): void {
		this.releasePending(id, transfer);
		if (
			transfer.epoch !== this.epoch ||
			transfer.version !== (this.versions.get(id) ?? 0)
		) {
			bitmap.close();
			return;
		}

		const worker = this.getWorker();
		if (!worker) {
			bitmap.close();
			return;
		}
		try {
			worker.postMessage({ t: "asset", id, bitmap }, [bitmap]);
			this.sent.add(id);
			this.sizes.set(id, transfer.bytes);
			this.usedBytes += transfer.bytes;
		} catch {
			bitmap.close();
		}
	}

	private releasePending(id: string, transfer: PendingAsset): void {
		if (this.pending.get(id) !== transfer) return;
		this.pending.delete(id);
		this.reservedBytes = Math.max(0, this.reservedBytes - transfer.bytes);
	}
}
