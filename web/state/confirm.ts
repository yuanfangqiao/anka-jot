/** confirm.ts — 应用内二次确认弹层状态（App 根部渲染，卡片只发请求）。
 *  Promise 式调用：`const ok = await askConfirm({...})`，避免 native confirm 打断体验。 */
import { ref } from 'vue'

export interface ConfirmReq {
  title: string
  message?: string
  confirmText?: string
  cancelText?: string
  /** 确认按钮用警示色（取消置顶 / 删除等） */
  danger?: boolean
}

export const confirmReq = ref<ConfirmReq | null>(null)
let resolver: ((ok: boolean) => void) | null = null

/** 新请求会先否掉未决的旧请求，避免弹层被覆盖后 Promise 悬挂 */
export function askConfirm(req: ConfirmReq): Promise<boolean> {
  resolver?.(false)
  confirmReq.value = req
  return new Promise<boolean>(res => { resolver = res })
}

export function settleConfirm(ok: boolean) {
  const r = resolver
  resolver = null
  confirmReq.value = null
  r?.(ok)
}

export function cancelConfirm() { settleConfirm(false) }
