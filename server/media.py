"""即刻 Jot — 媒体分块上传与内容寻址存储。

- 会话态仅存内存（上传中断重传即可，块小代价低）
- 落盘按 sha256 内容寻址：data/media/<前2位>/<sha256>.<ext>，跨笔记天然去重
- 缩略图同目录 <sha256>.thumb.jpg
"""

import base64
import hashlib
import importlib.util
import logging
import os
import tempfile
import time
from pathlib import Path

log = logging.getLogger('agentos.jot.media')

MAX_FILE = 100 * 1024 * 1024         # 100MB（视频附件入场后上调；前端 video.ts 同步守卫）
MAX_CHUNK = 1024 * 1024              # 单块原始字节上限 1MB
EXT_BY_KIND = {
    ('image', 'image/jpeg'): 'jpg', ('image', 'image/png'): 'png',
    ('image', 'image/webp'): 'webp',
    ('audio', 'audio/mp4'): 'm4a', ('audio', 'audio/webm'): 'webm',
    ('audio', 'audio/m4a'): 'm4a', ('audio', 'audio/mpeg'): 'mp3',
    ('audio', 'audio/aac'): 'm4a', ('audio', 'audio/x-m4a'): 'm4a',
    ('audio', 'audio/ogg'): 'ogg', ('audio', 'audio/wav'): 'wav',
    ('video', 'video/mp4'): 'mp4', ('video', 'video/quicktime'): 'mov',
    ('video', 'video/webm'): 'webm', ('video', 'video/x-m4v'): 'm4v',
    ('video', 'video/3gpp'): '3gp',
}
# mime 缺失/未识别时的兜底扩展名（不让未知 mime 成为同步毒丸）
EXT_FALLBACK = {'image': 'jpg', 'audio': 'm4a', 'video': 'mp4'}


def _ext_for(kind: str, mime: str) -> str:
    """归一化 mime（去 ;codecs= 参数，iOS Safari blob.type 常带）后查表，未识别按 kind 兜底。"""
    norm = (mime or '').split(';')[0].strip().lower()
    ext = EXT_BY_KIND.get((kind, norm))
    if ext is None:
        ext = EXT_FALLBACK[kind]
        log.warning('未识别 mime 按 %s 兜底: %r -> .%s', kind, mime, ext)
    return ext


