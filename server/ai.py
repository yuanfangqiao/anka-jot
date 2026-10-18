"""即刻 Jot — AI 能力：OCR / 摘要 / 待办抽取。红线：只经 ctx.llm，不直调 SDK。"""

import base64
import json
import logging
import re
from pathlib import Path

log = logging.getLogger('agentos.jot.ai')

NO_LLM = {'ok': False, 'reason': 'no_llm',
          'message': '未配置模型服务（设置 → TokenHub 填入 Key 后可用）'}

OCR_PROMPT = (
    '你是 OCR 引擎。逐字转录图片中的印刷体与手写体文字，保留原有段落与换行。'
    '不要翻译、不要解释、不要添加任何前后缀。图片中没有文字时输出空字符串。')

SUMMARY_PROMPT = (
    '你是私人笔记助手。根据用户给出的笔记内容（含正文、OCR、语音转写），'
    '输出 Markdown：## 摘要（3-5 句）→ ## 要点（bullet）→ ## 待办（- [ ] ，无则省略此节）。'
    '语言与笔记一致，不要编造笔记中没有的事实。')

TODO_PROMPT = (
    '从笔记中抽取待办事项。只输出 JSON 数组，形如 '
    '[{"text":"买牛奶","due":"2026-10-13 09:00"}]，due 可省略。'
    '没有待办输出 []。不要输出任何其他内容。')


def _llm(ctx):
    return getattr(ctx, 'llm', None)


def _collect(stream) -> str:
    out = []
    for ev in stream or []:
        if isinstance(ev, dict) and ev.get('type') == 'text':
            out.append(ev.get('content') or '')
        elif isinstance(ev, str):
            out.append(ev)
    return ''.join(out).strip()


def _available(ctx) -> bool:
    llm = _llm(ctx)
    return bool(llm and getattr(llm, 'adapters', None))


def ocr_image(ctx, fp: Path) -> dict:
    """fp 必须是调用方已用 MediaStore.resolve_media 校验过的绝对路径。

    这里不再接受客户端上报的 serverPath 自行拼路径：note 表可由客户端写入，
    拼 data_dir.parent / path 会变成任意文件读取，且读到的内容会发给云端模型。
    """
    if not _available(ctx):
        return NO_LLM
    source = Path(fp)
    if not source.is_file():
        raise ValueError('媒体文件不存在')
    b64 = base64.b64encode(source.read_bytes()).decode()
    ext = source.suffix.lstrip('.').lower() or 'jpeg'
    mime = 'image/png' if ext == 'png' else ('image/webp' if ext == 'webp' else 'image/jpeg')
    messages = [{'role': 'user', 'content': [
        {'type': 'text', 'text': OCR_PROMPT},
        {'type': 'image_url', 'image_url': {'url': f'data:{mime};base64,{b64}'}}]}]
    text = _collect(_llm(ctx).stream(messages, model='default'))
    if not text or '[no adapter]' in text:
        return NO_LLM
    return {'ok': True, 'text': text}


def _gather_text(note: dict) -> str:
    parts = [f"# {note.get('title') or '未命名'}", note.get('text') or '']
    for a in note.get('atts') or []:
        if a.get('ocrText'):
            parts.append(f"[图片OCR]\n{a['ocrText']}")
        for seg in (a.get('transcript') or []):
            parts.append(seg.get('text') or '')
    return '\n'.join(p for p in parts if p)


def summarize(ctx, notes: list) -> dict:
    if not _available(ctx):
        return NO_LLM
    if not notes:
        raise ValueError('没有可摘要的笔记')
    body = '\n\n---\n\n'.join(_gather_text(n) for n in notes)[:24000]
    messages = [{'role': 'user', 'content': f'{SUMMARY_PROMPT}\n\n{body}'}]
    text = _collect(_llm(ctx).stream(messages, model='default'))
    if not text or '[no adapter]' in text:
        return NO_LLM
    return {'ok': True, 'markdown': text}


def extract_todos(ctx, note: dict) -> dict:
    if not _available(ctx):
        return NO_LLM
    body = _gather_text(note)[:8000]
    messages = [{'role': 'user', 'content': f'{TODO_PROMPT}\n\n{body}'}]
    raw = _collect(_llm(ctx).stream(messages, model='default'))
    if not raw or '[no adapter]' in raw:
        return NO_LLM
    m = re.search(r'\[.*\]', raw, re.S)
    try:
        todos = json.loads(m.group(0)) if m else []
    except Exception:
        todos = [{'text': ln.strip('- [].')} for ln in raw.splitlines()
                 if ln.strip()][:20]
    return {'ok': True, 'todos': [t for t in todos
                                  if isinstance(t, dict) and t.get('text')]}
