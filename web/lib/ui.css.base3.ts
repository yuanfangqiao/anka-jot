/** Existing semantic styles, part 4. */
export const CSS_BASE_3 = `.jot-scan-corner-tl { top: -2px; left: -2px; border-top: 4px solid #3ddc84; border-left: 4px solid #3ddc84; border-top-left-radius: 0.25rem; }
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
