// selectionScope.ts
//
// Does a selection reach objects on OTHER layers?
//
// WHY THIS EXISTS
//
// Selection is layer-scoped ("you edit the layer you are on", see
// `objects/indexing/spatialIndex.ts` → `querySelectableObjects`). That is right
// for tapping — without it a tap grabs whatever is under the finger and the
// active layer stops meaning anything — but it breaks the case users actually
// reported: one drawing spread over two layers, moved as a unit. Only the
// active layer's half moves, and nothing on screen explains why.
//
// WHY A VISIBLE SWITCH RATHER THAN A HEURISTIC
//
// Two rejected alternatives, recorded so they are not re-proposed:
//
//   • Scope inferred from the gesture (tap = this layer, lasso = all). Makes
//     identical-looking selections behave differently depending on how they
//     were made, which is exactly the confusion this is meant to remove.
//   • A contextual chip offering to widen the current selection. Appears and
//     disappears, competes with the transform handles for space on a phone,
//     and teaches nothing that persists.
//
// One switch, one meaning, applied to every selection path there is: tap
// (`select.store`), Fabric's rubber-band marquee (`fabricInteractions` —
// `_collectObjects` is overridden to go through the same query), lasso
// (`lassoTool`) and select-all.
//
// WHAT IT DOES NOT AFFECT
//
// Drawing and erasing stay on the active layer, always. Erase gates
// independently in `tools/erasePolicy.ts`, and the eraser's candidate query
// pins the scope explicitly rather than reading this. So the active layer keeps
// its meaning; this widens ONE operation.
//
// Locked and hidden layers are excluded by `queryInteractiveObjects` before
// this is consulted, so "all layers" has always meant "all VISIBLE, UNLOCKED
// layers" and there is no separate rule for it here.

import { ref } from "vue";

export type SelectionScope = "activeLayer" | "allLayers";

/**
 * Reactive because the toggle renders it, read imperatively because the hit
 * path does. `.value` outside a reactive effect is a plain property read, so
 * the query cost is unchanged.
 *
 * Session state, deliberately NOT persisted: it changes what a drag does, and a
 * setting that silently survives from last week is the "why did that move?"
 * failure this feature exists to fix.
 */
const scope = ref<SelectionScope>("activeLayer");

/** For the toggle. Everything on the hit path uses {@link selectionScope}. */
export const selectionScopeRef = scope;

export function selectionScope(): SelectionScope {
	return scope.value;
}

export function setSelectionScope(next: SelectionScope): void {
	scope.value = next;
}

export function isSelectingAcrossLayers(): boolean {
	return scope.value === "allLayers";
}

/**
 * Back to the safe default.
 *
 * Called when the user leaves the selection tools entirely — not when they
 * switch between Select and Lasso, which are two ways to do the same thing and
 * would be surprising to have disagree. Drawing something new, then coming back
 * to Select, starts scoped again.
 */
export function resetSelectionScope(): void {
	scope.value = "activeLayer";
}
