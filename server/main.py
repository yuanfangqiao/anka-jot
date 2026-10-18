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
