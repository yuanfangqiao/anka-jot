/** ui.css.menu.ts — 顶部五标签、卡片「⋯」快速菜单、待办页的语义样式。 */

export const CSS_MENU = `
/* ─── 顶部五标签：胶囊内等分；窄屏隐藏图标兜底，五个标签不挤爆胶囊 ─── */
.jot-nav-btn {
  flex: 1 1 0;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 8px 2px;
  border: 0;
  border-radius: 9999px;
  background: transparent;
  color: var(--text-1, #6a665c);
  font-size: 12.5px;
  line-height: 1.2;
  white-space: nowrap;
  cursor: pointer;
  transition: background 0.18s, color 0.18s;
  -webkit-tap-highlight-color: transparent;
}
.jot-nav-btn > svg { flex: 0 0 auto; }
.jot-nav-btn.is-on { background: var(--primary, #2f3b57); color: #fff; font-weight: 500; }
@media (max-width: 380px) {
  .jot-nav-btn > svg { display: none; }
  .jot-nav-btn { padding: 9px 2px; font-size: 12px; }
}

/* ─── 卡片「⋯」快速菜单：底部动作面板（应用内 absolute，不沉到宿主 dock 下） ─── */
.jot-menu-layer {
  position: absolute;
  inset: 0;
  z-index: 60;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  gap: 8px;
  padding: 14px 12px calc(14px + env(safe-area-inset-bottom, 0px));
  background: rgb(0 0 0 / 0.42);
  backdrop-filter: blur(2px);
  -webkit-backdrop-filter: blur(2px);
}
.jot-menu-panel {
  width: 100%;
  max-width: 420px;
  margin: 0 auto;
  padding: 6px;
  border-radius: 20px;
  background: var(--bg-1, #fff);
  box-shadow: 0 18px 44px -18px rgb(0 0 0 / 0.45);
  overflow: hidden;
}
.jot-menu-head {
  padding: 8px 14px 10px;
  overflow: hidden;
  font-size: 11px;
  color: var(--text-2, #a39e90);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.jot-menu-row {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 13px 14px;
  border: 0;
  border-radius: 14px;
  background: transparent;
  color: var(--text-0, #2c2a24);
  font-size: 15px;
  text-align: left;
  cursor: pointer;
  transition: background 0.15s;
}
.jot-menu-row:active { background: var(--bg-2, #efe9dc); }
.jot-menu-ico { flex: 0 0 auto; color: var(--text-1, #6a665c); }
.jot-menu-sep { height: 1px; margin: 4px 14px; background: var(--line, rgb(60 54 44 / 0.1)); }
.jot-menu-row.is-danger, .jot-menu-row.is-danger .jot-menu-ico { color: #c8503f; }
.jot-menu-row.is-armed { background: color-mix(in srgb, #c8503f 12%, transparent); font-weight: 500; }
.jot-menu-cancel {
  width: 100%;
  max-width: 420px;
  margin: 0 auto;
  padding: 13px;
  border: 0;
  border-radius: 20px;
  background: var(--bg-1, #fff);
  color: var(--text-0, #2c2a24);
  font-size: 15px;
  cursor: pointer;
}
.jot-menu-cancel:active { background: var(--bg-2, #efe9dc); }

/* ─── 二次确认：居中窄卡，遮罩与菜单同深度 ─── */
.jot-confirm-layer {
  position: absolute;
  inset: 0;
  z-index: 70;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgb(0 0 0 / 0.42);
  backdrop-filter: blur(2px);
  -webkit-backdrop-filter: blur(2px);
}
.jot-confirm-panel {
  width: 100%;
  max-width: 300px;
  padding: 20px 18px 14px;
  border-radius: 20px;
  background: var(--bg-1, #fff);
  box-shadow: 0 22px 48px -20px rgb(0 0 0 / 0.5);
  text-align: center;
}
.jot-confirm-title {
  font-size: 16px;
  font-weight: 600;
  line-height: 1.35;
  color: var(--text-0, #2c2a24);
}
.jot-confirm-msg {
  margin-top: 7px;
  font-size: 12.5px;
  line-height: 1.5;
  color: var(--text-2, #a39e90);
  word-break: break-word;
}
.jot-confirm-actions {
  display: flex;
  gap: 8px;
  margin-top: 18px;
}
.jot-confirm-btn {
  flex: 1 1 0;
  padding: 11px 8px;
  border: 0;
  border-radius: 13px;
  background: var(--bg-2, #efe9dc);
  color: var(--text-0, #2c2a24);
  font-size: 14px;
  cursor: pointer;
  transition: background 0.15s, opacity 0.15s;
}
.jot-confirm-btn:active { opacity: 0.82; }
.jot-confirm-btn.is-primary {
  background: var(--primary, #2f3b57);
  color: #fff;
  font-weight: 500;
}
.jot-confirm-btn.is-primary.is-danger {
  background: #c8503f;
}

/* ─── 待办页 ─── */
.jot-todo-count { font-size: 11px; color: var(--text-2, #a39e90); white-space: nowrap; }
.jot-todo-bar {
  margin-top: 8px;
  height: 3px;
  border-radius: 9999px;
  overflow: hidden;
  background: color-mix(in srgb, var(--primary, #2f3b57) 13%, transparent);
}
.jot-todo-bar > i { display: block; height: 100%; background: var(--primary, #2f3b57); transition: width 0.25s; }
/* 待办页直接复用首页卡片墙（.jot-cols / .jot-col），这里只留勾选框等局部件 */
/* 详情页待办清单的勾选框：小圆点，勾上填品牌色 */
.jot-todo-check {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 21px;
  height: 21px;
  padding: 0;
  border: 1.5px solid color-mix(in srgb, var(--text-2, #a39e90) 55%, transparent);
  border-radius: 9999px;
  background: transparent;
  color: #fff;
  font-size: 12px;
  line-height: 1;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
}
.jot-todo-check.is-checked {
  border-color: var(--primary, #2f3b57);
  background: var(--primary, #2f3b57);
}
.jot-done-toggle {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 6px 2px;
  border: 0;
  background: transparent;
  color: var(--text-2, #a39e90);
  font-size: 11.5px;
  cursor: pointer;
}
`
