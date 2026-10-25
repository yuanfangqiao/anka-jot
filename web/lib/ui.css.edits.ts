/** Only the approved editor, recovery and task-action fixes. */
export const CSS_EDITS = `
.jot-detail { overflow-y: auto; overflow-x: hidden; padding-bottom: 24px; }
.jot-detail > * { flex-shrink: 0; }
.jot-editor-pane { flex: 0 0 auto; min-height: auto; overflow: visible; }
.jot-editor-text, .jot-editor-text.has-todos {
  display: block; box-sizing: border-box; flex: 0 0 auto; overflow: hidden; min-height: 96px;
}
.jot-transcript-panel { max-height: none; overflow: visible; }
.jot-update-notice { padding: 8px; margin: 4px 0; color: var(--text-1); font-size: 12px; background: var(--bg-1); border-radius: 10px; }
.jot-update-notice button { color: var(--primary); margin-left: 8px; cursor: pointer; }
.jot-history { margin-top: 10px; }
.jot-history-list { font-size: 12px; color: var(--text-1); }
.jot-history-item { padding: 10px 0; border-bottom: 1px solid var(--line); }
.jot-history-text { white-space: pre-wrap; overflow-wrap: anywhere; margin: 6px 0; }
.jot-card-check {
  box-sizing: content-box; display: inline-flex; justify-content: center; align-items: center;
  flex-shrink: 0; cursor: pointer; position: relative; background: transparent; color: inherit; padding: 0;
}
.jot-card-check::after { content: ''; position: absolute; inset: -9px; }
.jot-card-check:disabled { cursor: default; }
.jot-card-undo { color: var(--primary); background: var(--bg-1); font-size: 12px; padding: 8px 12px; border-radius: 10px; cursor: pointer; }
.jot-undo-notice { position: absolute; z-index: 30; left: 50%; bottom: 12px; transform: translateX(-50%); display: flex; align-items: center; gap: 8px; padding: 6px 10px; border: 1px solid var(--line); border-radius: 14px; background: var(--bg-1); color: var(--text-0); font-size: 12px; white-space: nowrap; }
`
