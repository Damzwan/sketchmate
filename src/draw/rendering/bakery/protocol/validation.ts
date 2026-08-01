import {
	WORKER_PROTOCOL_VERSION,
	type SceneCommitChunk,
	type SceneDelta,
} from "./messages";

const isRecord = (value: unknown): value is Record<string, unknown> =>
	!!value && typeof value === "object";

function isRevision(value: unknown): value is number {
	return Number.isInteger(value) && (value as number) > 0;
}

export function isSceneDelta(value: unknown): value is SceneDelta {
	if (!isRecord(value) || typeof value.kind !== "string") return false;
	switch (value.kind) {
		case "upsert":
			return (
				typeof value.id === "string" &&
				isRevision(value.objectRevision) &&
				"json" in value
			);
		case "translate":
			return (
				Array.isArray(value.ids) &&
				value.ids.every((id) => typeof id === "string") &&
				Array.isArray(value.objectRevisions) &&
				value.objectRevisions.length === value.ids.length &&
				value.objectRevisions.every(isRevision) &&
				typeof value.dx === "number" &&
				typeof value.dy === "number"
			);
		case "clip":
			return (
				typeof value.id === "string" &&
				isRevision(value.objectRevision) &&
				"clip" in value
			);
		case "style":
			return (
				typeof value.id === "string" &&
				isRevision(value.objectRevision) &&
				isRecord(value.patch)
			);
		case "remove":
			return typeof value.id === "string" && isRevision(value.objectRevision);
		case "zOrder":
			return (
				Array.isArray(value.ids) &&
				value.ids.every((id) => typeof id === "string") &&
				Array.isArray(value.objectRevisions) &&
				value.objectRevisions.length === value.ids.length &&
				value.objectRevisions.every(isRevision) &&
				Array.isArray(value.z) &&
				value.z.length === value.ids.length &&
				value.z.every((z) => typeof z === "number" && Number.isFinite(z))
			);
		case "reset":
			return true;
		default:
			return false;
	}
}

export function isSceneCommitChunk(value: unknown): value is SceneCommitChunk {
	if (!value || typeof value !== "object") return false;
	const chunk = value as Partial<SceneCommitChunk>;
	return (
		chunk.t === "sceneCommit" &&
		chunk.protocolVersion === WORKER_PROTOCOL_VERSION &&
		Number.isInteger(chunk.commitId) &&
		Number.isInteger(chunk.sceneRevision) &&
		Number.isInteger(chunk.chunkIndex) &&
		Number.isInteger(chunk.chunkCount) &&
		Array.isArray(chunk.deltas) &&
		chunk.deltas.every(isSceneDelta)
	);
}
