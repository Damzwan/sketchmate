import { computed, ref, watch } from "vue";
import { useDrawSyncer } from "@/draw/sync/session.store";
import type { Mate } from "@/types/server.types";

/**
 * Confirmation step for the collaboration credit on a post made in a room.
 *
 * The room tracks who put marks on the canvas (see `contributors` in
 * session.store), but that is canvas-wide and the artist may be publishing a
 * crop of one corner of it — on a public lobby that would credit a dozen
 * strangers whose work is not even in the exported image. Stroke ownership is
 * not persisted on objects, so the export cannot narrow the list by itself;
 * the artist can, and they are the only one who knows what they cropped.
 *
 * Nobody starts selected. Crediting someone is a claim the poster is making
 * about their own work, so it should be something they chose rather than
 * something they forgot to undo — and being in a public lobby with someone is
 * not the same as having drawn something with them.
 */
export function useCollaboratorPicker() {
	const drawSyncer = useDrawSyncer();

	/**
	 * The picker's own copy, not a view onto the store.
	 *
	 * Leaving a room clears `contributors`, and the publish path tears the room
	 * down before the upload finishes — reading through to the store would make
	 * the credit depend on that ordering. A copy is simply immune to it.
	 */
	const known = ref<Map<string, Mate>>(new Map());
	const selected = ref<Set<string>>(new Set());

	watch(
		() => drawSyncer.contributors,
		(contributors) => {
			if (contributors.size === 0) return;

			// Selection is untouched here on purpose: appearing in the room makes
			// someone offerable, never credited.
			const nextKnown = new Map(known.value);
			for (const [id, member] of contributors) nextKnown.set(id, member);
			known.value = nextKnown;
		},
		{ immediate: true, deep: true },
	);

	const collaborators = computed(() => [...known.value.values()]);
	const hasCollaborators = computed(() => collaborators.value.length > 0);
	const collaboratorIds = computed(() =>
		collaborators.value
			.map((mate) => mate._id)
			.filter((id) => selected.value.has(id)),
	);

	function toggleCollaborator(id: string) {
		const next = new Set(selected.value);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		selected.value = next;
	}

	function selectAll() {
		selected.value = new Set(known.value.keys());
	}

	function clearCollaborators() {
		selected.value = new Set();
	}

	return {
		collaborators,
		hasCollaborators,
		collaboratorIds,
		selected,
		toggleCollaborator,
		selectAll,
		clearCollaborators,
	};
}
