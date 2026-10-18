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
            # v1.2 事项独立：待办标志 + 结构化事项列表
            note_cols = {r[1] for r in c.execute('PRAGMA table_info(notes)')}
            if 'todo' not in note_cols:
                c.execute('ALTER TABLE notes ADD COLUMN todo INTEGER DEFAULT 0')
            if 'todos' not in note_cols:
                c.execute("ALTER TABLE notes ADD COLUMN todos TEXT DEFAULT '[]'")
            self._migrate_legacy_todos(c)

    def _c(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path, timeout=10)
        conn.execute('PRAGMA journal_mode=WAL')
        return conn

    def _migrate_legacy_todos(self, c):
        """一次性把正文里的 `- [ ]` 行搬进 todos 列（kv 标记只跑一次）。
        rev 连续分配（不共用同一个）：快照按 rev 分页，同 rev 跨页会漏行。
        updatedAt 保持不变，避免首页时间线重排。"""
        if c.execute("SELECT v FROM kv WHERE k='todosMigrated'").fetchone():
            return
        pending = []
        for nid, text, todos in c.execute('SELECT id, text, todos FROM notes').fetchall():
            if _load_todos(todos) or not text:
                continue
            body, legacy = split_legacy_todos(text)
            if legacy:
                pending.append((body, json.dumps(legacy, ensure_ascii=False), nid))
        if pending:
            row = c.execute("SELECT v FROM kv WHERE k='serverRev'").fetchone()
            base = int(row[0]) if row else 0
            c.execute("INSERT INTO kv(k,v) VALUES('serverRev',?) "
                      "ON CONFLICT(k) DO UPDATE SET v=excluded.v", (str(base + len(pending)),))
            c.executemany('UPDATE notes SET text=?, todos=?, rev=? WHERE id=?',
                          [(body, todos, base + i + 1, nid)
                           for i, (body, todos, nid) in enumerate(pending)])
        c.execute("INSERT INTO kv(k,v) VALUES('todosMigrated','1') "
                  "ON CONFLICT(k) DO UPDATE SET v='1'")

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
    def upsert_note(self, note: dict, atts: list | None,
                    removed_att_ids: list | None = None) -> tuple[dict, bool]:
        """LWW 合并。返回 (最终笔记, 是否采用了客户端版本)。

        附件语义：atts=None → 不动附件；atts=list → 按 id 增量 upsert（不做隐式删除）。
        删除必须显式放在 removed_att_ids 里——全量替换会让「客户端列表过期」
        变成静默丢附件（OCR / 转写 / 波形元数据一起没）。
        """
        nid = note.get('id')
        if not nid:
            raise ValueError('note.id 缺失')
        now = time.time() * 1000
        with closing(self._c()) as c, c:
            row = c.execute('SELECT rev, todo, todos FROM notes WHERE id=?', (nid,)).fetchone()
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
                # 事项缺省保留：旧客户端 / 旧备份不带 todo(s) 时不能把库里的清空
                text = note.get('text') or ''
                if note.get('todos') is None:
                    todos = _load_todos(row[2]) if row else []
                    if not todos:
                        text, todos = split_legacy_todos(text)
                else:
                    todos = note.get('todos') or []
                    if not todos:
                        text, todos = split_legacy_todos(text)  # 旧客户端仍把事项写在正文
                todo_flag = note.get('todo')
                if todo_flag is None:
                    todo_flag = bool(row[1]) if row else False
                vals['text'] = text
                vals['todos'] = todos
                for f in JSON_FIELDS & vals.keys():
                    vals[f] = json.dumps(vals[f], ensure_ascii=False)
                vals['pinned'] = 1 if note.get('pinned') else 0
                vals['fav'] = 1 if note.get('fav') else 0
                vals['todo'] = 1 if todo_flag else 0
                vals['deleted'] = 1 if note.get('deleted') else 0
                cols = ','.join(NOTE_COLS)
                marks = ','.join('?' * 1 for _ in NOTE_COLS)
                c.execute(f'INSERT INTO notes({cols}) VALUES({marks}) '
                          'ON CONFLICT(id) DO UPDATE SET '
                          + ','.join(f'{k}=excluded.{k}' for k in NOTE_COLS),
                          tuple(vals[k] for k in NOTE_COLS))
                for a in atts or []:
                    self._insert_att(c, nid, a)
                for aid in removed_att_ids or []:
                    c.execute('DELETE FROM atts WHERE id=? AND noteId=?', (str(aid), nid))
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

    # ─── 日历（按客户端给的本地日边界聚合，服务端不做时区推断） ───
    def calendar_counts(self, day_starts: list[int]) -> dict:
        """day_starts 为 N+1 个递增毫秒（客户端逐日构造的本地零点），
        返回 N 个真实条数 + 该区间的 MAX(rev)（含已删行，用于缓存校验）。"""
        starts = [int(x) for x in day_starts]
        if len(starts) < 2:
            raise ValueError('日边界不足')
        lo, hi = starts[0], starts[-1]
        with closing(self._c()) as c:
            rows = c.execute('SELECT createdAt FROM notes WHERE deleted=0 '
                             'AND createdAt>=? AND createdAt<?', (lo, hi)).fetchall()
            rev = c.execute('SELECT COALESCE(MAX(rev),0) FROM notes '
                            'WHERE createdAt>=? AND createdAt<?', (lo, hi)).fetchone()[0]
        days = [0] * (len(starts) - 1)
        last = len(days) - 1
        for (ts,) in rows:
            i = bisect.bisect_right(starts, ts) - 1
            if 0 <= i <= last:
                days[i] += 1
        return {'days': days, 'rev': int(rev or 0)}

    def notes_by_day(self, start_ms: float, end_ms: float, cursor=None,
                     limit: int = 20) -> dict:
        """某天（区间）的卡片流，keyset 分页。返回 preview 而非全文。"""
        limit = max(1, min(int(20 if limit is None else limit), 100))
        lo, hi = float(start_ms), float(end_ms)
        if hi <= lo:
            raise ValueError('时间范围非法')
        where = 'deleted=0 AND createdAt>=? AND createdAt<?'
        args: list = [lo, hi]
        cur = decode_cursor(cursor)
        if cur is not None:
            # 复合 keyset：createdAt 撞毫秒时用 id 稳定续页，不重不漏
            where += ' AND (createdAt<? OR (createdAt=? AND id<?))'
            args += [cur[0], cur[0], cur[1]]
        with closing(self._c()) as c:
            rows = c.execute(f'SELECT {CARD_SQL} FROM notes WHERE {where} '
                             'ORDER BY createdAt DESC, id DESC LIMIT ?',
                             (*args, limit + 1)).fetchall()
            has_more = len(rows) > limit
            rows = rows[:limit]
            notes = []
            if rows:
                ids = [r[CARD_FIELDS.index('id')] for r in rows]
                marks = ','.join('?' * len(ids))
                ar = c.execute(f'SELECT {",".join(ATT_COLS)} FROM atts '
                               f'WHERE noteId IN ({marks}) ORDER BY createdAt', ids).fetchall()
                by_note: dict[str, list] = {}
                for r in ar:
                    d = _row_to_dict(r, ATT_COLS)
                    by_note.setdefault(d['noteId'], []).append(d)
                for r in rows:
                    n = _row_to_dict(r, CARD_FIELDS)
                    n['atts'] = by_note.get(n['id'], [])
                    notes.append(n)
        next_cursor = (encode_cursor(notes[-1]['createdAt'], notes[-1]['id'])
                       if has_more and notes else None)
        return {'notes': notes, 'nextCursor': next_cursor, 'hasMore': has_more}

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
                "WHERE n.deleted=0 AND (n.title LIKE ? OR n.text LIKE ? OR n.todos LIKE ? "
                'OR a.ocrText LIKE ? OR a.transcript LIKE ?) '
                'ORDER BY n.updatedAt DESC LIMIT ?',
                (like, like, like, like, like, limit * 4)).fetchall()
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
        todos = '\n'.join(str(t.get('text') or '') for t in (note.get('todos') or [])
                          if isinstance(t, dict))
        pools = [('title', note.get('title') or ''), ('text', note.get('text') or ''),
                 ('todo', todos)]
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
