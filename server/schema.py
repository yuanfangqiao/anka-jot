"""即刻 Jot — SQLite 持久化层（线程安全：每次调用独立连接）。

表：notes / atts / tags / media / kv。notes.rev 全局单调递增（服务端权威），
LWW 依据：客户端 rev 取自上次同步时的 serverRev 副本 —— v1 采用笔记级 LWW：
client_rev >= server_rev 则覆盖，否则保留服务端并回传。
"""

import base64
import bisect
import json
import re
import sqlite3
import time
import uuid
from contextlib import closing
from pathlib import Path

SCHEMA = """
CREATE TABLE IF NOT EXISTS notes(
  id TEXT PRIMARY KEY, title TEXT DEFAULT '', text TEXT DEFAULT '',
  tags TEXT DEFAULT '[]', source TEXT DEFAULT 'text',
  createdAt REAL, updatedAt REAL, pinned INTEGER DEFAULT 0,
  fav INTEGER DEFAULT 0, todo INTEGER DEFAULT 0, todos TEXT DEFAULT '[]',
  color TEXT, location TEXT, deleted INTEGER DEFAULT 0, rev INTEGER DEFAULT 0);
CREATE INDEX IF NOT EXISTS idx_notes_updated ON notes(updatedAt DESC);
-- 日历天列表：排序与 keyset 定位（(createdAt,id) 复合，毫秒并列也稳定）
CREATE INDEX IF NOT EXISTS idx_notes_created ON notes(createdAt DESC, id DESC);
-- 日历整月计数：只索引存活行，区间 COUNT 走 index-only scan
CREATE INDEX IF NOT EXISTS idx_notes_alive_created ON notes(createdAt) WHERE deleted=0;
CREATE TABLE IF NOT EXISTS atts(
  id TEXT PRIMARY KEY, noteId TEXT, kind TEXT, serverPath TEXT, thumbPath TEXT,
  width REAL, height REAL, duration REAL, peaks TEXT, ocrText TEXT,
  transcript TEXT, sha256 TEXT, size INTEGER, createdAt REAL);
CREATE INDEX IF NOT EXISTS idx_atts_note ON atts(noteId);
CREATE TABLE IF NOT EXISTS tags(
  name TEXT PRIMARY KEY, color TEXT, pinned INTEGER DEFAULT 0, lastUsedAt REAL);
CREATE TABLE IF NOT EXISTS media(
  sha256 TEXT PRIMARY KEY, path TEXT, size INTEGER, kind TEXT, createdAt REAL);
CREATE TABLE IF NOT EXISTS kv(k TEXT PRIMARY KEY, v TEXT);
CREATE TABLE IF NOT EXISTS note_mutations(id TEXT PRIMARY KEY, noteId TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS note_history(
  id TEXT PRIMARY KEY, noteId TEXT NOT NULL, at REAL, reason TEXT, snapshot TEXT);
CREATE INDEX IF NOT EXISTS idx_note_history ON note_history(noteId,at DESC);
"""

NOTE_COLS = ('id', 'title', 'text', 'tags', 'source', 'createdAt', 'updatedAt',
             'pinned', 'fav', 'todo', 'todos', 'color', 'location', 'deleted', 'rev')
# 日历卡片投影：不带全文（MAX_TEXT_LEN 20 万，逐条回传会让单页膨胀到 MB 级）
CARD_COLS = ('id', 'title', 'tags', 'source', 'createdAt', 'updatedAt',
             'pinned', 'fav', 'todo', 'todos', 'color', 'location', 'rev')
CARD_SQL = (f'{",".join(CARD_COLS)}, '
            "COALESCE(substr(text,1,600),'') AS preview, "
            "COALESCE(length(text),0) AS textLen")
CARD_FIELDS = CARD_COLS + ('preview', 'textLen')
ATT_COLS = ('id', 'noteId', 'kind', 'serverPath', 'thumbPath', 'width', 'height',
            'duration', 'peaks', 'ocrText', 'transcript', 'sha256', 'size', 'createdAt')
JSON_FIELDS = {'tags', 'location', 'peaks', 'transcript', 'todos'}
BOOL_FIELDS = ('pinned', 'fav', 'todo', 'deleted')

LEGACY_TODO_RE = re.compile(r'^\s*[-*]\s*\[([ xX])\]\s*(.*)$')


def encode_cursor(created_at: float, note_id: str) -> str:
    """天列表游标：不透明字符串，客户端不解析，便于以后换排序键。"""
    raw = f'{float(created_at)!r}|{note_id}'.encode('utf-8')
    return base64.urlsafe_b64encode(raw).decode('ascii').rstrip('=')


def decode_cursor(cursor) -> tuple[float, str] | None:
    if not cursor:
        return None
    try:
        text = str(cursor)
        pad = '=' * (-len(text) % 4)
        raw = base64.urlsafe_b64decode(text + pad).decode('utf-8')
        ts, _, nid = raw.partition('|')
        return float(ts), nid
    except Exception as exc:
        raise ValueError('游标非法') from exc


def split_legacy_todos(text: str) -> tuple[str, list]:
    """把老版本正文里的 `- [ ]` 行拆成结构化事项（与前端同一规则）。
    返回 (纯正文, 事项列表)；正文尾部空行清掉，不改动其他内容。"""
    body: list[str] = []
    todos: list = []
    for line in (text or '').split('\n'):
        m = LEGACY_TODO_RE.match(line)
        if m and m.group(2).strip():
            todos.append({'id': uuid.uuid4().hex, 'text': m.group(2).strip(),
                          'done': m.group(1).lower() == 'x'})
            continue
        body.append(line)
    while body and not body[-1].strip():
        body.pop()
    return '\n'.join(body), todos


def _load_todos(raw) -> list:
    if not raw:
        return []
    if isinstance(raw, list):
        return raw
    try:
        val = json.loads(raw)
    except Exception:
        return []
    return val if isinstance(val, list) else []


def _row_to_dict(row, cols):
    d = dict(zip(cols, row))
    for f in JSON_FIELDS & d.keys():
        if isinstance(d[f], str):
            try:
                d[f] = json.loads(d[f])
            except Exception:
                d[f] = None
    for b in BOOL_FIELDS:
        if b in d:
            d[b] = bool(d[b])
    return d


