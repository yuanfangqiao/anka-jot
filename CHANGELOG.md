# Changelog — 即刻 Jot

格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循语义化版本。

## [Unreleased]

### 修复（2026-10-16 录像保存丢失）
- 修复首页「视频」/「相册」入口新建笔记整条丢失：此前先 `saveDebounced` 后挂附件，`persist` 的「空笔记」保护在附件落库前判空直接跳过，`touchNote` 又查不到笔记，详情页 `getNote` 为空直接弹回主页。改为对齐 Record/Camera 既有顺序——附件先落库、`flushSave` 再持久化（图片相册路线原先靠定位回调的延迟 persist 碰巧救回；视频处理慢且无回调，必然丢失）
- 视频文件判定加空 mime 扩展名兜底（`isVideoFile`），拒绝时 toast 提示不再静默；`<input>` 处理后重置 value，同一文件可重复触发 change

### 新增（2026-10-16 视频笔记）
- **视频笔记**：首页五入口新增「视频」（移动端 `<input capture>` 直呼系统相机录像，免网页授权）+ 相册导入放开 `video/*`；`store.attachVideo` 管线自动抽封面帧（`lib/video.ts`，0.3s 截帧 → 480px JPEG，沿用 `:thumb` 约定），无法解码的格式（如桌面 Chrome 遇 HEVC）降级无封面、不阻塞导入
- 主页新增视频卡（3:4 海报 + 中央 ▶ + 左下时长角标，点封面全屏播放 `VideoViewer`、点边框进详情）；复合卡无图时用视频海报当封面；详情页视频块 `VideoCard`
- 同步链路视频全打通：`sync.ts` mime 兜底 + 缩略图携带，`server/media.py` kind 白名单 + 扩展名映射，单文件上限 25MB → 100MB（前端 `VIDEO_MAX_BYTES` 同步守卫）
- 详情页附件采集逻辑抽为 `state/picker.ts`（相册导入 / 拍照 / 录像统一入口）

### 重构（2026-10-15 主页卡片体系）
- 主页卡片改固定尺寸四类：图片卡 / 复合卡 3:4 竖卡（`jot-card-std`），纯文字卡 1:1 方卡（`jot-card-text`）错落排布，语音卡为 64px 矮条语音条（`jot-card-voice`，整条点击播放/暂停），卡片高度不再随图片自然高度失控
- 文字卡改小红书语录卡：首字 djb2 哈希确定性取色（`lib/color.ts`，10 色马卡龙色板），彩底 + 纸感噪点纹理防眩 + 内高光（`jot-textcard`），居中大字号排版；无标题时正文首行即标题，主页不再有「未命名」白条卡
- 图片卡满幅封面（`jot-imgcard`，object-cover 裁切）；点击图片区直接全屏预览（共用查看器 `ImgViewer.vue`，从 `ImgGrid` 抽取），点卡片其余区域进详情；多图带 x 张玻璃角标（`jot-imgbadge`）
- 语音卡为整条语音条，点击即播/暂停（波形随进度点亮），时间戳在右下角；播放逻辑抽为 `lib/useAudioPlayer.ts`，详情页 `AudioCard` 行为不变
- 复合卡上图下文（`jot-comp-img` 固定 56% 高 + `jot-comp-body`），图区点预览、文区进详情；含音频叠迷你播放钮（`jot-comp-play`）；无图复合（语音+文字）退化为彩卡 + 播放钮
- 卡片底部不再标注类型图标，仅保留时间 + 同步状态点（`jot-card-foot`）；语音卡/文字卡时间统一显示在右下角（`jot-vc-time` 绝对定位 + `jot-tc-foot` 右对齐）
- 深色主题彩卡经 `color-mix` 降明度适配（`html[data-theme='dark'] .jot-textcard`）

### 优化（2026-10-15 真机 UI 美化）
- 首页瀑布流改响应式 2/3/4 列（JS `matchMedia`）+ `jot-container` 容器断点，修复 iPad/桌面两侧大片留白
- 底部工具条改为圆角方块瓷贴（`jot-bar-wrap/item/tile`），与宿主胶囊 dock 视觉区分
- 语音卡改为气泡样式（播放钮 + 波形 + 时长，`jot-voicebar*`）；无 peaks 的旧录音显示占位波形
- 封面图加载失败显示渐变占位（`jot-cover-missing`），不再破图
- 日期分隔线强化：双侧渐变细线 + 加粗标签（`jot-date-sep`）
- 卡片统一 `jot-card`：发丝边框 + 分层柔影 + 按压 scale 反馈
- 日期分组时间线：同天笔记归入一个日期头下

### 文档（2026-10-15）
- 新增 `README.md`：核心架构（离线优先数据流 / MicSession / capture 拍照 / `jot-` 语义类体系）+ 语义类速查表 + Do/Don't
- 新增 `AGENT.md`：插件私有 AI 工作守则与文档同步纪律
- 新增 `FEATURE.md`：功能状态全景

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
