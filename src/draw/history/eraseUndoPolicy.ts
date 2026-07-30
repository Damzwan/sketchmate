export const MAX_HISTORY_ACTIONS = 50;

// Keep every erase that can still exist in history as a vector clip child.
// The extra margin accounts for the baked mask image and a few commits that may
// land before history trimming catches up.
export const LIVE_ERASE_STROKES = MAX_HISTORY_ACTIONS + 14;
export const FLATTEN_ERASE_CLIP_AFTER = LIVE_ERASE_STROKES + 8;
