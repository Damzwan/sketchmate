// @vitest-environment jsdom

import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it } from "vitest";
import { defineComponent, h, nextTick } from "vue";
import { useDrawSyncer } from "@/draw/sync/session.store";
import type { Mate } from "@/types/server.types";
import { useCollaboratorPicker } from "./useCollaboratorPicker";

function mate(id: string): Mate {
	return { _id: id, name: `user-${id}`, img: "" };
}

/** The composable uses `watch`, so it has to run inside a component instance. */
function mountPicker() {
	let picker!: ReturnType<typeof useCollaboratorPicker>;
	mount(
		defineComponent({
			setup() {
				picker = useCollaboratorPicker();
				return () => h("div");
			},
		}),
	);
	return picker;
}

function drew(ids: string[]) {
	const syncer = useDrawSyncer();
	syncer.roomMembers = ids.map(mate);
	for (const id of ids) syncer.noteContributor(id);
}

describe("useCollaboratorPicker", () => {
	beforeEach(() => setActivePinia(createPinia()));

	it("credits nobody until the poster says so", async () => {
		// Sharing a lobby with someone is not the same as having drawn something
		// with them, so the claim has to be made deliberately.
		drew(["a", "b"]);
		const picker = mountPicker();
		await nextTick();

		expect(picker.hasCollaborators.value).toBe(true);
		expect(picker.collaboratorIds.value).toEqual([]);
	});

	it("credits someone the artist picks", async () => {
		drew(["a", "b"]);
		const picker = mountPicker();
		await nextTick();

		picker.toggleCollaborator("b");

		expect(picker.collaboratorIds.value).toEqual(["b"]);
	});

	it("keeps a pick when that person draws again", async () => {
		// The contributor map updates on every incoming stroke; that must not
		// disturb a choice already made.
		drew(["a"]);
		const picker = mountPicker();
		await nextTick();
		picker.toggleCollaborator("a");

		drew(["a", "b"]);
		await nextTick();

		expect(picker.collaboratorIds.value).toEqual(["a"]);
	});

	it("keeps its list after the room is torn down", async () => {
		// Publishing leaves the room before the upload finishes, which clears the
		// store's contributor map. A copy is immune to that ordering.
		drew(["a"]);
		const picker = mountPicker();
		await nextTick();
		picker.toggleCollaborator("a");

		useDrawSyncer().resetContributors();
		await nextTick();

		expect(picker.collaboratorIds.value).toEqual(["a"]);
		expect(picker.hasCollaborators.value).toBe(true);
	});

	it("has nothing to show for a solo drawing", () => {
		const picker = mountPicker();

		expect(picker.hasCollaborators.value).toBe(false);
		expect(picker.collaboratorIds.value).toEqual([]);
	});

	it("clears and restores the whole list", async () => {
		drew(["a", "b"]);
		const picker = mountPicker();
		await nextTick();

		picker.clearCollaborators();
		expect(picker.collaboratorIds.value).toEqual([]);

		picker.selectAll();
		expect(picker.collaboratorIds.value).toEqual(["a", "b"]);
	});
});
