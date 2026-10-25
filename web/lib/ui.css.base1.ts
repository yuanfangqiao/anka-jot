/** Existing semantic styles, part 2. */
export const CSS_BASE_1 = `
/* ─── 待办域：正文下方的结构化清单（勾选圈 / 行内可改 / 回车连续添加） ───
 *  自身限高滚动，条数多也不把正文编辑区顶出屏幕。 */
.jot-todo-block {
  margin-top: 10px;
  padding: 10px 12px;
  border-radius: 16px;
  background: var(--bg-1, #fff);
  box-shadow: 0 1px 2px rgb(60 54 44 / 0.05);
}
.jot-todo-block-head {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
}
.jot-todo-block-ico { flex: 0 0 auto; color: var(--text-2, #a39e90); }
.jot-todo-block-title { flex: 0 0 auto; font-size: 12.5px; font-weight: 500; color: var(--text-0, #2c2a24); }
.jot-todo-block-count {
  flex: 0 0 auto;
  font-size: 11px;
  color: var(--text-2, #a39e90);
  font-variant-numeric: tabular-nums;
}
.jot-todo-block-head .jot-todo-bar { flex: 1 1 auto; margin-top: 0; }
.jot-todo-block-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 1px 0;
}
.jot-todo-block-input {
  flex: 1 1 auto;
  min-width: 0;
  padding: 3px 0;
  border: 0;
  background: transparent;
  color: var(--text-0, #2c2a24);
  font-size: 14px;
  line-height: 1.5;
  outline: none;
}
.jot-todo-block-input::placeholder { color: var(--text-2, #a39e90); }
.jot-todo-block-row.is-done .jot-todo-block-input {
  color: var(--text-2, #a39e90);
  text-decoration: line-through;
}
/* 删除：桌面 hover 才显形，触屏常显但淡，避免误触 */
.jot-todo-block-del {
  flex: 0 0 auto;
  padding: 2px;
  border: 0;
  background: transparent;
  color: var(--text-2, #a39e90);
  opacity: 0;
  cursor: pointer;
  transition: opacity 0.15s;
}
.jot-todo-block-row:hover .jot-todo-block-del,
.jot-todo-block-del:focus-visible { opacity: 0.8; }
@media (hover: none) { .jot-todo-block-del { opacity: 0.4; } }
.jot-todo-block-add {
  width: 100%;
  margin-top: 6px;
  padding: 7px 10px;
  border: 1px dashed var(--line, rgb(60 54 44 / 0.14));
  border-radius: 10px;
  background: transparent;
  color: var(--text-0, #2c2a24);
  font-size: 13px;
  outline: none;
}
.jot-todo-block-add::placeholder { color: var(--text-2, #a39e90); }
.jot-todo-block-more {
  margin-top: 4px;
  padding: 2px 0;
  border: 0;
  background: transparent;
  color: var(--text-2, #a39e90);
  font-size: 12px;
  cursor: pointer;
}
.jot-todo-block-more:active { color: var(--brand, #2f3b57); }
.jot-todo-block-empty {
  margin: 2px 0 4px;
  font-size: 12px;
  color: var(--text-2, #a39e90);
}
.jot-ai-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 10px;
  border: 1px dashed var(--line, rgb(60 54 44 / 0.14));
  border-radius: 999px;
  background: transparent;
  color: var(--text-2, #a39e90);
  font-size: 11.5px;
  cursor: pointer;
}
.jot-ai-chip:active { background: var(--glass, rgb(60 54 44 / 0.05)); }
.jot-ai-chip:disabled { opacity: 0.55; }

/* ─── 搜索行：搜索框 + 右侧筛选按钮，整行不参与纵向 flex 压缩 ───
 *  flex:0 0 auto 是硬性要求：滚动区纵向 flex 内，横向滚动子项的最小高度会归零，
 *  缺了它会被时间线内容压成一条被裁切的短横（历史 bug）。 */
.jot-search-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 0 0 auto;
  width: 100%;
  max-width: 30rem;
  margin-left: auto;
  margin-right: auto;
}
.jot-search {
  flex: 1 1 auto;
  width: auto;
  max-width: none;
  min-width: 0;
  height: 38px;
  margin: 0;
}
/* 筛选按钮：38px 圆钮，与搜索框同高；激活时主色底白图标 */
.jot-filter-btn {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: 38px;
  height: 38px;
  padding: 0;
  border: 1px solid var(--line, rgb(60 54 44 / 0.08));
  border-radius: 999px;
  background: var(--bg-1, #fff);
  color: var(--text-1, #6a665c);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: background 0.2s, color 0.2s;
}
.jot-filter-btn > svg { display: block; flex: 0 0 auto; width: 16px; height: 16px; }
.jot-filter-btn:active { transform: scale(0.94); }
.jot-filter-btn.is-on {
  background: var(--primary, #2f3b57);
  border-color: transparent;
  color: #fff;
}

/* ─── 置顶横滑条：卡片与时间线同宽（--shelf-item-w 由 Home.vue 按列数注入）
 *  同样必须 flex:0 0 auto，否则会被时间线压扁（同筛选行根因）。
 *  横向滚动会同时裁剪纵向溢出，阴影留白靠条带自身 padding。 */
.jot-shelf-wrap { position: relative; flex: 0 0 auto; }
.jot-shelf {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  flex: 0 0 auto;
  width: 100%;
  padding: 2px 0 6px;
  overflow-x: auto;
  overflow-y: hidden;
  overscroll-behavior-x: contain;
  scroll-snap-type: x proximity;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
  -ms-overflow-style: none;
}
.jot-shelf::-webkit-scrollbar { display: none; }
/* 置顶区块：作为滚动区 flex 子项同样不可收缩，否则被时间线压扁 */
.jot-pin-block {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 0 0 auto;
}
/* 每项与时间线单列等宽，卡片自身比例（3:4 / 1:1 / 语音矮条）原样保留 */
.jot-shelf-item {
  flex: 0 0 var(--shelf-item-w, calc((100% - 10px) / 2));
  min-width: 0;
  display: flex;
  scroll-snap-align: start;
}
/* 左右翻页提示：仅在内容溢出且还有更多时出现（>2 张置顶） */
.jot-shelf-nav {
  position: absolute;
  top: 50%;
  z-index: 3;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  padding: 0;
  border: 1px solid var(--line, rgb(60 54 44 / 0.08));
  border-radius: 999px;
  background: var(--bg-1, #fff);
  color: var(--text-2, #6a665c);
  box-shadow: 0 2px 10px rgb(30 26 20 / 0.16);
  transform: translateY(-50%);
  cursor: pointer;
}
.jot-shelf-nav > svg { display: block; width: 15px; height: 15px; }
.jot-shelf-nav:active { transform: translateY(-50%) scale(0.92); }
.jot-shelf-nav.is-left { left: -10px; }
.jot-shelf-nav.is-right { right: -10px; }

/* ─── 日历月历网格（替代 grid / grid-cols-7 / aspect-square：
 *  部署宿主 CSS 无这些类，iOS PWA 会退化成单列竖排） ─── */

`
