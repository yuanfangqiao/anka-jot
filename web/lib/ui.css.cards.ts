/** ui.css.cards.ts — 主页卡片体系语义类（从 ui.css.ts 拆出，控制单文件 ≤300 行）。
 *  与 ui.css.ts 同规则：塌缩级样式一律走这里的 jot- 语义类，注入由 ui.css.ts 统一完成。 */

export const CSS_CARDS = `
/* ─── 主页卡片体系：固定尺寸四类卡（文字/图片/语音/复合） ─── */
/* 标准卡容器：3:4 竖卡，内容不再随图片自然高度失控 */
.jot-card-std {
  aspect-ratio: 3 / 4;
  display: flex;
  flex-direction: column;
}
/* 纯文字卡：1:1 方卡，与 3:4 竖卡错落排布 */
.jot-card-text {
  aspect-ratio: 1 / 1;
  display: flex;
  flex-direction: column;
}
/* 纯语音卡：保持长条形态（约 76px）——原语音条一字不改，只在下方补信息行。
 *  点语音条 = 播放/暂停；点信息行/卡片其余处 = 进详情编辑。 */
.jot-card-voice {
  display: flex;
  flex-direction: column;
  padding: 8px 8px 0;
}
.jot-card-voice .jot-voicebar { margin-top: 0; }
/* 卡片自带 8px 内边距，信息行只需极薄留白，保持长条紧凑 */
.jot-card-voice .jot-card-foot { padding: 2px 0 4px; }

/* ─── 置顶角标：五类卡统一落在右上角（不参与文字流，也不挤信息行）。
 *  可点击 = 取消置顶（先弹确认），因此要挡住卡片自身的「进详情」点击。 ─── */
.jot-card-pin {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 3;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  padding: 0;
  border: 0;
  border-radius: 9999px;
  background: color-mix(in srgb, var(--primary, #2f3b57) 88%, #000);
  color: #fff;
  box-shadow: 0 2px 6px rgb(0 0 0 / 0.18);
  cursor: pointer;
  transition: transform 0.16s, background 0.16s;
  -webkit-tap-highlight-color: transparent;
}
.jot-card-pin:active { transform: scale(0.9); }
/* 语音长条：给角标让出右侧时长位，避免遮住 0:12 */
.jot-card-voice.is-pinned .jot-voicebar { padding-right: 26px; }
/* 文字卡：语录首行右侧留出角标宽度 */
.jot-textcard.is-pinned .jot-tc-quote { padding-right: 14px; }
/* 复合卡：标题区右侧留白，标题不被角标压住 */
.jot-card.is-pinned .jot-comp-body { padding-right: 34px; }

/* 复合卡（3:4，与图片卡同尺寸）：上方文字 → 下方媒体 → 信息行。
 *  文字在上、媒体在下的「便签」顺序；纯图 / 纯视频卡仍是满幅封面。
 *  有清单时媒体整块换成待办域：附件让位，卡面只留 标题 / 正文 / 待办。 */
.jot-comp-body { flex: 0 0 auto; padding: 11px 12px 7px; }
/* 复合卡待办域：有清单时独占媒体位（附件整块不渲染），占满剩余高度 */
.jot-comp-todos {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 11px 12px 6px;
  overflow: hidden;
}
/* 上方已有标题/正文时，待办只留一点点缝，不再吃一整段上边距 */
.jot-comp-body + .jot-comp-todos { padding-top: 1px; }
.jot-card.is-pinned .jot-comp-todos-head { padding-right: 24px; }
.jot-comp-todos-head {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 5px;
  margin-bottom: 4px;
}
.jot-comp-todos-title {
  flex: 0 0 auto;
  font-size: 10px;
  font-weight: 500;
  letter-spacing: 0.04em;
  color: var(--text-2, #a39e90);
}
.jot-comp-todos-count {
  flex: 0 0 auto;
  font-size: 10px;
  color: var(--text-2, #a39e90);
  font-variant-numeric: tabular-nums;
}
.jot-comp-todos-bar {
  flex: 1 1 auto;
  height: 2px;
  border-radius: 9999px;
  overflow: hidden;
  background: color-mix(in srgb, var(--primary, #2f3b57) 13%, transparent);
}
.jot-comp-todos-bar > i {
  display: block;
  height: 100%;
  background: var(--primary, #2f3b57);
  transition: width 0.25s;
}
.jot-comp-todo {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  padding: 1.5px 0;
  font-size: 12px;
  line-height: 1.45;
  color: var(--text-1, #5b564a);
}
.jot-comp-todo-box {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 12px;
  height: 12px;
  border: 1px solid color-mix(in srgb, var(--text-2, #a39e90) 55%, transparent);
  border-radius: 3px;
  color: #fff;
  font-size: 8px;
  line-height: 1;
}
.jot-comp-todo.is-done .jot-comp-todo-box {
  border-color: var(--primary, #2f3b57);
  background: var(--primary, #2f3b57);
}
.jot-comp-todo-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.jot-comp-todo.is-done .jot-comp-todo-text {
  color: var(--text-2, #a39e90);
  text-decoration: line-through;
}
/* 收口贴在剩余空间底部，卡面不留悬空留白 */
.jot-comp-todos-more {
  margin-top: auto;
  padding-top: 4px;
  font-size: 9.5px;
  line-height: 1.5;
  color: var(--text-2, #a39e90);
}
.jot-comp-media { position: relative; flex: 1 1 auto; min-height: 0; overflow: hidden; }
.jot-comp-media > img, .jot-comp-media video { width: 100%; height: 100%; object-fit: cover; display: block; }
.jot-comp-media > .jot-cover-missing { height: 100%; }
/* 语音条作为主媒体：垂直居中，两侧留白，底部一点品牌色晕染托住 */
.jot-comp-voicepad {
  height: 100%;
  display: flex;
  align-items: center;
  padding: 0 12px;
  background: linear-gradient(180deg, transparent, color-mix(in srgb, var(--primary, #2f3b57) 7%, transparent));
}
.jot-comp-voicepad .jot-voicebar { flex: 1 1 auto; margin-top: 0; }
/* 图 + 语音：语音收成封面上的玻璃小胶囊，不抢版面 */
.jot-comp-voicechip {
  position: absolute;
  left: 8px;
  bottom: 8px;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 5px 9px 5px 7px;
  border: 0;
  border-radius: 9999px;
  background: rgb(0 0 0 / 0.45);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  color: #fff;
  font-size: 10px;
  line-height: 1;
  font-variant-numeric: tabular-nums;
  cursor: pointer;
}

/* 文字彩卡：哈希取色底（--tc-bg 由 lib/color.ts 注入）+ 纸感噪点 + 内高光 + 居中大字号 */
.jot-textcard {
  --tc-ink: #2b2b26;
  --tc-ink2: rgb(43 43 38 / 0.6);
  position: relative;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 12px 11px 6px;
  background-color: var(--tc-bg, #ede6d6);
  color: var(--tc-ink);
  overflow: hidden;
}
/* 低透明度噪点纹理防眩（feTurbulence 纸感），叠加顶部内高光线 */
.jot-textcard::before {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='120' height='120' filter='url(%23n)' opacity='0.5'/%3E%3C/svg%3E");
  opacity: 0.28;
  mix-blend-mode: overlay;
}
.jot-textcard::after {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.45), inset 0 -1px 0 rgb(0 0 0 / 0.04);
}
.jot-textcard > * { position: relative; }
/* 语录卡正文：居中大字号、行距宽松，最多 4 行（1:1 方卡要给信息行留位置） */
.jot-tc-quote {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 4;
  overflow: hidden;
  font-size: 14px;
  font-weight: 600;
  line-height: 1.65;
  letter-spacing: 0.01em;
  word-break: break-word;
}
.jot-tc-sub {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
  margin-top: 6px;
  font-size: 11px;
  line-height: 1.5;
  color: var(--tc-ink2);
}
/* 语录卡复用 CardFoot：占满整行才能贴右（父级 align-items:center 会把窄内容收缩居中） */
.jot-textcard .jot-tc-cardfoot {
  margin-top: auto;
  width: 100%;
  min-height: 24px;
  padding: 6px 0 0;
  font-size: 10px;
  color: var(--tc-ink2);
}
.jot-tc-cardfoot .jot-more { color: var(--tc-ink2); margin-right: -5px; }
/* 深色主题：彩底降明度、文字转浅色，保持柔和不刺眼 */
html[data-theme='dark'] .jot-textcard {
  --tc-ink: #efece3;
  --tc-ink2: rgb(239 236 227 / 0.55);
  background-color: color-mix(in srgb, var(--tc-bg, #ede6d6) 22%, #26251f);
}

/* 图片卡 / 视频卡封面：满幅 object-cover，在固定比例内裁切 */
.jot-imgcard { position: relative; flex: 1; min-height: 0; overflow: hidden; }
.jot-imgcard > img { width: 100%; height: 100%; object-fit: cover; display: block; }
.jot-imgcard > .jot-cover-missing { height: 100%; }
/* 视频卡：中央 ▶ 播放徽章 + 左下时长角标（父容器需 relative，jot-imgcard/jot-comp-media 已是） */
.jot-vid-play {
  position: absolute;
  inset: 0;
  margin: auto;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: 9999px;
  background: rgb(0 0 0 / 0.45);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  color: #fff;
  pointer-events: none;
}
.jot-vid-dur {
  position: absolute;
  left: 8px;
  bottom: 8px;
  padding: 2px 7px;
  border-radius: 9999px;
  background: rgb(0 0 0 / 0.45);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  color: #fff;
  font-size: 10px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
  pointer-events: none;
}
/* 详情页视频块：16:9 海报块，点击全屏播放 */
.jot-videocard {
  position: relative;
  overflow: hidden;
  border-radius: 12px;
  background: #000;
  aspect-ratio: 16 / 9;
  cursor: pointer;
}
.jot-videocard > img { width: 100%; height: 100%; object-fit: cover; display: block; }

/* 多图角标（x张 玻璃贴）与复合卡图区迷你播放钮 */
.jot-imgbadge {
  position: absolute;
  top: 8px;
  right: 8px;
  padding: 2px 7px;
  border-radius: 9999px;
  background: rgb(0 0 0 / 0.45);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  color: #fff;
  font-size: 10px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
}
/* 卡片底部信息行：左 = 置顶/收藏/同步点 + 时间（+标题），右 = 「⋯」快速菜单 */
.jot-card-foot {
  margin-top: auto;
  display: flex;
  align-items: center;
  gap: 4px;
  min-height: 30px;
  padding: 4px 8px 4px 10px;
  font-size: 10px;
  color: var(--text-2, #a39e90);
}
.jot-card-meta {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: 1 1 auto;
  min-width: 0;
}
.jot-card-time { flex: 0 0 auto; white-space: nowrap; font-variant-numeric: tabular-nums; }
.jot-card-title { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.jot-fav-mini { flex: 0 0 auto; color: var(--warn, #d99a2b); }
/* 待办标志：卡片脚注的小图标，与收藏星并列；琥珀色与顶栏待办标志（实心琥珀胶囊）一致 */
.jot-todo-mini {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  color: var(--warn, #d99a2b);
}
/* 待办卡还没有事项：占住剩余空间，低调提示而不是留白 */
.jot-comp-todos-empty {
  flex: 1 1 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0;
  padding: 12px;
  font-size: 11px;
  color: var(--text-2, #a39e90);
}
/* 待办进度：与时间同排的小胶囊，全部完成时转绿，卡片上一眼可读 */
.jot-card-todo {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 0 5px;
  border-radius: 9999px;
  background: color-mix(in srgb, var(--primary, #2f3b57) 10%, transparent);
  color: var(--primary, #2f3b57);
  font-size: 10px;
  line-height: 15px;
  font-variant-numeric: tabular-nums;
}
.jot-card-todo.is-all { background: rgb(64 145 108 / 0.12); color: #40916c; }
.jot-sync-dot {
  flex: 0 0 auto;
  width: 5px;
  height: 5px;
  border-radius: 9999px;
  background: var(--warn, #d9a441);
}
/* 「⋯」：内联三点，不赌宿主图标集里有没有 MoreHorizontal；26px 视觉、30px 热区 */
.jot-more {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  margin: -5px -2px -5px 0;
  padding: 0;
  border: 0;
  border-radius: 9999px;
  background: transparent;
  color: var(--text-2, #a39e90);
  cursor: pointer;
  transition: background 0.15s;
}
.jot-more:active { background: color-mix(in srgb, var(--text-2, #a39e90) 18%, transparent); }
.jot-dots { display: inline-flex; align-items: center; gap: 2.5px; }
.jot-dots > i { display: block; width: 3px; height: 3px; border-radius: 9999px; background: currentColor; }

/* ─── 置顶横滑条：与时间线卡片同尺寸，内里不做任何缩放/隐藏 ─── */
.jot-shelf-item > .jot-card { width: 100%; }
`
