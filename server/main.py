"""即刻 Jot — 后端 Service 入口。

宿主 loader 以 importlib 按文件路径加载本模块（非包），同级模块经 _load 按路径引入。
所有公开方法即 /api/apps/jot/call 的可调用契约（_ 开头与 snapshot 由宿主保留语义）。
"""

import importlib.util
import logging
import sys
import time
import uuid
from pathlib import Path

from app.cordis import Service

log = logging.getLogger('agentos.jot')

name = 'anka-jot'
inject = ['llm']
provide = ['anka-jot']

SERVER_DIR = Path(__file__).resolve().parent
DATA_DIR = SERVER_DIR.parent / 'data'


def _load(mod_name: str, filename: str):
    full = f'app_plugins.anka-jot.{mod_name}'
    if full in sys.modules:
        return sys.modules[full]
    spec = importlib.util.spec_from_file_location(full, SERVER_DIR / filename)
    mod = importlib.util.module_from_spec(spec)
    sys.modules[full] = mod
    spec.loader.exec_module(mod)
    return mod


store_mod = _load('store', 'store.py')
thumb_mod = _load('thumbnails', 'thumbnails.py')
media_mod = _load('media', 'media.py')
ai_mod = _load('ai', 'ai.py')

MAX_ATTS_PER_NOTE = 50
MAX_TEXT_LEN = 200_000
MAX_TITLE_LEN = 200
MAX_TAGS = 50
MAX_TODOS = 200
MAX_TODO_TEXT = 500

# 日历：一次最多一年多的边界数组；单日跨度容忍夏令时（23/25 小时）
CAL_MAX_DAYS = 370
CAL_MAX_SPAN_MS = 400 * 86_400_000
CAL_MAX_DAY_MS = 36 * 3_600_000


def _valid_day_starts(day_starts) -> list[int]:
    """客户端给的本地日边界：必须是严格递增的毫秒整数列表。"""
    if not isinstance(day_starts, list) or len(day_starts) < 2:
        raise ValueError('dayStarts 非法')
    if len(day_starts) > CAL_MAX_DAYS:
        raise ValueError('dayStarts 过长')
    out: list[int] = []
    for v in day_starts:
        if not isinstance(v, (int, float)) or isinstance(v, bool):
            raise ValueError('dayStarts 非法')
        out.append(int(v))
    if any(b <= a for a, b in zip(out, out[1:])):
        raise ValueError('dayStarts 必须严格递增')
    if out[-1] - out[0] > CAL_MAX_SPAN_MS:
        raise ValueError('时间跨度超限')
    return out


def _valid_note(note: dict) -> dict:
    if not isinstance(note, dict) or not note.get('id'):
        raise ValueError('note 非法')
    text = note.get('text') or ''
    if not isinstance(text, str) or len(text) > MAX_TEXT_LEN:
        raise ValueError('正文超长')
    title = note.get('title') or ''
    if not isinstance(title, str) or len(title) > MAX_TITLE_LEN:
        raise ValueError('标题超长')
    tags = note.get('tags') or []
    if not isinstance(tags, list) or len(tags) > MAX_TAGS or not all(isinstance(t, str) for t in tags):
        raise ValueError('tags 非法')
    rev = note.get('rev')
    if rev is not None and (not isinstance(rev, (int, float)) or isinstance(rev, bool) or rev < 0):
        raise ValueError('note.rev 非法')
    todo = note.get('todo')
    if todo is not None and not isinstance(todo, bool):
        raise ValueError('note.todo 非法')
    todos = note.get('todos')
    if todos is not None:
        if not isinstance(todos, list):
            raise ValueError('note.todos 非法')
        if len(todos) > MAX_TODOS:
            raise ValueError(f'事项超限（最多 {MAX_TODOS} 条）')
        clean = []
        for t in todos:
            if not isinstance(t, dict):
                raise ValueError('事项非法')
            txt = t.get('text')
            if not isinstance(txt, str):
                raise ValueError('事项非法')
            txt = txt.strip()
            if not txt:
                continue  # 行内编辑清空到失焦之间的瞬态空行：落库时丢弃，不报错
            if len(txt) > MAX_TODO_TEXT:
                raise ValueError('事项文本超长')
            tid = t.get('id')
            if not isinstance(tid, str) or not tid.strip():
                tid = uuid.uuid4().hex  # 旧客户端未带 id：补齐，便于多端列表稳定
            clean.append({'id': tid.strip()[:80], 'text': txt, 'done': bool(t.get('done'))})
        note['todos'] = clean
    note.setdefault('tags', [])
    return note