class MediaStore:
    def __init__(self, data_dir: Path, thumbnails=None):
        if thumbnails is None:
            spec = importlib.util.spec_from_file_location('jot_thumbnails', Path(__file__).with_name('thumbnails.py'))
            thumbnails = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(thumbnails)
        self.data_dir = data_dir.resolve()
        self.thumbnails = thumbnails
        self.media_dir = data_dir / 'media'
        self.media_dir.mkdir(parents=True, exist_ok=True)
        self._sessions: dict[str, dict] = {}

    def begin(self, att_id: str, kind: str, mime: str, size: int, sha256: str):
        if kind not in ('image', 'audio', 'video'):
            raise ValueError(f'不支持的媒体类型 {kind}')
        ext = _ext_for(kind, mime)
        if size <= 0 or size > MAX_FILE:
            raise ValueError(f'文件大小非法: {size}')
        self._sessions[att_id] = {
            'kind': kind, 'ext': ext, 'size': size, 'sha256': sha256,
            'chunks': {}, 'created': time.time(),
        }
        return {'ok': True}

    def chunk(self, att_id: str, seq: int, b64: str) -> dict:
        s = self._sessions.get(att_id)
        if s is None:
            raise ValueError('上传会话不存在（需先 upload_begin）')
        raw = base64.b64decode(b64)
        if len(raw) > MAX_CHUNK:
            raise ValueError('块超过 1MB 上限')
        s['chunks'][int(seq)] = raw
        return {'ok': True, 'received': len(s['chunks'])}

    def end(self, att_id: str, thumb_b64: str | None = None) -> dict:
        s = self._sessions.pop(att_id, None)
        if s is None:
            raise ValueError('上传会话不存在')
        buf = b''.join(s['chunks'][i] for i in sorted(s['chunks']))
        if len(buf) != s['size']:
            raise ValueError(f"大小不符: 声明 {s['size']} 实收 {len(buf)}")
        digest = hashlib.sha256(buf).hexdigest()
        if digest != s['sha256']:
            raise ValueError('sha256 校验失败')
        rel = self._write(digest, s['ext'], buf)
        thumb = self.try_thumbnail(rel, s['kind'], thumb_b64)
        return {'ok': True, 'path': rel, **thumb,
                'sha256': digest, 'size': len(buf), 'kind': s['kind']}

    def has_file(self, path: str) -> bool:
        try:
            self._source(path)
            return True
        except ValueError:
            return False

    def resolve_media(self, path: str) -> Path:
        """把客户端上报的 serverPath 解析成已校验的绝对路径（唯一读盘入口）。

        path 必须形如 data/media/...，解析后必须仍在 media_dir 内且是文件，
        否则抛 ValueError。AI/预览等需要读原文件的能力都经这里，禁止自行拼路径。
        """
        return self._source(path)

    def _source(self, path: str) -> Path:
        if not isinstance(path, str) or not path.startswith('data/media/'):
            raise ValueError('媒体文件路径非法')
        source = (self.data_dir / path[5:]).resolve()
        if not source.is_relative_to(self.media_dir.resolve()) or not source.is_file():
            raise ValueError('媒体文件不存在或路径非法')
        return source

    def try_thumbnail(self, path: str, kind: str, thumb_b64: str | None = None) -> dict:
        if kind not in ('image', 'video'):
            return {'thumbPath': None}
        try:
            return {'thumbPath': self.ensure_thumbnail(path, kind, thumb_b64)}
        except ValueError as error:
            # Original upload must survive decoder failure; callers can retry with a client JPEG.
            log.warning('缩略图待修复: %s', error)
            return {'thumbPath': None, 'thumbnailError': str(error)}

    def ensure_thumbnail(self, path: str, kind: str, thumb_b64: str | None = None,
                         force: bool = False) -> str:
        source = self._source(path)
        if kind not in ('image', 'video'):
            raise ValueError('仅图片和视频支持缩略图')
        with self.thumbnails.LOCKS[hash(str(source)) % len(self.thumbnails.LOCKS)]:
            if not force:
                candidates = [*source.parent.glob(f'{source.stem}.thumb.*.jpg'),
                              source.with_suffix('.thumb.jpg')]
                for candidate in candidates:
                    if candidate.is_file() and candidate.stat().st_size <= self.thumbnails.MAX_THUMB:
                        if self.thumbnails.valid_thumbnail(candidate.read_bytes()):
                            return 'data/' + candidate.relative_to(self.data_dir).as_posix()
            data = None
            if thumb_b64 and len(thumb_b64) <= self.thumbnails.MAX_THUMB * 4 // 3 + 4:
                try:
                    data = base64.b64decode(thumb_b64, validate=True)
                except ValueError:
                    pass
            if not data or not self.thumbnails.valid_thumbnail(data):
                data = self.thumbnails.generate_thumbnail(source, kind)
            # Content-addressed cover URLs avoid serving an old broken cached cover after repair.
            digest = hashlib.sha256(data).hexdigest()[:16]
            return self._write(source.stem, f'thumb.{digest}.jpg', data)

    def _write(self, digest: str, ext: str, buf: bytes) -> str:
        sub = self.media_dir / digest[:2]
        sub.mkdir(parents=True, exist_ok=True)
        fp = sub / f'{digest}.{ext}'
        if not fp.exists() or (ext.startswith('thumb.') and fp.read_bytes() != buf):
            temporary = None
            try:
                with tempfile.NamedTemporaryFile(dir=sub, prefix='.', delete=False) as stream:
                    temporary = stream.name
                    stream.write(buf)
                os.replace(temporary, fp)
            finally:
                if temporary and os.path.exists(temporary):
                    os.unlink(temporary)
        return f'data/media/{digest[:2]}/{digest}.{ext}'

    def abort(self, att_id: str):
        self._sessions.pop(att_id, None)

    def gc_sessions(self, max_age: float = 3600):
        now = time.time()
        for k in [k for k, v in self._sessions.items()
                  if now - v['created'] > max_age]:
            del self._sessions[k]
