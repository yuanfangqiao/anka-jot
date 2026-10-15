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
/* 语音小卡：约 64px 矮条，整条 = 语音条（点击播放/暂停），时间戳绝对定位于右下角 */
.jot-card-voice {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
  height: 64px;
  cursor: pointer;
}
.jot-vc-time {
  position: absolute;
  right: 8px;
  bottom: 4px;
  font-size: 9px;
  line-height: 1;
  color: var(--text-2, #a39e90);
  font-variant-numeric: tabular-nums;
  pointer-events: none;
}
.jot-vc-play {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: 9999px;
  flex-shrink: 0;
  background: var(--primary, #2f3b57);
  color: #fff;
  transition: transform 0.2s;
}
.jot-card-voice:active .jot-vc-play { transform: scale(0.88); }

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
  padding: 14px 12px 8px;
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
/* 复合卡（语音+文字无图）退化形态：彩卡内播放钮保持绝对定位 */
.jot-textcard > .jot-comp-play { position: absolute; }
/* 语录卡正文：居中大字号、行距宽松，最多 6 行 */
.jot-tc-quote {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 6;
  overflow: hidden;
  font-size: 15px;
  font-weight: 600;
  line-height: 1.7;
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
.jot-tc-foot {
  margin-top: auto;
  padding-top: 8px;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
  font-size: 10px;
  color: var(--tc-ink2);
}
/* 深色主题：彩底降明度、文字转浅色，保持柔和不刺眼 */
html[data-theme='dark'] .jot-textcard {
  --tc-ink: #efece3;
  --tc-ink2: rgb(239 236 227 / 0.55);
  background-color: color-mix(in srgb, var(--tc-bg, #ede6d6) 22%, #26251f);
}

/* 图片卡 / 复合卡图区：满幅 object-cover，固定比例内裁切 */
.jot-imgcard { position: relative; flex: 1; min-height: 0; overflow: hidden; }
.jot-imgcard > img { width: 100%; height: 100%; object-fit: cover; display: block; }
.jot-imgcard > .jot-cover-missing { height: 100%; }
.jot-comp-img { position: relative; height: 56%; flex-shrink: 0; overflow: hidden; }
.jot-comp-img > img { width: 100%; height: 100%; object-fit: cover; display: block; }
.jot-comp-img > .jot-cover-missing { height: 100%; }
.jot-comp-body { flex: 1; min-height: 0; padding: 7px 10px 0; }
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
.jot-comp-play {
  position: absolute;
  right: 8px;
  bottom: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: 9999px;
  background: rgb(0 0 0 / 0.5);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  color: #fff;
}

/* 卡片底部信息行：仅时间 + 同步状态点 */
.jot-card-foot {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 7px 10px;
  font-size: 10px;
  color: var(--text-2, #a39e90);
}
`
