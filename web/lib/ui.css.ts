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

const CSS = `
.jot-media-preview { width: 100%; height: 100%; overflow: hidden; }
.jot-media-preview > .jot-cover-missing { height: 100%; padding: 12px; text-align: center; }
.jot-media-preview > img, .jot-media-preview > video { width: 100%; height: 100%; object-fit: cover; }
.jot-refresh-list { overscroll-behavior-y: contain; }
.jot-refresh-status { flex-shrink: 0; overflow: hidden; text-align: center; color: var(--text-2); font-size: 12px; }

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

/* ─── 主容器响应式宽度（替代 max-w-2xl/md:max-w-3xl，宿主构建缺 md: 变体） ─── */
.jot-container { width: 100%; margin-left: auto; margin-right: auto; }
@media (min-width: 768px) { .jot-container { max-width: 46rem; } }
@media (min-width: 1280px) { .jot-container { max-width: 68rem; } }

/* 顶部导航胶囊限宽（iPad 上不随容器拉满） */
.jot-nav { max-width: 24rem; margin-left: auto; }

/* ─── 笔记卡（大圆角 + 发丝边框 + 分层柔影 + 按压反馈） ─── */
.jot-card {
  position: relative;
  cursor: pointer;
  overflow: hidden;
  border-radius: 14px;
  background: var(--bg-1, #fff);
  border: 1px solid var(--line, rgb(60 54 44 / 0.08));
  box-shadow: 0 1px 2px rgb(60 54 44 / 0.04), 0 12px 32px -16px rgb(60 54 44 / 0.22);
  transition: transform 0.2s, box-shadow 0.2s;
}
.jot-card:active { transform: scale(0.97); }

/* ─── 首页通栏方块工具条（与宿主胶囊 dock 形状区分；玻璃质感 + 发丝顶边） ───
 *  安全区由宿主 dock 负责：这里不再叠加 env(safe-area-inset-bottom)，
 *  否则 iOS PWA 会在按钮行下方多出一大块空白（Android 为 0 故正常）。 */
.jot-bar-wrap {
  position: absolute;
  left: 0; right: 0; bottom: 0;
  padding: 8px 14px 10px;
  background: color-mix(in srgb, var(--bg-1, #fff) 86%, transparent);
  backdrop-filter: blur(20px) saturate(1.6);
  -webkit-backdrop-filter: blur(20px) saturate(1.6);
  border-top: 1px solid var(--line, rgb(60 54 44 / 0.08));
}
.jot-bar { display: flex; align-items: center; }
.jot-bar-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  color: var(--tile, var(--primary, #2f3b57));
  transition: transform 0.2s;
}
.jot-bar-item:active { transform: scale(0.92); }
/* 圆形淡彩片：1px 同色发丝边 + 同色系低饱和底（18% 提亮）+ 全强度同色图标。
 *  配色逻辑=同一色相三级台阶：底 18% / 边 30% / 图标 100%，天然高对比且不刺眼。 */
.jot-bar-tile {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: color-mix(in srgb, var(--tile, var(--primary, #2f3b57)) 18%, transparent);
  border: 1px solid color-mix(in srgb, var(--tile, var(--primary, #2f3b57)) 34%, transparent);
  color: inherit;
}
/* iOS Safari：SVG 作为 flex 子项会被压到极窄（看起来像一根短竖线），
 * 这里锁定尺寸并禁止收缩，覆盖宿主的全局 svg 规则 */
.jot-bar-tile > svg {
  display: block;
  width: 22px;
  height: 22px;
  flex: 0 0 auto;
  min-width: 22px;
}
/* 五入口各一色（同为深色系，白图标保证对比度） */
.jot-bar-item-text { --tile: #2f3b57; }    /* 藏蓝 */
.jot-bar-item-camera { --tile: #2e6a5e; }  /* 墨绿 */
.jot-bar-item-video { --tile: #4c3f8f; }   /* 靛紫 */
.jot-bar-item-album { --tile: #a9662c; }   /* 赭橙 */
.jot-bar-item-voice { --tile: #8e3b57; }   /* 酒红 */
/* 深色宿主：提亮一档，避免深底深贴糊在一起 */
html[data-theme='dark'] .jot-bar-item-text { --tile: #7d8fbd; }
html[data-theme='dark'] .jot-bar-item-camera { --tile: #5aa593; }
html[data-theme='dark'] .jot-bar-item-video { --tile: #8a7bd0; }
html[data-theme='dark'] .jot-bar-item-album { --tile: #c98a4b; }
html[data-theme='dark'] .jot-bar-item-voice { --tile: #bb6a86; }
/* 纯图标形态：标签隐藏（保留节点以便随时恢复） */
.jot-bar-label { display: none; }

/* 滚动区底部留白（避让通栏工具条；替代 pb-24，宿主构建可能缺该类） */
.jot-scroll-pad { padding-bottom: 92px; }

/* ─── 详情页骨架（替代 h-full/mx-auto/max-w-2xl/px-4/pb-28 与顶栏 sticky 工具类：
 *  部署宿主构建常缺这些类，导致底部按钮被下缘裁掉、返回键缩进不齐） ─── */
.jot-detail {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 42rem;
  height: 100%;
  margin: 0 auto;
  padding: 12px 16px 32px;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior-y: contain;
}
.jot-detail-head {
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  gap: 2px;
  margin: 0 -16px;
  padding: 4px 14px 4px 16px;
  background: color-mix(in srgb, var(--bg-0, #f6f2e9) 88%, transparent);
  backdrop-filter: blur(18px) saturate(1.4);
  -webkit-backdrop-filter: blur(18px) saturate(1.4);
}
/* 图标按钮：抹平宿主全局 button 的内边距，36px 圆点按区，图形天然居中 */
.jot-icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: 36px;
  height: 36px;
  padding: 0;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--text-1, #6a665c);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.jot-icon-btn:active { background: var(--glass, rgb(60 54 44 / 0.05)); }
.jot-icon-btn-danger { color: var(--err, #d94f4f); }
/* 已收藏：琥珀色实心星（未收藏沿用顶栏默认灰） */
.jot-fav-on { color: var(--warn, #d99a2b); }
/* 卡片角标处的收藏星：小、实心、琥珀色，与置顶图钉并列 */
.jot-fav-mini { flex: 0 0 auto; color: var(--warn, #d99a2b); }
/* 返回键图形与正文左缘对齐（按钮内 8px 留白向外抵消） */
.jot-detail-head > .jot-icon-btn:first-child { margin-left: -8px; }
.jot-head-spacer { flex: 1 1 auto; }
/* 底部附件入口：允许换行，手机窄屏不溢出；下留白由 .jot-detail 承担 */
.jot-detail-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 20px;
}
/* AI 摘要幽灵胶囊：低调到不抢正文，需要时才被看见 */
.jot-detail-ai { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }

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
.jot-cal-grid {
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
.jot-dot { position: absolute; left: -17.5px; top: 1.25rem; }

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

/* ─── 详情页工作台布局（小红书式）：上半文字（自身滚动）/ 下半附件缩略 ───
 *  之前图片九宫格 + 整宽音频卡把正文挤到只剩两三行；改为文字区吃满剩余高度、
 *  附件收进横向缩略条，语音就地播放，转写稿默认折叠。 */
.jot-detail {
  overflow: hidden;
  padding-bottom: 14px;
}
.jot-editor-pane {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-height: 0;
  margin: 0 -4px;
  padding: 0 4px 6px;
  overflow-y: auto;
  overscroll-behavior-y: contain;
  -webkit-overflow-scrolling: touch;
}
.jot-editor-title {
  width: 100%;
  margin-top: 6px;
  padding: 0;
  border: 0;
  background: transparent;
  font-size: 22px;
  font-weight: 700;
  color: var(--text-0, #2c2a24);
  outline: none;
}
.jot-editor-title::placeholder { color: color-mix(in srgb, var(--text-2, #a39e90) 70%, transparent); }
.jot-editor-text {
  flex: 1 1 auto;
  width: 100%;
  min-height: 96px;
  margin-top: 6px;
  padding: 0;
  border: 0;
  background: transparent;
  resize: none;
  overflow-y: auto;
  font-size: 15px;
  line-height: 1.65;
  color: var(--text-0, #2c2a24);
  outline: none;
}
.jot-editor-text::placeholder { color: color-mix(in srgb, var(--text-2, #a39e90) 70%, transparent); }
/* 有待办时正文不再撑满：压到最小可用高度，待办域紧跟其后露出来 */
.jot-editor-text.has-todos { flex: 0 0 auto; }
.jot-tag-row { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-top: 12px; }
.jot-detail-actions { margin-top: 10px; }

/* 附件条：标题行 + 横滑缩略 */
.jot-media-block { flex: 0 0 auto; margin-top: 2px; }
.jot-media-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 0 2px; }
.jot-media-count { font-size: 11px; color: var(--text-2, #a39e90); }
.jot-media-toggle {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 3px 9px;
  border: 0;
  border-radius: 999px;
  background: color-mix(in srgb, var(--primary, #2f3b57) 8%, transparent);
  color: var(--text-1, #6a665c);
  font-size: 11px;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.jot-media-toggle:active { background: color-mix(in srgb, var(--primary, #2f3b57) 14%, transparent); }
.jot-mshelf {
  display: flex;
  align-items: stretch;
  gap: 8px;
  flex: 0 0 auto;
  width: 100%;
  padding: 6px 2px 4px;
  overflow-x: auto;
  overflow-y: hidden;
  overscroll-behavior-x: contain;
  scroll-snap-type: x proximity;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
  -ms-overflow-style: none;
}
.jot-mshelf::-webkit-scrollbar { display: none; }
/* 统一 3:4 瓷贴：图片/视频缩略 + 语音深色卡，一屏可看四五张 */
.jot-mshelf-item {
  position: relative;
  flex: 0 0 auto;
  width: 86px;
  height: 110px;
  padding: 0;
  border: 1px solid var(--line, rgb(60 54 44 / 0.08));
  border-radius: 13px;
  overflow: hidden;
  background: var(--bg-2, #efe9dc);
  cursor: pointer;
  scroll-snap-align: start;
  transition: transform 0.15s;
  -webkit-tap-highlight-color: transparent;
}
.jot-mshelf-item:active { transform: scale(0.97); }
.jot-mshelf-item > .jot-media-preview { width: 100%; height: 100%; }
.jot-mshelf-play {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}
.jot-mshelf-play > span {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: 999px;
  background: rgb(0 0 0 / 0.42);
  color: #fff;
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
}
.jot-mshelf-badge {
  position: absolute;
  right: 5px;
  bottom: 5px;
  padding: 1px 6px;
  border-radius: 999px;
  background: rgb(0 0 0 / 0.5);
  color: #fff;
  font-size: 10px;
  line-height: 1.5;
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
}
.jot-mshelf-badge.is-ocr { left: 5px; right: auto; cursor: pointer; }
.jot-mshelf-badge.is-done { background: color-mix(in srgb, var(--ok, #3f9b6d) 76%, transparent); }
/* 语音瓷贴：深色底 + 居中播放钮 + 底部时长 + 细进度条 */
.jot-mshelf-audio {
  background: linear-gradient(155deg, #3b4763, #2a3247 62%, #232a3b);
  border-color: transparent;
}
.jot-mshelf-audio .jot-mshelf-play > span {
  background: rgb(255 255 255 / 0.2);
  border: 1px solid rgb(255 255 255 / 0.3);
}
.jot-mshelf-audio-meta {
  position: absolute;
  left: 7px;
  bottom: 6px;
  display: flex;
  align-items: center;
  gap: 3px;
  color: rgb(255 255 255 / 0.84);
  font-size: 10.5px;
}
.jot-mshelf-progress {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 2px;
  background: rgb(255 255 255 / 0.18);
}
.jot-mshelf-progress > i { display: block; height: 100%; width: 0; background: #fff; transition: width 0.12s linear; }

/* 转写稿：默认折叠，展开后自身滚动（不把正文再压回两三行） */
.jot-transcript-panel {
  max-height: 30vh;
  overflow-y: auto;
  margin-top: 6px;
  padding: 10px 12px;
  border: 1px solid var(--line, rgb(60 54 44 / 0.08));
  border-radius: 14px;
  background: var(--bg-1, #fff);
  overscroll-behavior-y: contain;
}
.jot-transcript-group + .jot-transcript-group { margin-top: 10px; padding-top: 8px; border-top: 1px dashed var(--line, rgb(60 54 44 / 0.1)); }
.jot-transcript-label { margin-bottom: 4px; font-size: 11px; font-weight: 500; letter-spacing: 0.02em; color: var(--text-2, #a39e90); }
`

const STYLE_ID = 'jot-ui-css'

/** 幂等注入（重复 setup 不重复插入） */
export function injectUiCss(): void {
  if (document.getElementById(STYLE_ID)) return
  const el = document.createElement('style')
  el.id = STYLE_ID
  el.textContent = CSS + CSS_CARDS + CSS_MENU
  document.head.appendChild(el)
}

export function removeUiCss(): void {
  document.getElementById(STYLE_ID)?.remove()
}
