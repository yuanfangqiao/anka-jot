"""即刻 Jot — SQLite 持久化层（线程安全：每次调用独立连接）。

表：notes / atts / tags / media / kv。notes.rev 全局单调递增（服务端权威），
LWW 依据：客户端 rev 取自上次同步时的 serverRev 副本 —— v1 采用笔记级 LWW：
client_rev >= server_rev 则覆盖，否则保留服务端并回传。
"""

import json
import sqlite3
import time
from contextlib import closing
from pathlib import Path

SCHEMA = """
CREATE TABLE IF NOT EXISTS notes(
  id TEXT PRIMARY KEY, title TEXT DEFAULT '', text TEXT DEFAULT '',
  tags TEXT DEFAULT '[]', source TEXT DEFAULT 'text',
  createdAt REAL, updatedAt REAL, pinned INTEGER DEFAULT 0,
  fav INTEGER DEFAULT 0,
  color TEXT, location TEXT, deleted INTEGER DEFAULT 0, rev INTEGER DEFAULT 0);
CREATE INDEX IF NOT EXISTS idx_notes_updated ON notes(updatedAt DESC);
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
"""

NOTE_COLS = ('id', 'title', 'text', 'tags', 'source', 'createdAt', 'updatedAt',
             'pinned', 'fav', 'color', 'location', 'deleted', 'rev')
ATT_COLS = ('id', 'noteId', 'kind', 'serverPath', 'thumbPath', 'width', 'height',
            'duration', 'peaks', 'ocrText', 'transcript', 'sha256', 'size', 'createdAt')
JSON_FIELDS = {'tags', 'location', 'peaks', 'transcript'}


def _row_to_dict(row, cols):
    d = dict(zip(cols, row))
    for f in JSON_FIELDS & d.keys():
        if isinstance(d[f], str):
            try:
                d[f] = json.loads(d[f])
            except Exception:
                d[f] = None
    for b in ('pinned', 'fav', 'deleted'):
        if b in d:
            d[b] = bool(d[b])
    return d


