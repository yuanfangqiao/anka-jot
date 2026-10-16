"""480px JPEG thumbnails. FFmpeg is only needed when the client supplied no usable JPEG."""
import shutil
import subprocess
import threading
from pathlib import Path

EDGE = 480
MAX_THUMB = 512 * 1024
LOCKS = tuple(threading.Lock() for _ in range(32))
SLOTS = threading.BoundedSemaphore(2)


def valid_thumbnail(data: bytes) -> bool:
    """Reject empty/oversized/non-JPEG input and full-size images mislabeled as thumbnails."""
    if not 4 < len(data) <= MAX_THUMB or not data.startswith(b'\xff\xd8') or not data.endswith(b'\xff\xd9'):
        return False
    offset = 2
    while offset + 4 < len(data):
        if data[offset] != 255:
            return False
        while offset < len(data) and data[offset] == 255:
            offset += 1
        if offset + 3 >= len(data):
            return False
        marker = data[offset]
        offset += 1
        length = int.from_bytes(data[offset:offset + 2], 'big')
        if length < 2 or offset + length > len(data):
            return False
        if marker in (0xC0, 0xC1, 0xC2):
            height = int.from_bytes(data[offset + 3:offset + 5], 'big')
            width = int.from_bytes(data[offset + 5:offset + 7], 'big')
            return length >= 8 and 0 < width <= EDGE and 0 < height <= EDGE
        offset += length
    return False


def generate_thumbnail(source: Path, kind: str) -> bytes:
    ffmpeg = shutil.which('ffmpeg')
    if not ffmpeg:
        raise ValueError('服务器未安装 FFmpeg，无法补生成缩略图；请安装 FFmpeg 或上传前端缩略图')
    # Retry the first frame for very short videos; the normal frame avoids an initial black screen.
    seeks = ('0.3', '0') if kind == 'video' else (None,)
    with SLOTS:
        for seek in seeks:
            command = [ffmpeg, '-hide_banner', '-loglevel', 'error', '-nostdin',
                       '-threads', '1', '-protocol_whitelist', 'file,pipe',
                       *(['-ss', seek] if seek is not None else []),
                       '-i', str(source), '-map', '0:v:0',
                       '-frames:v', '1', '-an', '-vf',
                       "scale=w='min(480,iw)':h='min(480,ih)':force_original_aspect_ratio=decrease,setsar=1",
                       '-threads', '1', '-q:v', '4', '-f', 'image2pipe', '-vcodec', 'mjpeg', 'pipe:1']
            try:
                result = subprocess.run(command, capture_output=True, timeout=15, check=False)
            except (OSError, subprocess.TimeoutExpired) as error:
                raise ValueError('缩略图生成超时或 FFmpeg 不可用') from error
            if result.returncode == 0 and valid_thumbnail(result.stdout):
                return result.stdout
    raise ValueError('无法解码媒体生成缩略图，请上传浏览器生成的 JPEG 封面')
