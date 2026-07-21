import { computed, ref } from 'vue'

/**
 * How many mates one drawing can go to in a single send.
 *
 * A cap, not a preference: an uncapped send is a broadcast, and a drawing that
 * lands in fifty inboxes at once is spam wearing a drawing's clothes. Five keeps
 * the gesture personal and keeps one tap from fanning out into fifty
 * notifications + fifty inbox rows + fifty pushes.
 */
export const MAX_SEND_MATES = 5

export function useMateSelection(limit = MAX_SEND_MATES) {
  const selected = ref<Set<string>>(new Set())

  const isFull = computed(() => selected.value.size >= limit)

  /**
   * Returns false when the tap was REFUSED by the cap, so the caller can say why
   * — silently ignoring the tap reads as a broken button.
   * Deselecting is never refused, even at the cap.
   */
  function toggle(id: string): boolean {
    if (selected.value.has(id)) {
      selected.value.delete(id)
      return true
    }
    if (isFull.value) return false
    selected.value.add(id)
    return true
  }

  return {
    selected,
    toggle,
    isFull,
    limit,
    count: computed(() => selected.value.size),
    reset: () => selected.value.clear()
  }
}
