"""Atomic note writes, three-way field merges and recoverable versions."""
import json
import time
import uuid
from contextlib import closing

FIELDS = ('title', 'text', 'tags', 'source', 'pinned', 'fav', 'todo', 'todos',
          'color', 'location', 'deleted')


def make_writer(schema):
    NOTE_COLS, ATT_COLS = schema.NOTE_COLS, schema.ATT_COLS
    JSON_FIELDS = schema.JSON_FIELDS
    split_legacy_todos, _load_todos = schema.split_legacy_todos, schema._load_todos
    _row_to_dict = schema._row_to_dict

    class NoteWrites:
        # ─── 笔记 ────────────────────────────────────────
        def upsert_note(self, note: dict, atts: list | None,
                        removed_att_ids: list | None = None, base: dict | None = None, mutation_id: str | None = None) -> tuple[dict, bool]:
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
                c.execute('BEGIN IMMEDIATE')
                previous = self.get_note(nid, c)
                if mutation_id and c.execute('SELECT 1 FROM note_mutations WHERE id=? AND noteId=?', (mutation_id, nid)).fetchone():
                    return previous, True
                row = c.execute('SELECT rev, todo, todos FROM notes WHERE id=?', (nid,)).fetchone()
                if previous:
                    self._save_version(c, previous, '修改前')
                conflicts = []
                if previous and base is not None:
                    incoming = note
                    conflicts = [k for k in FIELDS if k in incoming and k in base
                                 and incoming[k] != base[k] and previous.get(k) != base[k]
                                 and incoming[k] != previous.get(k)]
                    if conflicts:
                        self._save_version(c, incoming, '冲突：' + '、'.join(conflicts))
                    # Tombstones win over an unaware stale editor; its draft is retained above.
                    if previous.get('deleted') and not base.get('deleted'):
                        self._save_version(c, incoming, '删除后的编辑')
                        return previous, True
                    note = {**previous, **{k: incoming[k] for k in FIELDS
                            if k in incoming and k in base and incoming[k] != base[k]},
                            'updatedAt': now}

                server_rev = row[0] if row else -1
                try:
                    client_rev = int(note.get('rev') or 0)
                except (TypeError, ValueError):
                    raise ValueError('note.rev 非法')
                applied = base is not None or client_rev >= server_rev
                if not applied:
                    self._save_version(c, note, '旧客户端冲突')
                    return self.get_note(nid, c), False
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
                if mutation_id:
                    c.execute('INSERT OR IGNORE INTO note_mutations(id,noteId) VALUES(?,?)', (mutation_id, nid))
                final = self.get_note(nid, c)
                if conflicts:
                    final['_conflicts'] = conflicts
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
                c.execute('BEGIN IMMEDIATE')
                previous = self.get_note(nid, c)
                if previous:
                    self._save_version(c, previous, '删除前')
                if not c.execute('SELECT 1 FROM notes WHERE id=?', (nid,)).fetchone():
                    return False
                rev = self._next_rev(c)
                c.execute('UPDATE notes SET deleted=1, rev=?, updatedAt=? WHERE id=?',
                          (rev, time.time() * 1000, nid))
                return True


        def _save_version(self, c, note, reason):
            c.execute('INSERT INTO note_history(id,noteId,at,reason,snapshot) VALUES(?,?,?,?,?)',
                      (uuid.uuid4().hex, note['id'], time.time() * 1000, reason,
                       json.dumps(note, ensure_ascii=False)))

        def note_history(self, nid):
            with closing(self._c()) as c:
                rows = c.execute('SELECT id,at,reason,snapshot FROM note_history '
                                 'WHERE noteId=? ORDER BY at DESC LIMIT 100', (nid,)).fetchall()
                return [{'id': r[0], 'at': r[1], 'reason': r[2], 'snap': json.loads(r[3])}
                        for r in rows]

    return NoteWrites
