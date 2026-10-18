"""事项独立字段 / 待办标志的服务端回归（纯 stdlib，不依赖插件真实 data/）。

覆盖：老正文拆分、老库补列与一次性迁移、旧客户端缺省字段保留、
快照回传结构化事项、搜索命中事项文本。
"""
import importlib.util
import json
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path

SERVER = Path(__file__).resolve().parents[1] / 'server'
sys.path.insert(0, str(SERVER))
spec = importlib.util.spec_from_file_location('jot_store_todos', SERVER / 'store.py')
S = importlib.util.module_from_spec(spec)
spec.loader.exec_module(S)

OLD_SCHEMA = """
CREATE TABLE notes (
  id TEXT PRIMARY KEY, title TEXT, text TEXT, tags TEXT, source TEXT,
  createdAt REAL, updatedAt REAL, pinned INTEGER DEFAULT 0, fav INTEGER DEFAULT 0,
  color TEXT, location TEXT, deleted INTEGER DEFAULT 0, rev INTEGER DEFAULT 0);
CREATE TABLE kv (k TEXT PRIMARY KEY, v TEXT);
"""


def make_note(**kw):
    note = {
        'id': 'n1', 'title': '', 'text': '', 'tags': [], 'source': 'text',
        'createdAt': 1000, 'updatedAt': 2000, 'pinned': False, 'fav': False, 'rev': 0,
    }
    note.update(kw)
    return note


class TodosStoreTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix='jot-todos-')
        self.dir = Path(self.tmp.name)

    def tearDown(self):
        self.tmp.cleanup()

    def test_split_legacy_todos(self):
        body, todos = S.split_legacy_todos('第一行\n- [ ] 买菜\n  * [x] 遛狗\n\n')
        self.assertEqual(body, '第一行')
        self.assertEqual([t['text'] for t in todos], ['买菜', '遛狗'])
        self.assertEqual([t['done'] for t in todos], [False, True])
        self.assertTrue(all(t['id'] for t in todos))

    def test_old_db_gets_columns_and_migration(self):
        db = self.dir / 'jot.db'
        conn = sqlite3.connect(db)
        conn.executescript(OLD_SCHEMA)
        conn.execute(
            "INSERT INTO notes(id,title,text,tags,createdAt,updatedAt,rev) VALUES(?,?,?,?,?,?,?)",
            ('old1', 'T', '正文\n- [ ] 旧事项\n- [x] 已完成', '[]', 1000, 2000, 0))
        conn.commit()
        conn.close()

        store = S.Store(self.dir)
        snap = store.snapshot(-1, 10)
        note = snap['notes'][0]
        self.assertEqual(note['text'], '正文')
        self.assertFalse(note['todo'])
        self.assertEqual([t['text'] for t in note['todos']], ['旧事项', '已完成'])
        self.assertTrue(note['todos'][1]['done'])
        self.assertEqual(note['updatedAt'], 2000)  # 迁移不改 updatedAt，时间线不重排
        self.assertGreater(note['rev'], 0)

        # 再次实例化：kv 标记生效，不重复拆分（否则事项会被翻倍）
        again = S.Store(self.dir)
        note2 = again.snapshot(-1, 10)['notes'][0]
        self.assertEqual(len(note2['todos']), 2)

    def test_missing_fields_are_preserved(self):
        store = S.Store(self.dir)
        store.upsert_note(make_note(todo=True, todos=[{'id': 'a', 'text': '保留', 'done': False}]), [], [])
        # 旧客户端：payload 完全没有 todo / todos
        old = make_note(title='新标题', text='新正文', updatedAt=3000, rev=1)
        store.upsert_note(old, [], [])
        note = store.snapshot(-1, 10)['notes'][0]
        self.assertEqual(note['title'], '新标题')
        self.assertTrue(note['todo'])
        self.assertEqual(note['todos'][0]['text'], '保留')

    def test_legacy_lines_from_old_client_are_split(self):
        store = S.Store(self.dir)
        store.upsert_note(make_note(todos=[]), [], [])
        old = make_note(text='补充\n- [ ] 新事项', updatedAt=3000, rev=1)
        store.upsert_note(old, [], [])
        note = store.snapshot(-1, 10)['notes'][0]
        self.assertEqual(note['text'], '补充')
        self.assertEqual(note['todos'][0]['text'], '新事项')

    def test_search_hits_todos(self):
        store = S.Store(self.dir)
        store.upsert_note(make_note(text='无关正文', todos=[{'id': 'a', 'text': '买牛奶', 'done': False}]), [], [])
        hits = store.search('牛奶')
        self.assertEqual(hits[0]['field'], 'todo')
        self.assertIn('牛奶', hits[0]['snippet'])

    def test_toggle_flag_keeps_todos(self):
        store = S.Store(self.dir)
        store.upsert_note(make_note(todo=True, todos=[{'id': 'a', 'text': 'x', 'done': False}]), [], [])
        off = make_note(todo=False, updatedAt=3000, rev=1,
                        todos=[{'id': 'a', 'text': 'x', 'done': False}])
        store.upsert_note(off, [], [])
        note = store.snapshot(-1, 10)['notes'][0]
        self.assertFalse(note['todo'])
        self.assertEqual(len(note['todos']), 1)

    def test_snapshot_serializes_todos_as_json(self):
        store = S.Store(self.dir)
        store.upsert_note(make_note(todos=[{'id': 'a', 'text': '中文', 'done': True}]), [], [])
        with sqlite3.connect(self.dir / 'jot.db') as conn:
            raw = conn.execute('SELECT todos FROM notes WHERE id=?', ('n1',)).fetchone()[0]
        self.assertIn('中文', raw)  # ensure_ascii=False，中文可直接 LIKE
        self.assertEqual(json.loads(raw)[0]['done'], True)


if __name__ == '__main__':
    unittest.main()
