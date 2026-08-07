import type { Canvas } from "fabric";

/**
 * Bumped every time something clears the shared TOP context.
 *
 * Brushes draw their live preview there INCREMENTALLY (only the stamps added
 * since the last pointer move — see e.g. CharcoalBrush._render), which is what
 * makes a long stroke O(n) instead of O(n²). That optimisation assumes nothing
 * else wipes the surface underneath them. `rerenderActiveObjectControls` does
 * exactly that, on every composited frame while an object is selected — and a
 * frame can land mid-stroke (a remote sync edit, a demote repaint). The old
 * redraw-everything previews self-healed on the next move; an incremental one
 * would not, leaving the stroke invisible until pointer-up.
 *
 * So: readers snapshot this epoch and repaint in full whenever it changes.
 */
let topContextEpoch = 0;

export function getTopContextEpoch(): number {
	return topContextEpoch;
}

/** Call after any clear of the top context a brush preview might be using. */
export function noteTopContextCleared(): void {
	topContextEpoch++;
}

export function rerenderActiveObjectControls(c: Canvas) {
	const ab = c.getActiveObject();
	if (ab) {
		c.clearContext(c.getTopContext());
		noteTopContextCleared();
		ab._renderControls(c.getTopContext());
	}
}