class Jot(Service):
    def __init__(self, ctx):
        super().__init__(ctx, 'anka-jot')
        self.store = store_mod.Store(DATA_DIR)
        self.media = media_mod.MediaStore(DATA_DIR, thumb_mod)
        log.info('jot service ready, data=%s', DATA_DIR)

    # ─── 快照（/state 也用它） ──────────────────────
    def snapshot(self, sinceRev: int = 0, limit: int = 500):
        return self.store.snapshot(int(sinceRev or 0), min(int(limit or 500), 1000))

    # ─── 日历（远端数据源：整月计数 + 按天分页） ──────
    def calendar_counts(self, dayStarts: list, knownRev: int = 0):
        """dayStarts 为客户端算好的 N+1 个本地零点毫秒（服务端不做时区推断，
        避免夏令时月按固定 offset 切天出错）。knownRev 命中则只回版本号。"""
        starts = _valid_day_starts(dayStarts)
        r = self.store.calendar_counts(starts)
        if knownRev and int(knownRev) == r['rev']:
            return {'days': [], 'rev': r['rev'], 'unchanged': True}
        return {**r, 'unchanged': False}

    def notes_by_day(self, startMs, endMs, cursor=None, limit: int = 20):
        lo, hi = float(startMs), float(endMs)
        if hi <= lo:
            raise ValueError('时间范围非法')
        if hi - lo > CAL_MAX_DAY_MS:
            raise ValueError('单日跨度超限')
        return self.store.notes_by_day(lo, hi, cursor, int(20 if limit is None else limit))

    # ─── 笔记 ───────────────────────────────────────
    def upsert_note(self, note: dict, atts: list | None = None,
                    removedAtts: list | None = None):
        note = _valid_note(note)
        # atts=None → 不动服务端附件；显式 list → 按 id 增量 upsert（不隐式删除）。
        # 删除只认 removedAtts：兼容旧客户端的全量列表语义，避免过期列表抹掉新附件。
        if atts is not None:
            if len(atts) > MAX_ATTS_PER_NOTE:
                log.warning('atts 超限截断: %d > %d (noteId=%s)',
                            len(atts), MAX_ATTS_PER_NOTE, note.get('id'))
                atts = atts[:MAX_ATTS_PER_NOTE]
        if removedAtts is not None:
            if not isinstance(removedAtts, list) or not all(isinstance(a, str) for a in removedAtts):
                raise ValueError('removedAtts 非法')
        if atts:
            atts = [{**a, **self.media.try_thumbnail(a['serverPath'], a['kind'])}
                    if a.get('serverPath') and a.get('kind') in ('image', 'video') and not a.get('thumbPath')
                    else a for a in atts]
        final, applied = self.store.upsert_note(note, atts, removedAtts)
        log.info('upsert_note 落库: id=%s rev=%s applied=%s',
                 final['id'], final['rev'], applied)
        return {'note': final, 'applied': applied, 'serverRev': final['rev']}

    def get_note(self, id: str):
        note = self.store.get_note(str(id))
        if note is None:
            raise ValueError('笔记不存在')
        return note

    def delete_note(self, id: str):
        return {'deleted': self.store.delete_note(str(id))}

    # ─── 标签 ───────────────────────────────────────
    def upsert_tag(self, name: str, color: str | None = None,
                   pinned: bool | None = None):
        self.store.upsert_tag(str(name).strip().lstrip('@'), color, pinned)
        return {'ok': True}

    # ─── 媒体上传（分块 base64） ─────────────────────
    def upload_begin(self, attId: str, kind: str, mime: str, size: int,
                     sha256: str, thumbB64: str | None = None):
        existed = self.store.has_media(sha256)
        if existed and self.media.has_file(existed['path']):
            thumb = self.media.try_thumbnail(existed['path'], existed['kind'], thumbB64)
            return {'ok': True, 'exists': True, 'path': existed['path'], **thumb}
        return self.media.begin(str(attId), str(kind), str(mime),
                                int(size), str(sha256))

    def upload_chunk(self, attId: str, seq: int, b64: str):
        return self.media.chunk(str(attId), int(seq), str(b64))

    def upload_end(self, attId: str, thumbB64: str | None = None):
        r = self.media.end(str(attId), thumbB64)
        self.store.put_media(r['sha256'], r['path'], r['size'], r['kind'])
        self.store.set_att_media(str(attId), r['path'], r['thumbPath'])
        return r

    def ensure_thumbnail(self, attId: str, thumbB64: str | None = None, force: bool = False):
        """Repair legacy/missing covers without uploading or downloading the original again."""
        att = self.store.att_row(str(attId))
        if not att or att['kind'] not in ('image', 'video'):
            raise ValueError('图片或视频附件不存在')
        path = att.get('serverPath')
        if not path and att.get('sha256'):
            media = self.store.has_media(att['sha256'])
            path = media['path'] if media else None
        if not path:
            raise ValueError('原文件尚未上传，请稍后重试')
        thumb = self.media.ensure_thumbnail(path, att['kind'], thumbB64, bool(force))
        self.store.set_att_media(att['id'], path, thumb)
        return {'ok': True, 'path': path, 'thumbPath': thumb}

    # ─── AI 能力 ────────────────────────────────────
    def ocr_image(self, attId: str):
        att = self.store.att_row(str(attId))
        if att is None:
            raise ValueError('附件不存在')
        if att['kind'] != 'image':
            raise ValueError('仅图片支持 OCR')
        # 路径必须经 MediaStore 白名单解析：atts.serverPath 可由客户端写入，不能直接拼
        fp = self.media.resolve_media(str(att.get('serverPath') or ''))
        r = ai_mod.ocr_image(self.ctx, fp)
        if r.get('ok'):
            self.store.set_att_text(str(attId), 'ocrText', r['text'])
        return r

    def transcribe(self, attId: str, lang: str = 'zh-CN'):
        # 预留：whisper 适配器接入点。当前无服务端转写能力。
        return {'ok': False, 'reason': 'no_adapter',
                'message': '服务端转写适配器未配置（whisper 接入后开通）'}

    def summarize(self, noteId: str | None = None,
                  sinceMs: float | None = None, tag: str | None = None):
        snap = self.store.snapshot(0)
        notes = [n for n in snap['notes'] if not n['deleted']]
        if noteId:
            notes = [n for n in notes if n['id'] == noteId]
        if sinceMs:
            notes = [n for n in notes if n['createdAt'] >= float(sinceMs)]
        if tag:
            notes = [n for n in notes if tag in (n['tags'] or [])]
        notes.sort(key=lambda n: n['createdAt'])
        return ai_mod.summarize(self.ctx, notes[:50])

    def extract_todos(self, noteId: str):
        note = self.store.get_note(str(noteId))
        if note is None:
            raise ValueError('笔记不存在')
        return ai_mod.extract_todos(self.ctx, note)

    # ─── 搜索 / 统计 ────────────────────────────────
    def search(self, q: str, kind: str | None = None, tag: str | None = None):
        q = (q or '').strip()
        if not q:
            return {'hits': []}
        return {'hits': self.store.search(q, kind, tag)}

    def stats(self):
        snap = self.store.snapshot(0)
        alive = [n for n in snap['notes'] if not n['deleted']]
        return {'notes': len(alive), 'tags': len(snap['tags']),
                'serverRev': snap['serverRev'],
                'ts': int(time.time() * 1000)}


def apply(ctx, config):
    return Jot(ctx)
