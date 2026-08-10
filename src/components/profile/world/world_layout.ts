/**
 * Deterministic pseudo-random in [0, 1).
 *
 * Scene layouts are scattered, not random: every instance of a world must place
 * its motes/stars/hearts identically, or the same user's card would re-shuffle
 * between the feed, the chat row and the profile sheet.
 */
export const seededRandom = (seed: number): number => {
	const x = Math.sin(seed) * 10000;
	return x - Math.floor(x);
};
