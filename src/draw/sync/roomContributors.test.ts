// @vitest-environment jsdom

import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it } from "vitest";
import { useDrawSyncer } from "@/draw/sync/session.store";
import type { Mate } from "@/types/server.types";

function mate(id: string): Mate {
	return { _id: id, name: `user-${id}`, img: "" };
}

describe("room contributors", () => {
	beforeEach(() => setActivePinia(createPinia()));

	it("records a member the first time they draw, once", () => {
		const syncer = useDrawSyncer();
		syncer.roomMembers = [mate("a"), mate("b")];

		syncer.noteContributor("a");
		syncer.noteContributor("a");

		expect([...syncer.contributors.keys()]).toEqual(["a"]);
	});

	it("ignores someone present who has not drawn", () => {
		// The whole reason this exists rather than reading `roomMembers`: presence
		// is not authorship.
		const syncer = useDrawSyncer();
		syncer.roomMembers = [mate("a"), mate("b")];

		syncer.noteContributor("b");

		expect([...syncer.contributors.keys()]).toEqual(["b"]);
	});

	it("ignores a creator it cannot name from the current member list", () => {
		const syncer = useDrawSyncer();
		syncer.roomMembers = [mate("a")];

		syncer.noteContributor("ghost");

		expect(syncer.contributors.size).toBe(0);
	});

	it("keeps a contributor who has since left the room", () => {
		// Credit outlives presence — the snapshot is captured at draw time.
		const syncer = useDrawSyncer();
		syncer.roomMembers = [mate("a")];
		syncer.noteContributor("a");

		syncer.roomMembers = [];

		expect(syncer.contributors.get("a")?.name).toBe("user-a");
	});

	it("caps the list so an open lobby cannot grow it without bound", () => {
		const syncer = useDrawSyncer();
		syncer.roomMembers = Array.from({ length: 20 }, (_, i) => mate(`u${i}`));

		for (const member of syncer.roomMembers) syncer.noteContributor(member._id);

		expect(syncer.contributors.size).toBe(12);
	});

	it("clears on reset, so credit cannot leak into the next drawing", () => {
		const syncer = useDrawSyncer();
		syncer.roomMembers = [mate("a")];
		syncer.noteContributor("a");

		syncer.resetContributors();

		expect(syncer.contributors.size).toBe(0);
	});
});