class Store:
    def __init__(self, data_dir: Path):
        data_dir.mkdir(parents=True, exist_ok=True)
        self.db_path = data_dir / 'jot.db'
        with closing(self._c()) as c, c:
            c.executescript(SCHEMA)
            # v1.1 旧库补列：CREATE IF NOT EXISTS 不会给已存在的表加列
            if 'size' not in {r[1] for r in c.execute('PRAGMA table_info(atts)')}:
                c.execute('ALTER TABLE atts ADD COLUMN size INTEGER')
            if 'fav' not in {r[1] for r in c.execute('PRAGMA table_info(notes)')}:
                c.execute('ALTER TABLE notes ADD COLUMN fav INTEGER DEFAULT 0')

    def _c(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path, timeout=10)
        conn.execute('PRAGMA journal_mode=WAL')
        return conn

    # ─── rev（服务端权威定序） ─────────────────────────
    def _next_rev(self, c) -> int:
        # 单条 UPSERT 原子自增（WAL 下写串行），避免并发读改写产生重复 rev
        c.execute("INSERT INTO kv(k, v) VALUES('serverRev', '1') "
                  "ON CONFLICT(k) DO UPDATE SET v = CAST(v AS INTEGER) + 1")
        return int(c.execute("SELECT v FROM kv WHERE k='serverRev'").fetchone()[0])

    def server_rev(self) -> int:
        with closing(self._c()) as c, c:
            row = c.execute("SELECT v FROM kv WHERE k='serverRev'").fetchone()
            return int(row[0]) if row else 0

    # ─── 笔记 ────────────────────────────────────────
    def upsert_note(self, note: dict, atts: list | None) -> tuple[dict, bool]:
        """LWW 合并。返回 (最终笔记, 是否采用了客户端版本)。
        atts=None 表示调用方未提供附件列表 → 保留服务端现有附件；
        atts=[] 表示显式清空。"""
        nid = note.get('id')
        if not nid:
            raise ValueError('note.id 缺失')
        now = time.time() * 1000
        with closing(self._c()) as c, c:
            row = c.execute('SELECT rev FROM notes WHERE id=?', (nid,)).fetchone()
            server_rev = row[0] if row else -1
            try:
                client_rev = int(note.get('rev') or 0)
            except (TypeError, ValueError):
                raise ValueError('note.rev 非法')
            applied = client_rev >= server_rev
            new_rev = self._next_rev(c)
            if applied:
                vals = {k: note.get(k) for k in NOTE_COLS if k != 'rev'}
                vals['rev'] = new_rev
                vals['updatedAt'] = note.get('updatedAt') or now
                vals['createdAt'] = note.get('createdAt') or now
                vals.setdefault('title', '')
                vals.setdefault('text', '')
                for f in JSON_FIELDS & vals.keys():
                    vals[f] = json.dumps(vals[f], ensure_ascii=False)
                vals['pinned'] = 1 if note.get('pinned') else 0
                vals['fav'] = 1 if note.get('fav') else 0
                vals['deleted'] = 1 if note.get('deleted') else 0
                cols = ','.join(NOTE_COLS)
                marks = ','.join('?' * 1 for _ in NOTE_COLS)
                c.execute(f'INSERT INTO notes({cols}) VALUES({marks}) '
                          'ON CONFLICT(id) DO UPDATE SET '
                          + ','.join(f'{k}=excluded.{k}' for k in NOTE_COLS),
                          tuple(vals[k] for k in NOTE_COLS))
                if atts is not None:
                    c.execute('DELETE FROM atts WHERE noteId=?', (nid,))
                    for a in atts or []:
                        self._insert_att(c, nid, a)
                for t in (note.get('tags') or []):
                    c.execute('INSERT INTO tags(name,lastUsedAt) VALUES(?,?) '
                              'ON CONFLICT(name) DO UPDATE SET lastUsedAt=excluded.lastUsedAt',
                              (t, now))
            final = self.get_note(nid, c)
            return final, applied

    def _insert_att(self, c, note_id: str, a: dict):
        vals = {k: a.get(k) for k in ATT_COLS}
        vals['noteId'] = note_id
        if not vals.get('id'):
            raise ValueError('attachment.id 缺失')
        for f in ('peaks', 'transcript'):
            vals[f] = json.dumps(vals[f], ensure_ascii=False) if vals[f] is not None else None
        cols = ','.join(ATT_COLS)
        c.execute(f'INSERT INTO atts({cols}) VALUES({",".join("?" for _ in ATT_COLS)}) '
                  'ON CONFLICT(id) DO UPDATE SET '
                  + ','.join(f'{k}=excluded.{k}' for k in ATT_COLS),
                  tuple(vals[k] for k in ATT_COLS))

    def get_note(self, nid: str, c=None) -> dict | None:
        own = c is None
        c = c or self._c()
        try:
            row = c.execute(f'SELECT {",".join(NOTE_COLS)} FROM notes WHERE id=?',
                            (nid,)).fetchone()
            if not row:
                return None
            note = _row_to_dict(row, NOTE_COLS)
            rows = c.execute(f'SELECT {",".join(ATT_COLS)} FROM atts WHERE noteId=? '
                             'ORDER BY createdAt', (nid,)).fetchall()
            note['atts'] = [_row_to_dict(r, ATT_COLS) for r in rows]
            return note
        finally:
            if own:
                c.close()

    def delete_note(self, nid: str) -> bool:
        with closing(self._c()) as c, c:
            if not c.execute('SELECT 1 FROM notes WHERE id=?', (nid,)).fetchone():
                return False
            rev = self._next_rev(c)
            c.execute('UPDATE notes SET deleted=1, rev=?, updatedAt=? WHERE id=?',
                      (rev, time.time() * 1000, nid))
            return True

    def snapshot(self, since_rev: int = 0, limit: int = 500) -> dict:
        """增量快照（分页）：nextRev=本页最大 rev，客户端以其为新水位；hasMore 表示还有剩余。"""
        with closing(self._c()) as c, c:
            rows = c.execute(f'SELECT {",".join(NOTE_COLS)} FROM notes '
                             'WHERE rev>? ORDER BY rev LIMIT ?', (since_rev, limit + 1)).fetchall()
            has_more = len(rows) > limit
            rows = rows[:limit]
            notes = []
            if rows:
                # 批量取附件，避免每笔记一次查询（N+1）
                ids = [r[NOTE_COLS.index('id')] for r in rows]
                marks = ','.join('?' * len(ids))
                ar = c.execute(f'SELECT {",".join(ATT_COLS)} FROM atts '
                               f'WHERE noteId IN ({marks}) ORDER BY createdAt', ids).fetchall()
                by_note: dict[str, list] = {}
                for r in ar:
                    d = _row_to_dict(r, ATT_COLS)
                    by_note.setdefault(d['noteId'], []).append(d)
                for r in rows:
                    n = _row_to_dict(r, NOTE_COLS)
                    n['atts'] = by_note.get(n['id'], [])
                    notes.append(n)
            tags = [{'name': r[0], 'color': r[1], 'pinned': bool(r[2]),
                     'lastUsedAt': r[3]}
                    for r in c.execute('SELECT name,color,pinned,lastUsedAt FROM tags')]
            return {'notes': notes, 'tags': tags, 'serverRev': self.server_rev(),
                    'hasMore': has_more, 'nextRev': rows[-1][NOTE_COLS.index('rev')] if rows else since_rev}

    def set_att_media(self, att_id: str, path: str, thumb_path: str | None):
        with closing(self._c()) as c, c:
            row = c.execute('SELECT serverPath,thumbPath FROM atts WHERE id=?', (att_id,)).fetchone()
            if not row or tuple(row) == (path, thumb_path):
                return
            c.execute('UPDATE atts SET serverPath=?, thumbPath=? WHERE id=?',
                      (path, thumb_path, att_id))
            self._bump_note_rev(c, att_id)

    def _bump_note_rev(self, c, att_id: str):
        """附件变更时 bump 所属笔记 rev，保证 snapshot 能把变更同步给其他客户端"""
        row = c.execute('SELECT noteId FROM atts WHERE id=?', (att_id,)).fetchone()
        if not row:
            return
        rev = self._next_rev(c)
        c.execute('UPDATE notes SET rev=?, updatedAt=? WHERE id=?',
                  (rev, time.time() * 1000, row[0]))

    def set_att_text(self, att_id: str, field: str, value) -> bool:
        if field not in ('ocrText', 'transcript'):
            raise ValueError(f'字段 {field} 不可写')
        with closing(self._c()) as c, c:
            if not c.execute('SELECT 1 FROM atts WHERE id=?', (att_id,)).fetchone():
                return False
            if field == 'transcript':
                value = json.dumps(value, ensure_ascii=False)
            c.execute(f'UPDATE atts SET {field}=? WHERE id=?', (value, att_id))
            self._bump_note_rev(c, att_id)
            return True

    def att_row(self, att_id: str) -> dict | None:
        with closing(self._c()) as c, c:
            row = c.execute(f'SELECT {",".join(ATT_COLS)} FROM atts WHERE id=?',
                            (att_id,)).fetchone()
            return _row_to_dict(row, ATT_COLS) if row else None

    # ─── 标签 / 媒体 ─────────────────────────────────
    def upsert_tag(self, name: str, color: str | None, pinned: bool | None):
        if not name:
            raise ValueError('标签名不能为空')
        with closing(self._c()) as c, c:
            c.execute('INSERT INTO tags(name,color,pinned,lastUsedAt) VALUES(?,?,?,?) '
                      'ON CONFLICT(name) DO UPDATE SET '
                      'color=COALESCE(?,color), pinned=COALESCE(?,pinned)',
                      (name, color, int(pinned) if pinned is not None else 0,
                       time.time() * 1000,
                       color, int(pinned) if pinned is not None else None))

    def put_media(self, sha256: str, path: str, size: int, kind: str):
        with closing(self._c()) as c, c:
            c.execute('INSERT OR IGNORE INTO media(sha256,path,size,kind,createdAt) '
                      'VALUES(?,?,?,?,?)',
                      (sha256, path, size, kind, time.time() * 1000))

    def has_media(self, sha256: str) -> dict | None:
        with closing(self._c()) as c, c:
            row = c.execute('SELECT path,size,kind FROM media WHERE sha256=?',
                            (sha256,)).fetchone()
            return {'path': row[0], 'size': row[1], 'kind': row[2]} if row else None

    # ─── 搜索（服务端兜底） ───────────────────────────
    def search(self, q: str, kind: str | None = None, tag: str | None = None,
               limit: int = 50) -> list:
        like = f'%{q}%'
        with closing(self._c()) as c, c:
            rows = c.execute(
                'SELECT DISTINCT n.id, n.title, n.updatedAt FROM notes n '
                'LEFT JOIN atts a ON a.noteId=n.id '
                "WHERE n.deleted=0 AND (n.title LIKE ? OR n.text LIKE ? "
                'OR a.ocrText LIKE ? OR a.transcript LIKE ?) '
                'ORDER BY n.updatedAt DESC LIMIT ?',
                (like, like, like, like, limit * 4)).fetchall()
            hits = []
            for nid, title, updated in rows:
                note = self.get_note(nid, c)
                if kind and not any(a['kind'] == kind for a in note['atts']):
                    continue
                if tag and tag not in (note['tags'] or []):
                    continue
                field, snippet = self._snippet(note, q)
                if field:
                    hits.append({'noteId': nid, 'title': title, 'updatedAt': updated,
                                 'field': field, 'snippet': snippet})
                if len(hits) >= limit:
                    break
            return hits

    @staticmethod
    def _snippet(note: dict, q: str, width: int = 40):
        pools = [('title', note.get('title') or ''), ('text', note.get('text') or '')]
        for a in note.get('atts') or []:
            pools.append(('ocr', a.get('ocrText') or ''))
            for seg in (a.get('transcript') or []):
                pools.append(('transcript', seg.get('text') or ''))
        ql = q.lower()
        for field, text in pools:
            i = text.lower().find(ql)
            if i >= 0:
                s = max(0, i - 20)
                return field, text[s:i + len(q) + width]
        return None, ''
