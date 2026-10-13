"""即刻 Jot — 后端 Service 入口。

宿主 loader 以 importlib 按文件路径加载本模块（非包），同级模块经 _load 按路径引入。
所有公开方法即 /api/apps/jot/call 的可调用契约（_ 开头与 snapshot 由宿主保留语义）。
"""

import importlib.util
import logging
import sys
import time
from pathlib import Path

from app.cordis import Service

log = logging.getLogger('agentos.jot')

name = 'jot'
inject = ['llm']
provide = ['jot']

SERVER_DIR = Path(__file__).resolve().parent
DATA_DIR = SERVER_DIR.parent / 'data'


def _load(mod_name: str, filename: str):
    full = f'app_plugins.jot.{mod_name}'
    if full in sys.modules:
        return sys.modules[full]
    spec = importlib.util.spec_from_file_location(full, SERVER_DIR / filename)
    mod = importlib.util.module_from_spec(spec)
    sys.modules[full] = mod
    spec.loader.exec_module(mod)
    return mod


store_mod = _load('store', 'store.py')
media_mod = _load('media', 'media.py')
ai_mod = _load('ai', 'ai.py')

MAX_ATTS_PER_NOTE = 50
MAX_TEXT_LEN = 200_000


def _valid_note(note: dict) -> dict:
    if not isinstance(note, dict) or not note.get('id'):
        raise ValueError('note 非法')
    if len(note.get('text') or '') > MAX_TEXT_LEN:
        raise ValueError('正文超长')
    note.setdefault('tags', [])
    return note


class Jot(Service):
    def __init__(self, ctx):
        super().__init__(ctx, 'jot')
        self.store = store_mod.Store(DATA_DIR)
        self.media = media_mod.MediaStore(DATA_DIR)
        log.info('jot service ready, data=%s', DATA_DIR)

    # ─── 快照（/state 也用它） ──────────────────────
    def snapshot(self, sinceRev: int = 0):
        return self.store.snapshot(int(sinceRev or 0))

    # ─── 笔记 ───────────────────────────────────────
    def upsert_note(self, note: dict, atts: list | None = None):
        log.info('upsert_note 收到: id=%s title=%r', (note or {}).get('id'),
                 (note or {}).get('title'))
        note = _valid_note(note)
        atts = list(atts or [])[:MAX_ATTS_PER_NOTE]
        final, applied = self.store.upsert_note(note, atts)
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
                     sha256: str):
        existed = self.store.has_media(sha256)
        if existed:
            return {'ok': True, 'exists': True, 'path': existed['path']}
        return self.media.begin(str(attId), str(kind), str(mime),
                                int(size), str(sha256))

    def upload_chunk(self, attId: str, seq: int, b64: str):
        return self.media.chunk(str(attId), int(seq), str(b64))

    def upload_end(self, attId: str, thumbB64: str | None = None):
        r = self.media.end(str(attId), thumbB64)
        self.store.put_media(r['sha256'], r['path'], r['size'], 'image')
        self.store.set_att_media(str(attId), r['path'], r['thumbPath'])
        return r

    # ─── AI 能力 ────────────────────────────────────
    def ocr_image(self, attId: str):
        att = self.store.att_row(str(attId))
        if att is None:
            raise ValueError('附件不存在')
        if att['kind'] != 'image':
            raise ValueError('仅图片支持 OCR')
        r = ai_mod.ocr_image(self.ctx, DATA_DIR, att)
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
