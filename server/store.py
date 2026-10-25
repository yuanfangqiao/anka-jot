"""SQLite store. Sibling modules are loaded by path like the host plugin loader."""
import importlib.util
import json
import sqlite3
import time
from contextlib import closing
from pathlib import Path


def _sibling(name):
    spec = importlib.util.spec_from_file_location(f'{__name__}_{name}', Path(__file__).with_name(name + '.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


schema, writer = _sibling('schema'), _sibling('note_writes')
SCHEMA, NOTE_COLS, ATT_COLS = schema.SCHEMA, schema.NOTE_COLS, schema.ATT_COLS
CARD_SQL, CARD_FIELDS = schema.CARD_SQL, schema.CARD_FIELDS
JSON_FIELDS, BOOL_FIELDS = schema.JSON_FIELDS, schema.BOOL_FIELDS
_row_to_dict, _load_todos = schema._row_to_dict, schema._load_todos
split_legacy_todos = schema.split_legacy_todos
encode_cursor, decode_cursor = schema.encode_cursor, schema.decode_cursor
bisect = schema.bisect


class Store(writer.make_writer(schema)):
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
