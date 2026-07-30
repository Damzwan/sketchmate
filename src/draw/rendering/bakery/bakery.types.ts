// Deltas keep the worker's Fabric mirror in sync. Bake requests carry only tile
// geometry and z-ordered object ids.

export type BakeryRequest =
	| {
			t: "config";
			liveMax?: number;
			idleMax?: number;
			/** At-rest cap for the worker's compact serialized scene mirror. */
			jsonMaxBytes?: number;
	  }
	| { t: "upsert"; items: { id: string; json: any }[] }
	| { t: "translate"; ids: string[]; dx: number; dy: number }
	| {
			// CLIP-granular sync. An erase only changes an object's clipPath, not its
			// path/props, so re-serializing the WHOLE object (upsert) is wasteful —
			// and doing it for every touched object is what made a pan right after a
			// big erase / undo block. This ships only the object's serialized clip
			// (exactly clipPath.toObject(), so no shape guessing). `clip: null` clears
			// it (undo of the last erase on an object). No-op if the id is unknown to
			// the mirror — the next bake reports it `missing` and re-upserts in full.
			t: "clipSet";
			id: string;
			clip: any | null;
	  }
	| {
			// Pixel ASSET for a bitmap-backed stroke (Pixel's brush-tip stamp;
			// Neon/Spray/Crayon's rasterized artwork). Sent as a TRANSFERABLE, so the
			// pixels move to the worker with no copy and no main-thread encode.
			//
			// Without this the worker had to rebuild those bitmaps itself — via image
			// decoding (Pixel's `stampDataUrl`, impossible in a worker) or by re-running
			// the generator on every enliven (Neon's blurred glow, expensive) — so those
			// strokes were refused and their whole tile fell back to a main-thread bake.
			// With the asset present the worker renders them like any other object.
			//
			// Lifetime: the sender caps how many/how large a set it ships and never
			// re-sends; the worker holds each until the object is removed or the mirror
			// is cleared. An id with no asset is simply refused → main-thread bake, i.e.
			// the previous behaviour, so this can only add capability.
			t: "asset";
			id: string;
			bitmap: ImageBitmap;
	  }
	| { t: "remove"; ids: string[] }
	| { t: "clear" }
	| {
			// ABANDON everything issued before `epoch` (gesture start). Handled OUT OF
			// BAND — see the worker's onmessage. Carries no msgId: it is not a request
			// and gets no reply; the sender settles its own pending promises.
			t: "cancel";
			epoch: number;
	  }
	| {
			t: "bake";
			msgId: number;
			/** Cancellation generation this request belongs to. The worker drops it if
			 *  a later `cancel` has already raised its epoch. */
			epoch: number;
			ids: string[];
			world: { x: number; y: number; w: number; h: number };
			scale: number;
			overscan: number;
			size: number;
	  }
	| {
			// Whole-board low-res render (the WorldOverview base layer). `ids` are
			// z-ordered and already bbox-filtered main-side; the worker renders them
			// into a content-shaped bitmap mapped to `bounds`.
			t: "overview";
			msgId: number;
			epoch: number;
			ids: string[];
			bounds: { x: number; y: number; w: number; h: number };
			width: number;
			height: number;
			scale: number;
	  };

export interface BakeryResponse {
	/** Correlates with the request. -1 marks an UNSOLICITED notification (the
	 *  font-registration result), which no pending request is waiting on. */
	msgId: number;
	/** Rendered tile — transferred, zero-copy. */
	bitmap?: ImageBitmap;
	/** Ids the mirror doesn't have (enliven failed / never upserted). */
	missing?: string[];
	error?: string;
	/** The request was dropped because its epoch is stale (a `cancel` landed).
	 *  NOT a fault: it must not count toward the timeout / hard-error budgets, and
	 *  it must not be reported as a failed tile. */
	aborted?: boolean;
	/** Font families successfully registered in the worker's FontFaceSet. Text
	 *  using any OTHER family stays refused — a missing face would silently bake
	 *  fallback glyphs into a committed tile. Empty = no worker font support. */
	fonts?: string[];
}
