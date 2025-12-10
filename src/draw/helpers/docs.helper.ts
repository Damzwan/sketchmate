import { DocsItem, DocsKey } from '@/draw/config/docs.config'

export function generateNextPrevForDocsItem(item: DocsItem) {
  if (!item.children) return {}
  const nextPrev: Partial<Record<DocsKey, (DocsKey | undefined)[]>> = {}

  for (let i = 0; i < item.children?.length; i++) {
    nextPrev[item.children[i]] = [
      i == 0 ? undefined : item.children[i - 1],
      i == item.children.length - 1 ? undefined : item.children[i + 1]
    ]
  }

  return nextPrev
}