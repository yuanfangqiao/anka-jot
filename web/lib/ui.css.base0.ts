/** Existing semantic styles, part 1. */
export const CSS_BASE_0 = `
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

/* The home owns the full app width; only its scrollable content is constrained. */
.jot-home {
  box-sizing: border-box;
  position: relative;
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-height: 0;
  padding-top: 8px;
}

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
/* 顶栏三键（置顶 / 待办 / 收藏）的开态：
 *  黑色描边 + 金色填充由 Detail.vue 内联到 <button>（类会被 .jot-icon-btn 的颜色规则盖掉）；
 *  待办图标是纯线段、无法填充，用下面这个叠层容器做「金线包墨边」：
 *  两层同一路径同心叠加，下层加粗的墨线露出外缘当框、上层细金线当芯。 */
/* 尺寸与 Detail.vue 里图标的 :size="17" 对应，改尺寸要同步改这里 */
.jot-flag-stack { position: relative; display: inline-flex; width: 17px; height: 17px; }
.jot-flag-stack > svg { position: absolute; inset: 0; }
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

`
