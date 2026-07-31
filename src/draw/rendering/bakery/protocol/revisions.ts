import {
	WORKER_PROTOCOL_VERSION,
	type SceneCommitChunk,
	type SceneDelta,
} from "./messages";
import { isSceneCommitChunk } from "./validation";

export class SceneRevisionClock {
	private sceneRevision = 0;
	private commitId = 0;
	private readonly objectRevisions = new Map<string, number>();

	get currentSceneRevision(): number {
		return this.sceneRevision;
	}

	nextObjectRevision(id: string): number {
		const revision = (this.objectRevisions.get(id) ?? 0) + 1;
		this.objectRevisions.set(id, revision);
		return revision;
	}

	nextObjectRevisions(ids: readonly string[]): number[] {
		return ids.map((id) => this.nextObjectRevision(id));
	}

	resetObjects(): void {
		this.objectRevisions.clear();
	}

	commit(deltas: SceneDelta[], chunkSize = 128): SceneCommitChunk[] {
		if (deltas.length === 0) return [];
		const sceneRevision = ++this.sceneRevision;
		const commitId = ++this.commitId;
		const size = Math.max(1, chunkSize);
		const chunkCount = Math.ceil(deltas.length / size);
		const chunks: SceneCommitChunk[] = [];
		for (let chunkIndex = 0; chunkIndex < chunkCount; chunkIndex++) {
			chunks.push({
				t: "sceneCommit",
				protocolVersion: WORKER_PROTOCOL_VERSION,
				commitId,
				sceneRevision,
				chunkIndex,
				chunkCount,
				deltas: deltas.slice(chunkIndex * size, (chunkIndex + 1) * size),
			});
		}
		return chunks;
	}
}

export class ObjectRevisionLedger {
	private readonly revisions = new Map<string, number>();

	accept(id: string, revision: number | undefined): boolean {
		if (revision === undefined) return true;
		if (revision <= (this.revisions.get(id) ?? 0)) return false;
		this.revisions.set(id, revision);
		return true;
	}

	clear(): void {
		this.revisions.clear();
	}
}

export class SceneRevisionGate {
	private revision = 0;

	get current(): number {
		return this.revision;
	}

	accept(revision: number): boolean {
		if (revision <= this.revision) return false;
		this.revision = revision;
		return true;
	}

	matches(revision: number | undefined): boolean {
		return revision === undefined || revision === this.revision;
	}

	reset(): void {
		this.revision = 0;
	}
}

interface PendingCommit {
	sceneRevision: number;
	chunkCount: number;
	chunks: Map<number, SceneDelta[]>;
}

export interface AssembledSceneCommit {
	sceneRevision: number;
	deltas: SceneDelta[];
}

/**
 * Buffers a chunked scene commit until every chunk is present. Duplicate
 * chunks are idempotent and no partial mutation is exposed to the worker.
 */
export class SceneCommitAssembler {
	private readonly pending = new Map<number, PendingCommit>();

	push(chunk: SceneCommitChunk): AssembledSceneCommit | null {
		if (
			!isSceneCommitChunk(chunk) ||
			chunk.protocolVersion !== WORKER_PROTOCOL_VERSION ||
			chunk.chunkCount < 1 ||
			chunk.chunkIndex < 0 ||
			chunk.chunkIndex >= chunk.chunkCount
		) {
			return null;
		}

		let commit = this.pending.get(chunk.commitId);
		if (!commit) {
			commit = {
				sceneRevision: chunk.sceneRevision,
				chunkCount: chunk.chunkCount,
				chunks: new Map(),
			};
			this.pending.set(chunk.commitId, commit);
		}
		if (
			commit.sceneRevision !== chunk.sceneRevision ||
			commit.chunkCount !== chunk.chunkCount
		) {
			this.pending.delete(chunk.commitId);
			return null;
		}

		if (!commit.chunks.has(chunk.chunkIndex)) {
			commit.chunks.set(chunk.chunkIndex, chunk.deltas);
		}
		if (commit.chunks.size !== commit.chunkCount) return null;

		const deltas: SceneDelta[] = [];
		for (let index = 0; index < commit.chunkCount; index++) {
			const part = commit.chunks.get(index);
			if (!part) return null;
			deltas.push(...part);
		}
		this.pending.delete(chunk.commitId);
		return { sceneRevision: commit.sceneRevision, deltas };
	}

	clear(): void {
		this.pending.clear();
	}
}
