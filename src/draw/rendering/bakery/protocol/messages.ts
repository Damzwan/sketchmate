export const WORKER_PROTOCOL_VERSION = 2 as const;

export interface WorkerRect {
	x: number;
	y: number;
	w: number;
	h: number;
}

export type RenderStylePatch = Record<string, unknown>;

export type SceneDelta =
	| {
			kind: "upsert";
			id: string;
			objectRevision: number;
			json: any;
			bounds?: WorkerRect;
			z?: number;
	  }
	| {
			kind: "translate";
			ids: string[];
			objectRevisions: number[];
			dx: number;
			dy: number;
	  }
	| {
			kind: "clip";
			id: string;
			objectRevision: number;
			clip: any | null;
	  }
	| {
			kind: "style";
			id: string;
			objectRevision: number;
			patch: RenderStylePatch;
	  }
	| {
			kind: "remove";
			id: string;
			objectRevision: number;
	  }
	| {
			kind: "zOrder";
			ids: string[];
			objectRevisions: number[];
			z: number[];
	  }
	| { kind: "reset" };

export interface SceneCommitChunk {
	t: "sceneCommit";
	protocolVersion: typeof WORKER_PROTOCOL_VERSION;
	commitId: number;
	sceneRevision: number;
	chunkIndex: number;
	chunkCount: number;
	deltas: SceneDelta[];
}

export interface WorkerTiming {
	queueWaitMs: number;
	indexQueryMs: number;
	enlivenMs: number;
	rasterMs: number;
	bitmapTransferMs: number;
}
