import { nextTick, Ref } from 'vue'

export function useScrollAnchor(containerRef: Ref<HTMLElement | null>) {
  async function scrollToBottom(instant = false) {
    await nextTick()
    containerRef.value?.scrollTo({
      top: containerRef.value.scrollHeight,
      behavior: instant ? 'auto' : 'smooth'
    })
  }

  function captureScrollState() {
    const el = containerRef.value
    return el ? { scrollHeight: el.scrollHeight, scrollTop: el.scrollTop } : null
  }

  function restoreScrollState(snapshot: { scrollHeight: number; scrollTop: number }) {
    const el = containerRef.value
    if (!el) return
    el.scrollTo({
      top: snapshot.scrollTop + (el.scrollHeight - snapshot.scrollHeight),
      behavior: 'auto'
    })
  }

  return { scrollToBottom, captureScrollState, restoreScrollState }
}