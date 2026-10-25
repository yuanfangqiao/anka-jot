/** Existing semantic styles, part 3. */
export const CSS_BASE_2 = `.jot-cal-grid {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 4px;
  text-align: center;
}
.jot-cal-cell { display: block; aspect-ratio: 1 / 1; min-width: 0; }
.jot-cal-cell > button { width: 100%; height: 100%; }

/* ─── 通用语义网格（替代 grid-cols-2/3/4 与 aspect-square，宿主构建可能缺） ─── */
.jot-grid-2, .jot-grid-3, .jot-grid-4 { display: grid; gap: 8px; }
.jot-grid-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.jot-grid-3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.jot-grid-4 { grid-template-columns: repeat(4, minmax(0, 1fr)); }
.jot-sq { aspect-ratio: 1 / 1; }

/* ─── 语音气泡（播放钮 + 波形 + 时长，iMessage 风） ─── */
.jot-voicebar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 6px;
  padding: 7px 10px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--primary, #2f3b57) 7%, var(--bg-1, #fff));
  border: 1px solid color-mix(in srgb, var(--primary, #2f3b57) 14%, transparent);
}
.jot-voicebar-play {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 9999px;
  flex-shrink: 0;
  background: var(--primary, #2f3b57);
  color: #fff;
}
.jot-voicebar-wave {
  display: flex;
  align-items: center;
  gap: 2px;
  flex: 1;
  min-width: 0;
  height: 20px;
}
.jot-voicebar-bar {
  flex: 1;
  min-width: 2px;
  max-width: 3px;
  border-radius: 9999px;
  background: var(--primary, #2f3b57);
}
.jot-voicebar-dur {
  font-size: 10px;
  font-weight: 500;
  color: var(--text-1, #6a665c);
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
}

/* ─── 时间线日期分隔（双侧渐变细线 + 加粗标签） ─── */
.jot-date-sep {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 2px 4px 0;
  margin-bottom: 10px;
}
.jot-date-sep::before, .jot-date-sep::after {
  content: '';
  flex: 1;
  height: 1px;
}
.jot-date-sep::before { background: linear-gradient(to right, transparent, var(--line, rgb(60 54 44 / 0.14))); }
.jot-date-sep::after { background: linear-gradient(to left, transparent, var(--line, rgb(60 54 44 / 0.14))); }
.jot-date-sep-label {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: var(--text-1, #6a665c);
}

/* ─── 封面图加载失败渐变占位（媒体尚未同步到本机） ─── */
.jot-cover-missing {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  height: 120px;
  color: var(--text-2, #a39e90);
  background: linear-gradient(135deg,
    color-mix(in srgb, var(--primary, #2f3b57) 8%, var(--bg-2, #efe9dc)),
    var(--bg-2, #efe9dc));
  font-size: 11px;
}

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

/* ─── 日历时间轴定位（替代 left-[7px]/-left-[17.5px]/top-5） ─── */
.jot-rail { position: absolute; left: 7px; top: 8px; bottom: 8px; width: 1px; }
/* 时间轴圆点：尺寸/描边/配色一并写死，宿主部署 CSS 缺 h-2/w-2/rounded-full 时会退化成 0×0 */
.jot-dot {
  position: absolute; left: -17.5px; top: 1.25rem;
  width: 8px; height: 8px; border-radius: 9999px;
  background: var(--primary); border: 2px solid var(--bg-0);
}

/* 日期按钮：flex 纵排居中写进语义类（宿主部署 CSS 无 flex-col/items-center 时文字与点会并排） */
.jot-cal-day {
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  width: 100%; height: 100%;
}

/* ─── 月历日期打点：同样不依赖 h-1/w-1/gap-0.5/bg-white/90 等插件侧工具类 ─── */
.jot-cal-dots {
  display: flex; flex: none; justify-content: center;
  gap: 3px; height: 4px; margin: 2px auto 0; line-height: 0;
}
.jot-cal-dot {
  display: block; width: 4px; height: 4px;
  border-radius: 9999px; background: var(--primary);
}
.jot-cal-dots.is-sel .jot-cal-dot { background: #fff; opacity: 0.92; }

/* ─── 日历远端数据源的状态：翻月钮 / 说明行 / 角标 / 重试 / 骨架 ─── */
.jot-cal-nav {
  cursor: pointer; border-radius: 9999px; padding: 6px; color: var(--text-1);
  transition: background-color 0.15s ease;
}
.jot-cal-nav:hover { background: var(--glass, rgba(127, 127, 127, 0.12)); }
.jot-cal-note {
  margin-top: 8px; font-size: 11px; line-height: 1.5;
  color: var(--text-2); text-align: center;
}
.jot-cal-warn { color: var(--warn); }
.jot-cal-link { color: var(--brand); text-decoration: underline; cursor: pointer; }
.jot-cal-chip {
  display: inline-flex; align-items: center; border-radius: 9999px;
  background: var(--glass, rgba(127, 127, 127, 0.14));
  padding: 2px 8px; font-size: 10.5px; white-space: nowrap; color: var(--text-2);
}
.jot-cal-chip.is-warn { color: var(--brand); }
.jot-cal-retry {
  cursor: pointer; border-radius: 9999px;
  background: var(--glass, rgba(127, 127, 127, 0.14));
  padding: 4px 14px; font-size: 12px; color: var(--brand);
}
.jot-cal-skel {
  height: 128px; border-radius: 16px;
  background: linear-gradient(100deg,
    rgba(127, 127, 127, 0.10) 30%,
    rgba(127, 127, 127, 0.18) 50%,
    rgba(127, 127, 127, 0.10) 70%);
  background-size: 220% 100%;
  animation: jot-cal-shimmer 1.2s ease-in-out infinite;
}
@keyframes jot-cal-shimmer {
  from { background-position: 120% 0; }
  to { background-position: -60% 0; }
}
@media (prefers-reduced-motion: reduce) {
  .jot-cal-skel { animation: none; }
}

/* ─── 扫描参考框（替代 h-[70%]/w-[82%]/border-[#3ddc84] 系列） ─── */
.jot-scan-frame {
  position: relative;
  height: 70%;
  width: 82%;
  border-radius: 0.5rem;
  border: 2px dashed rgb(61 220 132 / 0.8);
}
.jot-scan-corner { position: absolute; width: 20px; height: 20px; }

`
