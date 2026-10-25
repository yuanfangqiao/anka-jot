/** ui.css.ts — 插件自带语义样式表（CSS 字符串，setup 时注入一次，teardown 移除）。
 *  主页卡片体系类在 ui.css.cards.ts（拆分控制行数），此处拼接注入。 */
import { CSS_CARDS } from './ui.css.cards'
import { CSS_MENU } from './ui.css.menu'

/**
 *  目的：插件关键视觉不依赖宿主 Tailwind 构建是否包含新类——
 *  部署的宿主 CSS 是「构建那一刻」的类名集合，插件后续新增的任意值类
 *  （h-[72px]/border-[5px]/columns-2 等）在旧构建里不存在，曾导致
 *  快门按钮塌缩为 0 尺寸、瀑布流退化为单列、分割线不可见。
 *  规则：布局/尺寸/边框/截断等「塌缩级」样式一律用这里的语义类；
 *  命名前缀 jot-，避免与宿主样式冲突。 */

import { CSS_BASE_0 } from './ui.css.base0'
import { CSS_BASE_1 } from './ui.css.base1'
import { CSS_BASE_2 } from './ui.css.base2'
import { CSS_BASE_3 } from './ui.css.base3'
import { CSS_EDITS } from './ui.css.edits'
import { CSS_TEXT_COVER } from './ui.css.textcover'
import { CSS_DESKTOP } from './ui.css.desktop'



const STYLE_ID = 'jot-ui-css'

/** 幂等注入（重复 setup 不重复插入） */
export function injectUiCss(): void {
  if (document.getElementById(STYLE_ID)) return
  const el = document.createElement('style')
  el.id = STYLE_ID
  el.textContent = CSS_BASE_0 + CSS_BASE_1 + CSS_BASE_2 + CSS_BASE_3 + CSS_CARDS + CSS_MENU + CSS_EDITS + CSS_TEXT_COVER + CSS_DESKTOP
  document.head.appendChild(el)
}

export function removeUiCss(): void {
  document.getElementById(STYLE_ID)?.remove()
}
