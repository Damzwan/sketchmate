import type { Point } from "fabric";

interface GestureDetectorOptions {
	onGestureStart?: () => void;
	onZoom?: (scale: number, previousScale: number, center: Point) => void;
	onDrag?: (
		movementX: number,
		movementY: number,
		totalDx: number,
		totalDy: number,
		center: Point,
	) => void;
	onRotate?: (angleDifference: number, center: Point) => void;
	onGestureEnd?: (fingers: number) => void;
}

function calculateAngle(
	x1: number,
	y1: number,
	x2: number,
	y2: number,
): number {
	return (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
}

function normalizeAngle(angle: number): number {
	let a = angle;
	while (a <= -180) a += 360;
	while (a > 180) a -= 360;
	return a;
}

export function gestureDetector(
	el: HTMLElement,
	options: GestureDetectorOptions,
) {
	let initialDistance = 0;
	let initialX = 0,
		initialY = 0;
	let previousAngle = 0;
	let previousScale = 1;
	let previousCenterX = 0,
		previousCenterY = 0;

	let touch1Id: number | null = null;
	let touch2Id: number | null = null;
	let isGesturing = false;

	function onTouchStart(e: TouchEvent) {
		if (e.touches.length === 2) {
			isGesturing = true;
			touch1Id = e.touches[0].identifier;
			touch2Id = e.touches[1].identifier;

			const x1 = e.touches[0].clientX,
				y1 = e.touches[0].clientY;
			const x2 = e.touches[1].clientX,
				y2 = e.touches[1].clientY;

			initialX = previousCenterX = (x1 + x2) / 2;
			initialY = previousCenterY = (y1 + y2) / 2;

			previousScale = 1;
			previousAngle = calculateAngle(x1, y1, x2, y2);
			initialDistance = Math.hypot(x2 - x1, y2 - y1);

			options.onGestureStart?.();
		}
	}

	function onTouchMove(e: TouchEvent) {
		if (!isGesturing || e.touches.length !== 2) return;

		// Prevent default scrolling/behavior during an active gesture
		e.preventDefault();

		let t1 = e.touches[0],
			t2 = e.touches[1];
		for (let i = 0; i < e.touches.length; i++) {
			if (e.touches[i].identifier === touch1Id) t1 = e.touches[i];
			if (e.touches[i].identifier === touch2Id) t2 = e.touches[i];
		}

		const x1 = t1.clientX,
			y1 = t1.clientY;
		const x2 = t2.clientX,
			y2 = t2.clientY;

		const currentX = (x1 + x2) / 2;
		const currentY = (y1 + y2) / 2;
		const center = { x: currentX, y: currentY } as Point;

		const currentDistance = Math.hypot(x2 - x1, y2 - y1);
		const scale = currentDistance / initialDistance;
		const currentAngle = calculateAngle(x1, y1, x2, y2);
		const angleDifference = normalizeAngle(currentAngle - previousAngle);

		options.onZoom?.(scale, previousScale, center);
		options.onRotate?.(angleDifference, center);
		options.onDrag?.(
			currentX - previousCenterX,
			currentY - previousCenterY,
			currentX - initialX,
			currentY - initialY,
			center,
		);

		previousScale = scale;
		previousAngle = currentAngle;
		previousCenterX = currentX;
		previousCenterY = currentY;
	}

	function onTouchEnd(e: TouchEvent) {
		// If we weren't in a 2-finger gesture, ignore the end event
		if (!isGesturing) return;

		if (e.touches.length < 2) {
			isGesturing = false;
			touch1Id = null;
			touch2Id = null;
			options.onGestureEnd?.(e.touches.length);
		}
	}

	el.addEventListener("touchstart", onTouchStart, { passive: true });
	el.addEventListener("touchmove", onTouchMove, { passive: false });
	el.addEventListener("touchend", onTouchEnd, { passive: true });
	el.addEventListener("touchcancel", onTouchEnd, { passive: true });

	return {
		destroy() {
			el.removeEventListener("touchstart", onTouchStart);
			el.removeEventListener("touchmove", onTouchMove);
			el.removeEventListener("touchend", onTouchEnd);
			el.removeEventListener("touchcancel", onTouchEnd);
		},
	};
}
