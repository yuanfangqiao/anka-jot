/** useColCount — 时间线响应式列数（JS matchMedia，不赌宿主 md:/lg: 变体是否存在）：
 *  手机 2 列 / ≥768px 3 列 / ≥1280px 4 列。首页与收藏页共用。 */
import { onBeforeUnmount, onMounted, ref } from 'vue'

const MQ = ['(min-width: 1280px)', '(min-width: 768px)'] as const

export function useColCount() {
  const colCount = ref(2)
  const mqs: MediaQueryList[] = []

  function sync() {
    colCount.value = window.matchMedia(MQ[0]).matches ? 4
      : window.matchMedia(MQ[1]).matches ? 3 : 2
  }

  onMounted(() => {
    for (const q of MQ) {
      const m = window.matchMedia(q)
      m.addEventListener('change', sync)
      mqs.push(m)
    }
    sync()
  })
  onBeforeUnmount(() => {
    for (const m of mqs) m.removeEventListener('change', sync)
    mqs.length = 0
  })

  return colCount
}

/** 均分 N 列（短列优先）：卡片高度未知时最稳的瀑布流近似 */
export function splitCols<T>(list: T[], n: number): T[][] {
  const cols: T[][] = Array.from({ length: n }, () => [])
  for (const it of list) {
    let min = 0
    for (let i = 1; i < n; i++) if (cols[i].length < cols[min].length) min = i
    cols[min].push(it)
  }
  return cols
}
