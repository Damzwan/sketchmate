import { computed, ref } from 'vue'

export function useMateSelection() {
  const selected = ref<Set<string>>(new Set())

  function toggle(id: string) {
    selected.value.has(id)
      ? selected.value.delete(id)
      : selected.value.add(id)
  }

  return {
    selected,
    toggle,
    count: computed(() => selected.value.size),
    reset: () => selected.value.clear()
  }
}