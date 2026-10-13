# Changelog — 即刻 Jot

格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循语义化版本。

## [0.1.0] - 2026-10-12

首个可用版本（M0–M6 一次性交付）。离线优先的 PWA 多媒体速记。

### 新增
- **采集**：四入口新建（文本/拍照/相册/语音）；相机实时取景、连拍、扫描模式；相册多选导入；MediaRecorder 分片录音
- **转写与 OCR**：SpeechRecognition 实时语音转写（双轨存储、逐句编辑）；拍照 OCR（`ctx.llm` 视觉模型），结果可编辑、入搜索
- **组织**：彩色标签与置顶；时间线卡片流；日历视图（月历打点 + 当日时间轴）；智能相册（按地点/周聚合）
- **搜索**：本地全文索引（标题/正文/OCR/转写），中文 bigram 分词，结果高亮与类型/标签过滤
- **离线与同步**：IndexedDB 事实源 + outbox 队列；`/api/apps/jot/call` 推拉同步（笔记级 LWW + 本地历史）；离线横幅与每笔记同步徽标；online 事件 + 60s 心跳补传
- **AI**：单篇摘要、待办提取、发现页本周摘要（无模型 Key 时优雅降级）
- **媒体工程**：图片自动压缩（≤2048px）+ 缩略图（480px）；sha256 内容寻址去重；分块 base64 上传（1MB/块）
- **设置**：位置/语言开关、存储用量、JSON 导出

### 已知限制
- iOS Safari(PWA) 无 SpeechRecognition，语音转写降级为「仅录音」
- 同步为轮询推拉，未接 `ctx.sync` 实时通道
- 扫描模式无透视裁边；share_target / Background Sync 待宿主配合

[0.1.0]: https://localhost/plugins/jot
