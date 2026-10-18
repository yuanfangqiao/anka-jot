"""日历远端数据源的服务端回归（纯 stdlib，不依赖插件真实 data/）。

覆盖：整月计数分桶与边界、软删不计数但 rev 变化、跨月隔离、
夏令时 23/25 小时的天、天列表 keyset 分页稳定性、preview 裁剪、非法游标。
"""
import importlib.util
import sys
import tempfile
import unittest
from pathlib import Path

SERVER = Path(__file__).resolve().parents[1] / 'server'
sys.path.insert(0, str(SERVER))
spec = importlib.util.spec_from_file_location('jot_store_calendar', SERVER / 'store.py')
S = importlib.util.module_from_spec(spec)
spec.loader.exec_module(S)

H = 3_600_000
D = 24 * H
DAY0 = 1_760_000_000_000  # 固定基准，避免依赖运行时的“今天”


def make_note(nid, created_at, **kw):
    note = {
        'id': nid, 'title': '', 'text': '', 'tags': [], 'source': 'text',
        'createdAt': created_at, 'updatedAt': created_at + 1, 'pinned': False,
        'fav': False, 'todo': False, 'todos': [], 'color': None,
        'location': None, 'deleted': False, 'rev': 0,
    }
    note.update(kw)
    return note


def month_starts(day_count, first=DAY0, day_len=D):
    """构造 N+1 个边界；day_len 可变，用于模拟夏令时 23/25 小时。"""
    return [first + i * day_len for i in range(day_count + 1)]


class CalendarStoreTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix='jot-cal-')
        self.dir = Path(self.tmp.name)
        self.store = S.Store(self.dir)

    def tearDown(self):
        self.tmp.cleanup()

    def add(self, nid, created_at, **kw):
        self.store.upsert_note(make_note(nid, created_at, **kw), [], [])

    # ─── 计数 ───────────────────────────────────────
    def test_empty_month_is_all_zero(self):
        starts = month_starts(31)
        r = self.store.calendar_counts(starts)
        self.assertEqual(len(r['days']), 31)
        self.assertEqual(sum(r['days']), 0)
        self.assertEqual(r['rev'], 0)

    def test_counts_bucket_by_client_boundaries(self):
        starts = month_starts(3)
        self.add('a', starts[0])            # 第 1 天零点：属于第 1 天
        self.add('b', starts[1] - 1)        # 第 1 天最后一毫秒
        self.add('c', starts[1])            # 第 2 天零点：属于第 2 天
        self.add('d', starts[3] - 1)        # 第 3 天最后一毫秒
        self.add('e', starts[3])            # 月末边界外：不计入
        r = self.store.calendar_counts(starts)
        self.assertEqual(r['days'], [2, 1, 1])

    def test_deleted_excluded_but_bumps_rev(self):
        starts = month_starts(2)
        self.add('a', starts[0] + H)
        before = self.store.calendar_counts(starts)
        self.assertEqual(before['days'], [1, 0])
        self.store.delete_note('a')
        after = self.store.calendar_counts(starts)
        self.assertEqual(after['days'], [0, 0])
        self.assertGreater(after['rev'], before['rev'])  # 缓存靠 rev 失效

    def test_dst_days_of_23_and_25_hours(self):
        # 3 月最后一个周日：某天只有 23 小时；10 月最后一个周日：25 小时
        starts = [DAY0, DAY0 + D, DAY0 + D + 23 * H, DAY0 + 2 * D + 23 * H]
        self.add('a', DAY0 + D + 23 * H - 1)   # 短日最后一毫秒
        self.add('b', DAY0 + D + 23 * H)       # 次日零点
        r = self.store.calendar_counts(starts)
        self.assertEqual(r['days'], [0, 1, 1])

    # ─── 天列表 ─────────────────────────────────────
    def test_pagination_is_stable_with_same_millisecond(self):
        starts = month_starts(2)
        ts = starts[0] + 9 * H
        for i in range(25):
            self.add(f'n{i:02d}', ts)  # 全部同一毫秒，只能靠 id 定序
        seen, cursor, pages = [], None, 0
        while True:
            r = self.store.notes_by_day(starts[0], starts[1], cursor, 10)
            pages += 1
            seen += [n['id'] for n in r['notes']]
            self.assertLessEqual(len(r['notes']), 10)
            if not r['hasMore']:
                self.assertIsNone(r['nextCursor'])
                break
            cursor = r['nextCursor']
            self.assertLess(pages, 10)
        self.assertEqual(len(seen), 25)
        self.assertEqual(len(set(seen)), 25)  # 不重不漏
        self.assertEqual(seen, sorted(seen, reverse=True))

    def test_day_list_excludes_deleted_and_other_days(self):
        starts = month_starts(3)
        self.add('in', starts[1] + H)
        self.add('out', starts[2] + H)
        self.add('gone', starts[1] + 2 * H)
        self.store.delete_note('gone')
        r = self.store.notes_by_day(starts[1], starts[2], None, 20)
        self.assertEqual([n['id'] for n in r['notes']], ['in'])

    def test_preview_is_truncated_but_text_len_is_real(self):
        starts = month_starts(day_count=1)
        body = 'x' * 5000
        self.add('long', starts[0] + H, text=body, title='标题')
        n = self.store.notes_by_day(starts[0], starts[1], None, 20)['notes'][0]
        self.assertEqual(len(n['preview']), 600)
        self.assertEqual(n['textLen'], 5000)
        self.assertNotIn('text', n)  # 列表不回全文
        self.assertEqual(n['title'], '标题')

    def test_limit_is_clamped(self):
        starts = month_starts(day_count=1)
        for i in range(5):
            self.add(f'c{i}', starts[0] + i)
        self.assertEqual(len(self.store.notes_by_day(starts[0], starts[1], None, 0)['notes']), 1)
        self.assertEqual(len(self.store.notes_by_day(starts[0], starts[1], None, 999)['notes']), 5)

    def test_invalid_cursor_raises(self):
        starts = month_starts(day_count=1)
        with self.assertRaises(ValueError):
            self.store.notes_by_day(starts[0], starts[1], 'not-a-cursor!!', 10)

    def test_invalid_range_raises(self):
        with self.assertRaises(ValueError):
            self.store.notes_by_day(DAY0, DAY0, None, 10)


if __name__ == '__main__':
    unittest.main()
