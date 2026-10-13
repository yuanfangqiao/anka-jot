"""即刻 Jot — 媒体分块上传与内容寻址存储。

- 会话态仅存内存（上传中断重传即可，块小代价低）
- 落盘按 sha256 内容寻址：data/media/<前2位>/<sha256>.<ext>，跨笔记天然去重
- 缩略图同目录 <sha256>.thumb.jpg
"""

import base64
import hashlib
import time
from pathlib import Path

MAX_FILE = 25 * 1024 * 1024          # 25MB
MAX_CHUNK = 1024 * 1024              # 单块原始字节上限 1MB
EXT_BY_KIND = {
    ('image', 'image/jpeg'): 'jpg', ('image', 'image/png'): 'png',
    ('image', 'image/webp'): 'webp',
    ('audio', 'audio/mp4'): 'm4a', ('audio', 'audio/webm'): 'webm',
    ('audio', 'audio/m4a'): 'm4a', ('audio', 'audio/mpeg'): 'mp3',
}


class MediaStore:
    def __init__(self, data_dir: Path):
        self.media_dir = data_dir / 'media'
        self.media_dir.mkdir(parents=True, exist_ok=True)
        self._sessions: dict[str, dict] = {}

    def begin(self, att_id: str, kind: str, mime: str, size: int, sha256: str):
        if kind not in ('image', 'audio'):
            raise ValueError(f'不支持的媒体类型 {kind}')
        ext = EXT_BY_KIND.get((kind, (mime or '').lower()))
        if ext is None:
            raise ValueError(f'不支持的 mime: {mime}')
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
        thumb_rel = None
        if thumb_b64:
            thumb_rel = self._write(digest, 'thumb.jpg',
                                    base64.b64decode(thumb_b64))
        return {'ok': True, 'path': rel, 'thumbPath': thumb_rel,
                'sha256': digest, 'size': len(buf)}

    def _write(self, digest: str, ext: str, buf: bytes) -> str:
        sub = self.media_dir / digest[:2]
        sub.mkdir(parents=True, exist_ok=True)
        fp = sub / f'{digest}.{ext}'
        if not fp.exists():
            fp.write_bytes(buf)
        return f'data/media/{digest[:2]}/{digest}.{ext}'

    def abort(self, att_id: str):
        self._sessions.pop(att_id, None)

    def gc_sessions(self, max_age: float = 3600):
        now = time.time()
        for k in [k for k, v in self._sessions.items()
                  if now - v['created'] > max_age]:
            del self._sessions[k]
