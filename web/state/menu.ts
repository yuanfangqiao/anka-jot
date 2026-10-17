/** menu.ts — 卡片「⋯」快速菜单的全局状态。
 *  菜单挂在 App 根部（absolute 覆盖层），卡片只负责把当前笔记塞进来，
 *  避免面板被卡片自身 overflow:hidden 裁掉、也避免 Teleport 到宿主 body 沉到底部 dock 下。 */
import { ref } from 'vue'
import type { JotNote } from '../host'

export const menuNote = ref<JotNote | null>(null)

export function openCardMenu(note: JotNote) {
  menuNote.value = note
}

export function closeCardMenu() {
  menuNote.value = null
}
