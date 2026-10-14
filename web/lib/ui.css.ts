/** ui.css.ts — 插件自带语义样式表（CSS 字符串，setup 时注入一次，teardown 移除）。
 *  目的：插件关键视觉不依赖宿主 Tailwind 构建是否包含新类——
 *  部署的宿主 CSS 是「构建那一刻」的类名集合，插件后续新增的任意值类
 *  （h-[72px]/border-[5px]/columns-2 等）在旧构建里不存在，曾导致
 *  快门按钮塌缩为 0 尺寸、瀑布流退化为单列、分割线不可见。
 *  规则：布局/尺寸/边框/截断等「塌缩级」样式一律用这里的语义类；
 *  命名前缀 jot-，避免与宿主样式冲突。 */

const CSS = `
/* ─── 快门 / 录音大按钮（72px 圆钮，替代 h-[72px]/w-[72px]/border-[5px]/inset-[5px]） ─── */
.jot-shutter {
  position: relative;
  width: 72px;
  height: 72px;
  border-radius: 9999px;
  border: 5px solid #fff;
  cursor: pointer;
  transition: transform 0.2s;
  flex-shrink: 0;
}
.jot-shutter:active { transform: scale(0.9); }
.jot-shutter-inner {
  position: absolute;
  inset: 5px;
  border-radius: 9999px;
  background: #fff;
}
/* 原生拍摄模式：内芯放相机图标 */
.jot-shutter-native .jot-shutter-inner {
  display: flex;
  align-items: center;
  justify-content: center;
  color: #000;
}

/* 录音大按钮（复用快门尺寸，颜色由外部类控制） */
.jot-rec-btn {
  width: 72px;
  height: 72px;
  border-radius: 9999px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.2s;
  flex-shrink: 0;
}
.jot-rec-btn:active { transform: scale(0.9); }

/* ─── 行截断（替代 line-clamp-2/5，部分构建缺该工具类） ─── */
.jot-clamp-2, .jot-clamp-5 {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.jot-clamp-2 { -webkit-line-clamp: 2; }
.jot-clamp-5 { -webkit-line-clamp: 5; }

/* ─── 双列布局（手动瀑布流，替代 columns-2） ─── */
.jot-cols { display: flex; gap: 10px; }
.jot-col { display: flex; flex-direction: column; gap: 10px; min-width: 0; flex: 1 1 0%; }

/* ─── 常用任意值字号（部署构建缺 text-[Xpx] 时降级为父级字号，语义类保证一致） ─── */
.jot-fs-10 { font-size: 10px; }
.jot-fs-11 { font-size: 11px; }
.jot-fs-115 { font-size: 11.5px; }
.jot-fs-12 { font-size: 12px; }
.jot-fs-125 { font-size: 12.5px; }
.jot-fs-13 { font-size: 13px; }
.jot-fs-135 { font-size: 13.5px; }
.jot-fs-14 { font-size: 14px; }
.jot-fs-145 { font-size: 14.5px; }
.jot-fs-15 { font-size: 15px; }
.jot-fs-17 { font-size: 17px; }
.jot-fs-22 { font-size: 22px; }
.jot-fs-105 { font-size: 10.5px; }
.jot-leading-145 { line-height: 1.45; }

/* ─── 按压反馈（替代 active:scale-[0.985]/[0.97]） ─── */
.jot-press { transition: transform 0.2s; }
.jot-press:active { transform: scale(0.985); }
.jot-press-strong { transition: transform 0.2s; }
.jot-press-strong:active { transform: scale(0.97); }

/* ─── 波形条（替代 gap-[2.5px]/w-[3px]） ─── */
.jot-wave { display: flex; align-items: flex-end; gap: 2.5px; }
.jot-wave-bar { width: 3px; border-radius: 9999px; }

/* 图标基线对齐（替代 align-[-1px]） */
.jot-icon-inline { vertical-align: -1px; }

/* ─── Sheet 弹层（替代 backdrop-blur-[2px]/pb-[max(...)]/max-h-[70%]/max-h-[38%]） ─── */
.jot-overlay-blur { backdrop-filter: blur(2px); -webkit-backdrop-filter: blur(2px); }
.jot-safe-bottom { padding-bottom: max(1rem, env(safe-area-inset-bottom)); }
.jot-sheet-maxh { max-height: 70%; }
.jot-transcript-maxh { max-height: 38%; }

/* ─── 日历时间轴定位（替代 left-[7px]/-left-[17.5px]） ─── */
.jot-rail { position: absolute; left: 7px; }
.jot-dot { position: absolute; left: -17.5px; }

/* ─── 扫描参考框（替代 h-[70%]/w-[82%]/border-[#3ddc84] 系列） ─── */
.jot-scan-frame {
  position: relative;
  height: 70%;
  width: 82%;
  border-radius: 0.5rem;
  border: 2px dashed rgb(61 220 132 / 0.8);
}
.jot-scan-corner { position: absolute; width: 20px; height: 20px; }
.jot-scan-corner-tl { top: -2px; left: -2px; border-top: 4px solid #3ddc84; border-left: 4px solid #3ddc84; border-top-left-radius: 0.25rem; }
.jot-scan-corner-tr { top: -2px; right: -2px; border-top: 4px solid #3ddc84; border-right: 4px solid #3ddc84; border-top-right-radius: 0.25rem; }
.jot-scan-corner-bl { bottom: -2px; left: -2px; border-bottom: 4px solid #3ddc84; border-left: 4px solid #3ddc84; border-bottom-left-radius: 0.25rem; }
.jot-scan-corner-br { bottom: -2px; right: -2px; border-bottom: 4px solid #3ddc84; border-right: 4px solid #3ddc84; border-bottom-right-radius: 0.25rem; }
`

const STYLE_ID = 'jot-ui-css'

/** 幂等注入（重复 setup 不重复插入） */
export function injectUiCss(): void {
  if (document.getElementById(STYLE_ID)) return
  const el = document.createElement('style')
  el.id = STYLE_ID
  el.textContent = CSS
  document.head.appendChild(el)
}

export function removeUiCss(): void {
  document.getElementById(STYLE_ID)?.remove()
}
