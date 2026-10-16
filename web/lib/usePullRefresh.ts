import { computed, onMounted, onUnmounted, ref, type Ref } from 'vue'
import { toast } from '../host'
import { reload } from '../state/store'
import { syncNow, syncState } from './sync'

/** 仅列表位于顶部、单指向下时接管；横滑、普通滚动与取消手势不触发刷新。 */
export function usePullRefresh(element: Ref<HTMLElement | null>) {
  const distance = ref(0)
  const refreshing = ref(false)
  const threshold = 64
  let start: { x: number; y: number } | null = null
  let node: HTMLElement | null = null
  const label = computed(() => refreshing.value ? '正在刷新…'
    : distance.value >= threshold ? '松开刷新' : '下拉刷新')
  async function refresh() {
    if (refreshing.value) return
    refreshing.value = true
    distance.value = 40
    try {
      await reload() // 离线也先恢复本地列表。
      await syncNow(true)
      toast(!syncState.online ? '已刷新本地内容，联网后继续同步'
        : syncState.lastError || '列表已刷新', !syncState.lastError)
    } catch { toast('刷新失败，请稍后重试', false) }
    finally { distance.value = 0; refreshing.value = false }
  }
  function cancel() { start = null; if (!refreshing.value) distance.value = 0 }
  function onStart(e: TouchEvent) {
    if (refreshing.value || e.touches.length !== 1 || (node?.scrollTop ?? 0) > 0) return
    const target = e.target as HTMLElement
    if (target.closest('input, textarea, select, video, [contenteditable="true"]')) return
    start = { x: e.touches[0].clientX, y: e.touches[0].clientY }
  }
  function onMove(e: TouchEvent) {
    if (!start) return
    if (e.touches.length !== 1 || (node?.scrollTop ?? 0) > 0) { cancel(); return }
    const dx = e.touches[0].clientX - start.x
    const dy = e.touches[0].clientY - start.y
    if (Math.abs(dx) > Math.abs(dy) || dy < 0) { cancel(); return }
    if (dy > 8 && e.cancelable) e.preventDefault()
    distance.value = Math.min(100, dy * 0.5)
  }
  function onEnd() {
    const shouldRefresh = start && distance.value >= threshold
    cancel()
    if (shouldRefresh) void refresh()
  }
  onMounted(() => {
    node = element.value
    node?.addEventListener('touchstart', onStart, { passive: true })
    node?.addEventListener('touchmove', onMove, { passive: false })
    node?.addEventListener('touchend', onEnd)
    node?.addEventListener('touchcancel', cancel)
  })
  onUnmounted(() => {
    node?.removeEventListener('touchstart', onStart)
    node?.removeEventListener('touchmove', onMove)
    node?.removeEventListener('touchend', onEnd)
    node?.removeEventListener('touchcancel', cancel)
  })
  return { distance, refreshing, label, refresh }
}
