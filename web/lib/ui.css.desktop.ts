/** Shared tablet/desktop polish, aligned with the host 640px breakpoint. */
export const CSS_DESKTOP = `
@media (min-width: 640px) {
  .jot-container { max-width: 68rem; }
  .jot-bar-wrap { padding: 3px 16px; }
  .jot-bar { justify-content: center; gap: 8px; }
  .jot-bar-item {
    box-sizing: border-box;
    flex: 0 0 auto;
    flex-direction: row;
    justify-content: center;
    gap: 8px;
    min-width: 90px;
    height: 40px;
    padding: 4px 12px;
    border: 1px solid transparent;
    border-radius: 12px;
    background: transparent;
    transition: background 0.16s, border-color 0.16s, transform 0.16s;
  }
  .jot-bar-item:hover {
    background: color-mix(in srgb, var(--tile) 7%, transparent);
    border-color: color-mix(in srgb, var(--tile) 12%, transparent);
  }
  .jot-bar-item:active { transform: scale(0.97); }
  .jot-bar-item:focus-visible { outline: 2px solid var(--primary); outline-offset: 1px; }
  .jot-bar-tile {
    box-sizing: border-box;
    flex: 0 0 auto;
    width: 28px;
    height: 28px;
    border-radius: 9px;
    background: color-mix(in srgb, var(--tile) 11%, transparent);
    border-color: color-mix(in srgb, var(--tile) 23%, transparent);
  }
  .jot-bar-tile > svg { width: 17px; min-width: 17px; height: 17px; }
  .jot-bar-label {
    display: block;
    font-size: 12px;
    font-weight: 500;
    line-height: 1;
    color: var(--text-1);
  }
  .jot-refresh-list.jot-scroll-pad { padding-bottom: 64px; }
}
`
