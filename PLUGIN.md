# 即刻 Jot — 插件文档

> anka app 插件 · PWA 多媒体速记 · 设计与验收标准见 [DESIGN.md](./DESIGN.md)

## 这是什么

「即刻」是 anka 平台上的随手记应用：文字 / 拍照 / 相册 / 语音四入口，离线优先（IndexedDB 为设备端事实源），支持拍照 OCR、语音实时转写、全文搜索、标签与时间线。中文名**即刻**，英文 **Jot**。

核心原则：**打开即记（≤1 步）、拍完即存（≤2 步，杀进程不丢）、说完出字、事后好找**。

## 当前功能（v0.1.0）

### 已实现 ✅
- **一键新建 + 四入口**：底部「＋」ActionSheet / 首页四宫格 → 文本、拍照、相册、语音
- **文字速记**：标题 + 正文（`- [ ]` 待办、`@标签` 语法），500ms 防抖自动存草稿，退出不丢；空笔记自动丢弃
- **实时拍照 + 连拍**：getUserMedia 后置取景、快门、连拍队列、自动压缩（≤2048px）+ 缩略图（480px）；**扫描模式**（参考框 + 拍后一键 OCR）
- **相册导入**：多选、压缩、缩略图、按时间入流
- **语音录音 + 实时转写**：MediaRecorder 分片录制（防崩溃丢整段），SpeechRecognition 实时出字（Chrome/桌面 Safari），双轨存「音频 + 分段文字稿」，可回听、可逐句改字、可搜
- **拍照 OCR**：服务端经 `ctx.llm` 视觉模型提取印刷体文字，可编辑、入全文搜索
- **自动元数据**：时间、来源、可选位置（全局开关，超时静默不记）
- **标签**：彩色标签、置顶、最近使用
- **时间线**：倒序卡片流（封面缩略图 + 摘要 + 来源徽标 + 标签），置顶区
- **日历视图**：月历打点 + 当日垂直时间轴
- **发现页**：最近标签、智能相册（按地点/周自动聚合）、AI 本周摘要卡
- **全文搜索**：标题/正文/OCR/转写，中文 bigram + 英文按词，权重排序，结果高亮片段；过滤器（类型/标签）
- **离线优先**：全部写操作先落 IndexedDB；离线横幅「N 项待同步」；联网自动补传 + 60s 前台心跳
- **多端同步**：`/api/apps/jot/call` 推拉（方案 B），笔记级 LWW + rev，冲突留本地历史（最近 3 版）
- **AI 助手**：单篇「AI 摘要 / 提取待办」（依赖宿主模型配置，无 Key 时优雅降级）
- **设置页**：位置/转写语言开关、存储用量、JSON 导出、后端状态

### 已知限制 ⚠️
- **iOS Safari(PWA) 不支持 SpeechRecognition** → iPhone 上「仅录音」，转写按钮待服务端 whisper 适配器（未配置时提示不可用）
- 同步为轮询推拉（60s + online 事件），未接 `ctx.sync` WebSocket 实时通道（spike T0 待验证，见 DESIGN §6.1）
- 对端笔记的媒体文件按需在线加载（离线未下载的远程图显示占位）
- 扫描模式仅参考框引导，未做透视裁边
- 分享剪藏（share_target）与 Background Sync 依赖宿主 manifest/SW 改动，未开启

## 数据与隐私

- 设备端：IndexedDB `jot-db`（notes / atts / blobs / tags / outbox / kv / history）
- 服务端：`plugins/jot/data/`（`jot.db` + `media/<sha256 前两位>/<sha256>.<ext>` 内容寻址，天然去重）
- 媒体 URL：`/plugins/jot/data/media/...`（dev 由 vite 中间件伺服，prod 由 FastAPI StaticFiles）
- 备份 = 复制 `plugins/jot/data/` 目录；应用内零鉴权，公网部署依赖 Caddy basic_auth
- 卸载插件不删除数据目录（当前内核行为）

## 开发记录

| 里程碑 | 内容 | 状态 |
|---|---|---|
| M0 骨架联调 | plugin.json / Service / 注册链路 / prod 构建 | ✅ v0.1.0 |
| M1 文字+时间线 | IDB、自动草稿、标签、本地搜索 | ✅ v0.1.0 |
| M2 拍照+相册 | 相机、图片管线、连拍、扫描模式 | ✅ v0.1.0 |
| M3 录音+转写 | 录音、波形、实时转写、回放编辑 | ✅ v0.1.0 |
| M4 后端+OCR | 分块上传、sha256 去重、视觉 OCR | ✅ v0.1.0 |
| M5 同步 | outbox 推拉、LWW、离线横幅 | ✅ v0.1.0（方案 B） |
| M6 P1 精选 | 日历、待办提取、智能相册、AI 摘要、导出 | ✅ v0.1.0（待办提醒未做） |

## 后续计划（Backlog）

**P1**
- [ ] `ctx.sync` WS 实时同步（替换轮询方案 B，需 spike 验证 room/file 语义）
- [ ] 待办提醒（Notification 定时 + 周期提醒）
- [ ] 模板速建（会议纪要/购物清单/旅行日志/读书摘抄/维修记录）
- [ ] 分享剪藏（宿主 manifest 加 share_target → `/jot?share=1`）
- [ ] Background Sync（宿主 SW 注入）
- [ ] 扫描模式透视裁边 + 图像增强
- [ ] 服务端 whisper 转写适配器（补 iOS 短板）
- [ ] 远程媒体离线预取策略

**P2**
- [ ] 手写/涂鸦画板
- [ ] 故事式回顾（按月/旅行上下滑混排流）
- [ ] 导出 Markdown/PDF/长图/加密 JSON（现有 JSON 导出为基础版）
- [ ] 智能场景识别（自动推荐模板与标签）
- [ ] 安全锁（生物识别）与端到端加密同步
- [ ] 协作笔记本（明确暂缓，避免做重）

## 调试

- 开发：`./start_all.sh` → 插件管理页安装「即刻 Jot」→ dock 进入；改 `web/` 源码刷新即生效（vite 即时编译），改 `server/` 需重启后端
- 生产：`cd web && npm run build` 后从 8000 端口访问（安装时自动跑 `build-plugin.mjs` 产出 `.plugin-dist/jot/index.js`）
- 后端日志关键字：`agentos.jot`
- 常用排障：浏览器 DevTools → Application → IndexedDB `jot-db`；`plugins/jot/data/jot.db` 可用 sqlite3 直查
