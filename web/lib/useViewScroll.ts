import { nextTick, onActivated, onBeforeUnmount, onMounted, watch, type Ref } from 'vue'
import { nav } from './nav'

const rootScroll = new Map<string, Record<string, unknown>>()

/** Snapshot before DOM removal, then restore after KeepAlive's layout settles. */
export function useViewScroll(element: Ref<HTMLElement | null | undefined>) {
  const owner = nav.current
  owner.state ??= {}
  const root = ['home', 'todo', 'favs', 'calendar'].includes(owner.view)
  if (root && !rootScroll.has(owner.view)) rootScroll.set(owner.view, {})
  const state = root ? rootScroll.get(owner.view)! : owner.state
  let node: HTMLElement | null = null
  let restoring = false
  let frame = 0
  const active = () => root ? nav.current.view === owner.view : nav.current === owner
  const save = () => {
    if (node && active() && !restoring) state.scrollTop = node.scrollTop
  }
  watch(() => nav.current, (current, previous) => {
    if (node && previous?.view === owner.view && current.view !== owner.view) {
      state.scrollTop = node.scrollTop
    }
  }, { flush: 'sync' })
  const restore = () => {
    const top = Number(state.scrollTop ?? 0)
    restoring = true
    void nextTick(() => {
      if (node) node.scrollTop = top
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        if (node) node.scrollTop = top
        restoring = false
      })
    })
  }
  onMounted(() => {
    node = element.value ?? null
    node?.addEventListener('scroll', save, { passive: true })
    restore()
  })
  onActivated(restore)
  onBeforeUnmount(() => { cancelAnimationFrame(frame); node?.removeEventListener('scroll', save) })
}
