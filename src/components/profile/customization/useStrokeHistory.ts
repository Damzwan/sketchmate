import { computed, type Ref, ref } from "vue";
import type { Point, Stroke } from "./backgroundSketchGeometry";

const MAX_HISTORY_STEPS = 30;
const MAX_HISTORY_POINTS = 60_000;

const cloneStrokes = (strokes: Stroke[]): Stroke[] =>
	strokes.map((stroke) => ({
		width: stroke.width,
		points: stroke.points.map((point) => [point[0], point[1]] as Point),
	}));

const countPoints = (snapshot: Stroke[]): number =>
	snapshot.reduce((count, stroke) => count + stroke.points.length, 0);

function pushHistory(stack: Ref<Stroke[][]>, snapshot: Stroke[]): void {
	const next = [...stack.value, snapshot];
	while (next.length > MAX_HISTORY_STEPS) next.shift();
	let points = next.reduce((count, entry) => count + countPoints(entry), 0);
	while (next.length > 1 && points > MAX_HISTORY_POINTS) {
		points -= countPoints(next.shift()!);
	}
	stack.value = next;
}

/** Bounded whole-drawing history for the lightweight profile sketch pad. */
export function useStrokeHistory(strokes: Ref<Stroke[]>) {
	const past = ref<Stroke[][]>([]);
	const future = ref<Stroke[][]>([]);
	const canUndo = computed(() => past.value.length > 0);
	const canRedo = computed(() => future.value.length > 0);
	let gestureSnapshot: Stroke[] | null = null;

	function clearHistory(): void {
		past.value = [];
		future.value = [];
		gestureSnapshot = null;
	}

	function beginHistory(): void {
		gestureSnapshot = cloneStrokes(strokes.value);
	}

	function cancelHistory(): void {
		gestureSnapshot = null;
	}

	function commitHistory(): void {
		if (!gestureSnapshot) return;
		if (JSON.stringify(gestureSnapshot) !== JSON.stringify(strokes.value)) {
			pushHistory(past, gestureSnapshot);
			future.value = [];
		}
		gestureSnapshot = null;
	}

	function undo(): void {
		if (!canUndo.value) return;
		pushHistory(future, cloneStrokes(strokes.value));
		strokes.value = past.value.pop()!;
	}

	function redo(): void {
		if (!canRedo.value) return;
		pushHistory(past, cloneStrokes(strokes.value));
		strokes.value = future.value.pop()!;
	}

	return {
		canUndo,
		canRedo,
		clearHistory,
		beginHistory,
		cancelHistory,
		commitHistory,
		undo,
		redo,
	};
}
