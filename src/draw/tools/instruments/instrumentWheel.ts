/**
 * Replay a wheel event on Fabric's upper canvas when a DOM instrument surface
 * is the original target. Dispatching on the real canvas element lets Fabric
 * calculate its normal offset coordinates and follow the existing zoom path.
 */
export function forwardInstrumentWheel(
	event: WheelEvent,
	canvasElement: HTMLCanvasElement,
): void {
	event.preventDefault();
	event.stopPropagation();

	canvasElement.dispatchEvent(
		new WheelEvent("wheel", {
			bubbles: true,
			cancelable: true,
			composed: true,
			clientX: event.clientX,
			clientY: event.clientY,
			screenX: event.screenX,
			screenY: event.screenY,
			deltaX: event.deltaX,
			deltaY: event.deltaY,
			deltaZ: event.deltaZ,
			deltaMode: event.deltaMode,
			ctrlKey: event.ctrlKey,
			shiftKey: event.shiftKey,
			altKey: event.altKey,
			metaKey: event.metaKey,
		}),
	);
}
