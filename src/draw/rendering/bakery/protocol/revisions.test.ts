import { describe, expect, it } from "vitest";
import {
	SceneCommitAssembler,
	ObjectRevisionLedger,
	SceneRevisionGate,
	SceneRevisionClock,
	WORKER_PROTOCOL_VERSION,
	type SceneCommitChunk,
	type SceneDelta,
} from "@/draw/rendering/bakery/protocol";

const upsert = (id: string, objectRevision: number): SceneDelta => ({
	kind: "upsert",
	id,
	objectRevision,
	json: { id, type: "path" },
});

describe("worker scene revisions", () => {
	it("increments scene and object revisions independently", () => {
		const clock = new SceneRevisionClock();

		expect(clock.nextObjectRevision("a")).toBe(1);
		expect(clock.nextObjectRevision("a")).toBe(2);
		expect(clock.nextObjectRevision("b")).toBe(1);

		const first = clock.commit([upsert("a", 2)]);
		const second = clock.commit([upsert("b", 1)]);
		expect(first[0].sceneRevision).toBe(1);
		expect(second[0].sceneRevision).toBe(2);
		expect(second[0].commitId).toBe(first[0].commitId + 1);
	});

	it("assembles chunks atomically even when they arrive out of order", () => {
		const clock = new SceneRevisionClock();
		const chunks = clock.commit(
			[upsert("a", 1), upsert("b", 1), upsert("c", 1)],
			1,
		);
		const assembler = new SceneCommitAssembler();

		expect(assembler.push(chunks[2])).toBeNull();
		expect(assembler.push(chunks[0])).toBeNull();
		expect(assembler.push(chunks[0])).toBeNull();
		expect(assembler.push(chunks[1])).toEqual({
			sceneRevision: 1,
			deltas: [upsert("a", 1), upsert("b", 1), upsert("c", 1)],
		});
	});

	it("rejects malformed or internally inconsistent chunks", () => {
		const assembler = new SceneCommitAssembler();
		const valid: SceneCommitChunk = {
			t: "sceneCommit",
			protocolVersion: WORKER_PROTOCOL_VERSION,
			commitId: 1,
			sceneRevision: 1,
			chunkIndex: 0,
			chunkCount: 2,
			deltas: [upsert("a", 1)],
		};

		expect(assembler.push(valid)).toBeNull();
		expect(
			assembler.push({
				...valid,
				sceneRevision: 2,
				chunkIndex: 1,
			}),
		).toBeNull();
		expect(
			assembler.push({
				...valid,
				commitId: 2,
				chunkIndex: 2,
			}),
		).toBeNull();
		expect(
			assembler.push({
				...valid,
				commitId: 3,
				deltas: [{ kind: "remove", id: "a", objectRevision: 0 }],
			}),
		).toBeNull();
	});

	it("drops incomplete commits when the worker mirror is reset", () => {
		const clock = new SceneRevisionClock();
		const chunks = clock.commit([upsert("a", 1), upsert("b", 1)], 1);
		const assembler = new SceneCommitAssembler();

		expect(assembler.push(chunks[0])).toBeNull();
		assembler.clear();
		expect(assembler.push(chunks[1])).toBeNull();
	});

	it("ignores duplicated and late object or scene revisions", () => {
		const objects = new ObjectRevisionLedger();
		expect(objects.accept("a", 2)).toBe(true);
		expect(objects.accept("a", 2)).toBe(false);
		expect(objects.accept("a", 1)).toBe(false);
		expect(objects.accept("a", 3)).toBe(true);

		const scene = new SceneRevisionGate();
		expect(scene.accept(3)).toBe(true);
		expect(scene.accept(2)).toBe(false);
		expect(scene.accept(3)).toBe(false);
		expect(scene.matches(3)).toBe(true);
		expect(scene.matches(4)).toBe(false);
	});
});
