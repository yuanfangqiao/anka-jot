"""Independent clients, atomic writes and recoverable field conflicts (isolated SQLite)."""
import concurrent.futures
import importlib.util
import tempfile
import unittest
from pathlib import Path

SERVER = Path(__file__).resolve().parents[1] / 'server'
spec = importlib.util.spec_from_file_location('jot_concurrent', SERVER / 'store.py')
S = importlib.util.module_from_spec(spec)
spec.loader.exec_module(S)


class ConcurrentStoreTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.store = S.Store(Path(self.tmp.name))
        self.base, _ = self.store.upsert_note({
            'id': 'shared', 'title': '标题', 'text': '正文', 'tags': [], 'source': 'text',
            'createdAt': 1000, 'updatedAt': 1000, 'pinned': False, 'fav': False,
            'todo': True, 'todos': [{'id': 't1', 'text': '任务', 'done': False}],
            'color': None, 'location': None, 'deleted': False, 'rev': 0,
        }, [])

    def save(self, **patch):
        return self.store.upsert_note({**self.base, **patch}, None, base=self.base)

    def test_stale_title_keeps_saved_body(self):
        self.save(text='手机已经保存的新正文')
        final, applied = self.save(title='电脑新标题')
        self.assertTrue(applied)
        self.assertEqual(final['title'], '电脑新标题')
        self.assertEqual(final['text'], '手机已经保存的新正文')

    def test_same_field_keeps_both_versions(self):
        self.save(text='手机内容')
        final, _ = self.save(text='电脑内容')
        self.assertEqual(final['text'], '电脑内容')
        texts = [v['snap']['text'] for v in self.store.note_history('shared')]
        self.assertIn('手机内容', texts)
        self.assertIn('电脑内容', texts)

    def test_concurrent_transactions_merge_independent_fields(self):
        with concurrent.futures.ThreadPoolExecutor(2) as pool:
            list(pool.map(lambda patch: self.save(**patch),
                          [{'title': '线程标题'}, {'text': '线程正文'}]))
        final = self.store.get_note('shared')
        self.assertEqual((final['title'], final['text']), ('线程标题', '线程正文'))

    def test_acknowledged_retry_is_idempotent_in_content(self):
        self.save(title='电脑标题')
        self.save(text='手机正文')
        final, _ = self.save(title='电脑标题')
        self.assertEqual((final['title'], final['text']), ('电脑标题', '手机正文'))

    def test_retried_mutation_does_not_overwrite_a_later_client(self):
        self.store.upsert_note({**self.base, 'text': 'A'}, None, base=self.base, mutation_id='op-a')
        self.store.upsert_note({**self.base, 'text': 'B'}, None, base=self.base, mutation_id='op-b')
        final, applied = self.store.upsert_note({**self.base, 'text': 'A'}, None,
                                               base=self.base, mutation_id='op-a')
        self.assertTrue(applied)
        self.assertEqual(final['text'], 'B')

    def test_legacy_conflict_is_not_promoted_for_overwriting(self):
        self.save(text='新版')
        final, applied = self.store.upsert_note({**self.base, 'text': '旧版'}, None)
        self.assertFalse(applied)
        self.assertEqual(final['text'], '新版')
        self.assertTrue(any(v['snap']['text'] == '旧版' for v in self.store.note_history('shared')))

    def test_stale_editor_does_not_resurrect_deleted_note(self):
        self.store.delete_note('shared')
        final, _ = self.save(title='删除后的标题')
        self.assertTrue(final['deleted'])
        self.assertTrue(any(v['snap']['title'] == '删除后的标题'
                            for v in self.store.note_history('shared')))

    def test_history_survives_restart_and_can_be_restored_by_normal_write(self):
        self.save(text='新正文')
        restarted = S.Store(Path(self.tmp.name))
        versions = restarted.note_history('shared')
        old = next(v['snap'] for v in versions if v['snap']['text'] == '正文')
        current = restarted.get_note('shared')
        final, _ = restarted.upsert_note({**current, 'text': old['text']}, None, base=current)
        self.assertEqual(final['text'], '正文')
        self.assertTrue(any(v['snap']['text'] == '新正文' for v in restarted.note_history('shared')))


if __name__ == '__main__':
    unittest.main()
