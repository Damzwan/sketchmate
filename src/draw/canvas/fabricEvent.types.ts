import type { CanvasEvents } from "fabric";

export interface FabricEvent {
	on: keyof CanvasEvents;
	handler: (event: any) => void;
}
