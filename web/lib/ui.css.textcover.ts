/** Text covers scale with their own card width, including the pinned shelf. */
export const CSS_TEXT_COVER = `
.jot-card-text { container-type: inline-size; }
.jot-text-cover {
  box-sizing: border-box;
  align-items: stretch;
  padding: clamp(16px, 8cqw, 36px) clamp(14px, 7cqw, 32px) 8px;
  text-align: left;
}
.jot-cover-content {
  display: flex;
  flex-direction: column;
  justify-content: center;
  flex: 1 1 0;
  min-height: 0;
  width: 100%;
  overflow: hidden;
}
.jot-cover-heading {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
  flex: 0 0 auto;
  margin: 0 0 0.55em;
  overflow: hidden;
  overflow-wrap: anywhere;
  font-size: clamp(16px, 6.8cqw, 32px);
  font-weight: 700;
  line-height: 1.3;
  letter-spacing: -0.025em;
  color: var(--tc-ink);
}
.jot-card.is-pinned .jot-cover-heading { padding-right: 14px; }
.jot-cover-heading:only-child { margin-bottom: 0; }
.jot-cover-body {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: var(--cover-lines, 1);
  flex: 0 0 auto;
  margin: 0;
  overflow: hidden;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
  font-size: clamp(13px, 5.5cqw, 25px);
  font-weight: 500;
  line-height: 1.45;
  letter-spacing: 0.01em;
  color: color-mix(in srgb, var(--tc-ink) 88%, transparent);
}
.jot-text-cover.is-short .jot-cover-heading { font-size: clamp(18px, 8cqw, 36px); }
.jot-text-cover.is-short .jot-cover-body { font-size: clamp(14px, 6.5cqw, 28px); }
.jot-text-cover.is-body-only .jot-cover-body {
  font-size: clamp(16px, 7cqw, 32px); font-weight: 650; line-height: 1.4;
}
.jot-text-cover.is-body-only.is-short .jot-cover-body { font-size: clamp(20px, 9cqw, 42px); }
.jot-text-cover .jot-tc-cardfoot { flex: 0 0 auto; margin-top: 12px; }
`
