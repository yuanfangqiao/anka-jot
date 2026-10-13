# 即刻 Jot — 产品设计与工程方案

> PWA 多媒体速记 · anka 平台 app 插件 · v0.1 草案
> 状态：**设计评审稿（先不写代码）** · 2026-10-12

---

## 0. 宿主平台约束（方案前提，来自仓库实地调研）

| 约束 | 事实 | 对 Jot 的影响 |
|---|---|---|
| 插件形态 | `plugins/jot/{plugin.json, server/main.py, web/index.ts}`；`id` 与目录名、Service name 三处一致 | 按此骨架落地，不改内核 |
| 前端零依赖 | 插件**禁止 import npm 包**，一切经 `uiCtx`（vue 原语/components/icons/api/toast/layout） | 无 dexie/波形库；IndexedDB、波形、EXIF 手写 |
| 后端通道 | 无插件私有路由，一律 `GET /api/apps/jot/state`、`POST /api/apps/jot/call {method,args}` | API 全部设计为 Service 公开方法 |
| 文件上传 | 宿主无 multipart 端点；现惯例是 data URL 塞 JSON | 媒体走 `/call` 分块 base64 上传（带去重/校验） |
| 静态伺服 | FastAPI 已 mount `/plugins/**` | 媒体落盘 `plugins/jot/data/media/`，URL 直接可访问 |
| LLM | `ctx.llm.stream(messages, model)` 现成，视觉 image_url 已在 agent_loop 打通；红线：禁止直调 provider SDK | OCR / AI 摘要 / 待办抽取零新基础设施；无 Key 自动回退 Echo，UI 需降级提示 |
| 多端同步 | `ctx.sync` 通用同步（WS `/api/sync/ws/{room}?app=&file=`，SQLite op-log，单消息 256KB，前端参考 `useShellSync`） | 元数据同步复用；二进制走 HTTP |
| PWA | 宿主 vite-plugin-pwa(Workbox)，`/api`、`/plugins` GET NetworkFirst，SW 仅生产启用 | 外壳缓存白得；插件补 IndexedDB 数据层 |
| 代码红线 | 组件单一根元素；过渡禁 `mode="out-in"`；单文件 ≤300 行；副作用注册 `fiber.effect` 可逆卸载 | 文件按 ≤300 行拆分（§8.2） |
| 鉴权 | 应用内零鉴权，生产靠 Caddy basic_auth | Jot 不做权限模型 |
| 现状空白 | 全仓无 IndexedDB / getUserMedia / MediaRecorder / OCR / 转写先例 | Jot 首开，必须含降级矩阵（§11） |

**需宿主配合的白名单改动（需评审，见 §13）**
1. 确认 dev 下 `/plugins/<id>/data/**` 是否经 vite 透传 FastAPI；不透传则加一条 proxy。
2.（可选 P1）宿主 manifest 加 `share_target` → `/jot?share=1`。
3.（可选 P1）宿主 SW 注入 Background Sync；不做则退化为前台补传 + `online` 事件。

---

## 1. 产品定位与核心原则

**即刻 Jot**：打开即记、拍完即存、说完出字、事后好找。借鉴 Keep 的快建 + Apple 的扫描 OCR + Obsidian 的本地所有权 + 会议软件的语音转写；**不学 Notion 做数据库**。

四条核心链路即验收标准：

| 链路 | 步数目标 | 度量 |
|---|---|---|
| 打开即记 | ≤1 步（进 app 键盘即弹起） | 冷启动到可输入 < 2s |
| 拍完即存 | ≤2 步（＋→快门，照片直入当前笔记） | 中途杀进程不丢 |
| 说完出字 | 录音同时出文字稿 | 转写延迟 < 1s（浏览器支持时） |
| 事后好找 | 一次搜索命中标题/正文/OCR/转写 | 千条笔记本地搜索 < 100ms |

---

## 2. 功能分层与范围

### P0（MVP，必做）
1. **一键新建 + 四入口**：首页常驻「＋」+ 快捷四宫格（文本/拍照/相册/语音），对应设计稿首页
2. **文字速记**：纯文本 + 轻格式（标题、加粗、清单、@标签）；草稿自动存，关闭不丢
3. **实时拍照 + 连拍**：getUserMedia 后置预览、快门、连拍、自动压缩；拍完直接进当前笔记
4. **相册选图**：多选、自动生成缩略图、按时间排序
5. **语音录音 + 实时转写**：开始/停止；双轨存「音频 + 文字稿」，可回听、可改字、可搜
6. **自动元数据**：时间、来源（文本/拍照/语音）、可选位置（Geolocation，可关）
7. **标签**：手工标签 + 颜色 + 常用置顶
8. **时间线**：倒序卡片流（设计稿首页）
9. **本地离线存**：IndexedDB 为设备端唯一事实源，离线全功能可写
10. **搜索**：标题 + 正文 + OCR + 转写全文，客户端索引

### P1（增强，MVP 后紧随）
11. **拍照 OCR**：视觉模型提取印刷体文字，可编辑、入搜索；扫描模式（自动裁边提示 + 增强）
12. **日历视图**：日/周/月，按日聚合全部文字/图/语音
13. **待办/提醒**：笔记内清单转待办 + 时间提醒（Notification）；周期提醒；位置提醒暂缓
14. **模板速建**：会议纪要/购物清单/旅行日志/读书摘抄/维修记录
15. **自动同步**：复用 `ctx.sync`，含冲突兜底与同步状态徽标（本地/同步中/已同步）
16. **分享剪藏**：`share_target`（依赖宿主配合点 #2）
17. **智能相册**：按地点/时间段自动聚合（「杭州 3 天」「本周会议」）
18. **AI 摘要**：一段语音 + 图 + 文 → 摘要/待办抽取（`ctx.llm`）

### P2（可后做）
手写涂鸦、智能场景识别、故事式回顾、多端导出（Markdown/PDF/加密 JSON）、协作、安全锁/E2EE、天气元数据（设计稿中的"晴 26°"放这里，需第三方天气源）。

**明确不做（至少 v1 前）**：数据库视图、块编辑器、双向链接、公开分享链接。

---

## 3. 信息架构与页面设计（对照设计稿六屏）

宿主约束：`registerApp` 只注册一条路由 `/jot` 与一个根组件。因此 **Jot 内部导航用自研轻量栈式导航**（`useNav`：push/replace/pop），并把当前栈序列化到 URL query（`?s=note/<id>`）保证刷新可恢复、系统返回键可用（监听 `popstate`）。

### 3.1 页面清单

| 页面 | 对应设计稿 | 说明 |
|---|---|---|
| `HomeTimeline` | 屏①「随记」 | 搜索栏、卡片流（缩略图+标题+语音徽标+标签）、四入口快捷钮、底部 Tab |
| `NoteDetail` | 屏②「项目A周会」 | 笔记详情：文本区、图片九宫格、音频卡（波形+进度）、转写面板、标签行、元数据行、「创建待办」「添加相片」 |
| `CameraView` | 屏③ | 全屏取景、闪光灯/切换相机、连拍；**扫描子模式**：边缘检测虚线框 + 底部「重拍/确认扫描/提取文本」面板 |
| `CalendarView` | 屏④ | 月历切换 + 垂直时间轴（时刻圆点 + 卡片：图集/音频波形/文本） |
| `DiscoverView` | 屏⑤ | 自然语言感搜索框、最近标签 chips、智能相册卡、AI Summary 推荐卡 |
| `OfflineBanner`（组件） | 屏⑥ | 「离线模式·已本地保存 / N 项等待同步」绿色横幅 + 每条笔记的同步徽标 |
| `SearchView` | — | 搜索结果 + 过滤器（类型/标签/地点/时间段） |
| `SettingsView`（我的） | — | 位置开关、转写语言、存储占用、导出、关于 |

**底部 Tab（移动端）**：首页 / 日历 / ＋ / 发现 / 我的。「＋」弹出 ActionSheet（文本/拍照/相册/语音）。桌面端（`uiCtx.layout.isWide`）改为左栏列表 + 右栏详情双栏，无底部 Tab。

### 3.2 关键交互细节

- **新建即编辑**：点「文本」直接进 `NoteDetail`（空草稿），键盘弹起，**每 500ms 防抖自动存 IndexedDB**；未产生任何内容就退出则自动丢弃空笔记。
- **拍完即存**：相机快门 → 压缩/缩略图管线（§8.4）→ 写入当前笔记附件；连续快门进入连拍队列，逐张落盘，UI 显示队列角标。杀进程恢复：IDBFs 中已有 blob 的附件自动挂回。
- **说完出字**：录音页上半部实时波形，下半部实时转写流（interim 结果灰色、final 黑色，仿屏②）；不支持转写的平台显示「仅录音」徽标，事后可点「转文字」。
- **编辑转写**：转写面板支持逐句点改；修改标记 `edited:true`，搜索同时索引原文与改后文。
- **事后好找**：搜索框占位符即提示可搜 "text, voice, OCR…"；结果高亮命中片段并标明来源（正文/OCR/转写）。

---

## 4. 数据模型

设备端 IndexedDB（库 `jot-db`，v1）与服务端 SQLite（`plugins/jot/data/jot.db`）同构。ID 用 `crypto.randomUUID()`。

### 4.1 实体

**Note**
```
id          string  pk
title       string           // 空则取正文首行
text        string           // 轻格式：# 标题、**加粗**、- [ ] 待办、@标签
tags        string[]         // 冗余存储，权威在 Tag 表
source      'text'|'camera'|'album'|'voice'|'share'
createdAt   number           // ms epoch
updatedAt   number
pinned      boolean
color       string|null      // 场景色（工作/生活/旅行/育儿）
location    {lat,lng,name?}|null   // 可全局关闭
syncState   'local'|'syncing'|'synced'
deleted     boolean          // tombstone，同步用
rev         number           // 每次变更 +1，LWW 依据
```

**Attachment**（一条笔记 0..n 个）
```
id, noteId, kind:'image'|'audio'
blobKey     string           // 本地 IDB blobs 表键
serverPath  string|null      // 已上传后 'data/media/<noteId>/<id>.<ext>'
thumbKey/serverThumb  string|null  // 图片缩略图
width,height,duration?  number     // audio 用 duration(s)
peaks       number[]|null    // 音频波形 ~200 个 0..1 峰值，渲染零解码
ocrText     string|null      // OCR 结果（可编辑）
transcript  {t0,t1,text,edited?}[]|null  // 转写分段
sha256      string           // 上传去重/校验
createdAt
```

**Tag**：`name pk, color, pinned, lastUsedAt`（数量查询时实时 count）
**Outbox**：`seq autoinc, type, payload(json), createdAt` —— 所有本地写与 outbox 追加在**同一 IDB 事务**内完成，保证离线队列原子性
**Meta**：kv（`deviceId`、`lastPullRev`、`schemaVersion`、设置项）
**NoteHistory**：每笔记保留最近 3 个被覆盖版本（冲突兜底 + 误删恢复）

### 4.2 服务端表（SQLite DDL 草案）

`notes` / `attachments` / `tags` 与上同构（JSON 字段存 text）；`media` 表：`sha256 pk, path, size, kind, refcount`。媒体文件按内容寻址 `data/media/<sha256[:2]>/<sha256>.<ext>`，天然去重。

### 4.3 存储布局

```
plugins/jot/
├── plugin.json
├── server/main.py …          # 后端（§9）
├── web/…                     # 前端（§8.2）
└── data/                     # 运行时生成，gitignore
    ├── jot.db
    └── media/ab/<sha256>.jpg # 经 /plugins/jot/data/media/… 直接伺服
```

备份 = 复制 `data/` 整个目录；导出功能（P2）从此目录生成 Markdown+附件包。**卸载风险**：当前内核卸载不删除插件文件，数据天然保留；若未来内核支持卸载清目录，需在卸载流程加数据保留提示（列为开放平台建议）。

---

## 5. 系统架构

```
┌─────────────────────────────── Jot 前端（Vue SFC，零 npm 依赖） ──┐
│ Views → state(composables) → lib/db(IndexedDB 事实源)             │
│                     ↘ outbox → lib/sync → 在线时推送               │
│ 媒体采集: lib/camera(getUserMedia) lib/audio(MediaRecorder)        │
│          lib/speech(SpeechRecognition) lib/image(canvas 压缩)      │
└──────────────┬───────────────────────────────┬───────────────────┘
        HTTP /api/apps/jot/call           WS /api/sync/ws (ctx.sync)
┌──────────────┴───────────────────────────────┴───────────────────┐
│ Jot 后端 Service（name='jot'，inject=['llm','sync']）             │
│  store(SQLite) → 元数据/搜索/快照    media → 分块上传/去重/落盘     │
│  ai → ctx.llm.stream: OCR(视觉) / 摘要 / 待办抽取 / (转写适配器)   │
└───────────────────────────────────────────────────────────────────┘
```

**读写路径原则**：一切写先落 IndexedDB（离线可用），同步是后台行为；读默认读本地，服务端仅在「拉取对账」时读。这与 Obsidian 的本地所有权一致，也是"离线模式·已本地保存"横幅（屏⑥）的数据基础。

---

## 6. 同步与冲突策略

### 6.1 通道分工
- **元数据 op**（note.upsert/note.delete/tag.upsert/attachment.meta）：复用 `ctx.sync`，`app='jot'`，**room=`'notes'`、file=noteId**（每笔记一个文档房间，粒度合适且避开 256KB 单消息上限；附件二进制绝不走 WS）
- **二进制**：`/call` 分块上传（§9.2），下载走静态 URL
- **spike 验证项 T0**：`ctx.sync` 的 room/file 语义与 jot 映射是否契合（参考 `useShellSync` 重连/对账实现），若不满足则元数据也退化为纯 `/call` 推拉（方案 B，接口已预留）

### 6.2 对账流程
1. 在线 → 推送 outbox（按 seq 顺序；媒体上传先行，op 中引用 serverPath）
2. 推完拉取 `snapshot(since=lastPullRev)` → 与本地按 `rev/updatedAt` 比对
3. 冲突：**字段组级 LWW**（`text`、`meta{title,tags,pinned,color}`、`attachments` 三个字段组各自比较 updatedAt），被覆盖版本存入 NoteHistory，UI 在笔记详情提供「历史」入口
4. 删除：tombstone 传播，30 天后服务端物理清理

### 6.3 状态机（每笔记）
`local`（本地有未推送变更）→ `syncing`（推送中）→ `synced`；推送失败回 `local` 并指数退避（1s→30s 封顶）。横幅聚合显示 outbox 深度（"N 项等待同步"）。

### 6.4 Background Sync 降级
宿主 SW 暂不注入插件同步逻辑 → 降级为：页面存活时即时推送 + `online` 事件 + 每 60s 前台心跳补传。宿主配合点 #3 落地后无缝升级。

---

## 7. 前端工程方案

### 7.1 技术选型（全部在宿主契约内）

| 能力 | 方案 |
|---|---|
| UI | Vue 3 SFC + TS，经 `uiCtx.vue` 取 `ref/computed/watch/h`；复用 `uiCtx.components`（BaseCard/BaseButton/BasePanel/StateBadge）+ `uiCtx.icons`（lucide） |
| 样式 | Tailwind + 宿主 tokens.css 变量（`--bg/--card/--text/--accent`），**跟随宿主明暗主题**；设计稿的米白暖色作为亮色主题下的局部微调，不硬编码色值 |
| 状态 | composables + reactive（宿主无 Pinia，保持惯例） |
| 路由 | 宿主注册 `/jot`；内部 `useNav` 栈式导航 + URL query 持久化 |
| 本地存储 | 原生 IndexedDB 手写轻封装（promise 化 + 事务助手，~200 行） |
| 相机 | `getUserMedia({video:{facingMode:'environment'}})` + `<video>` 预览 + canvas 抓帧 |
| 录音 | `MediaRecorder`（mime 嗅探：Safari `audio/mp4`，其他 `audio/webm;codecs=opus`） |
| 波形 | 录制时 `AnalyserNode` 采样 + 播放前 decode 补全，存 200 点 peaks 数组，canvas 绘制（仿屏②④⑥），不引库 |
| 转写 | `SpeechRecognition`（含 webkit 前缀），`lang='zh-CN'`、`continuous`、`interimResults`；能力检测不通过则走降级（§11） |
| OCR | 图片上传 → 服务端 `ctx.llm` 视觉 → 文本回传；扫描模式的边缘检测用 canvas 手写简化版（亮度投影+角点，只做"提示框"，不做透视变换 v1） |
| 位置 | `navigator.geolocation.getCurrentPosition`（3s 超时，失败静默不记）；逆地理名称 P1 再议（需外部服务） |

### 7.2 文件清单（每文件 ≤300 行红线）

```
web/
├── index.ts                  ~40   setup(uiCtx)：registerApp + 卸载清理
├── App.vue                   ~120  根布局：Tab 栏/双栏分流 + useNav 出口 + OfflineBanner
├── lib/
│   ├── nav.ts                ~80   栈式导航 + popstate/query 同步
│   ├── db.ts                 ~250  IDB 封装 + 5 张表 CRUD + 事务助手
│   ├── outbox.ts             ~120  队列追加/消费/退避
│   ├── sync.ts               ~250  对账流程（§6.2）+ ctx.sync 客户端封装
│   ├── api.ts                ~60   uiCtx.api 封装 /api/apps/jot/call
│   ├── image.ts              ~200  压缩(≤2048px,q0.82)/缩略图(480px)/sha256
│   ├── audio.ts              ~250  MediaRecorder 封装 + peaks 采样 + 时长解码
│   ├── speech.ts             ~150  SpeechRecognition 能力检测 + 会话封装
│   ├── search.ts             ~150  本地倒排索引（标题/正文/ocrText/transcript）
│   ├── camera.ts             ~150  取景流管理 + 抓帧 + 连拍队列
│   └── format.ts             ~80   时间/时长/字节格式化
├── state/
│   ├── notes.ts              ~200  笔记列表/详情 store（读写皆经 db.ts）
│   └── settings.ts           ~80   位置开关/转写语言/主题偏好
├── views/
│   ├── HomeTimeline.vue      ~250  屏①
│   ├── NoteDetail.vue        ~280  屏②（编辑/附件/标签/元数据）
│   ├── RecordView.vue        ~220  录音+实时转写
│   ├── CameraView.vue        ~250  屏③（含扫描子模式面板）
│   ├── CalendarView.vue      ~220  屏④
│   ├── DiscoverView.vue      ~200  屏⑤
│   ├── SearchView.vue        ~180
│   └── SettingsView.vue      ~180
└── components/
    ├── NoteCard.vue / TagChip.vue / FabCreate.vue / ActionSheet.vue
    ├── AudioCard.vue / Waveform.vue / ImageGrid.vue
    ├── TranscriptPanel.vue / OcrPanel.vue / TodoList.vue
    ├── SyncBadge.vue / OfflineBanner.vue / EmptyState.vue
```
视图超限时优先把面板下沉为 components（如 ScanPanel、MetaRow）。总计约 30 文件、~4500 行。

### 7.3 关键流程伪代码

**拍照即存**（杀进程不丢的关键：先落盘后渲染）
```
shutter() → video 抓帧 canvas → blob
  → image.compress(blob) → {full, thumb, sha256}
  → db.tx([attachments, blobs, outbox]): 写附件元数据+双 blob+upload op
  → UI 追加图片块（blob URL）
  → sync.push() 后台接力
```

**录音双轨**
```
start(): MediaRecorder.start(1000) 分片 + SpeechRecognition.start()
onRecorderChunk → 累积 chunks（IDB 暂存，防崩溃丢整段）
onSpeechResult → interim 灰字 / final 落 transcript[]（随 outbox 持久化）
stop(): chunks 合成 blob → 计算 duration/peaks → 同事务落库 + outbox
```

### 7.4 性能预算
- 时间线首屏 ≤20 卡，滚动 IntersectionObserver 懒加载 + 虚拟化（千条时启用简单窗口化）
- 缩略图全部走 `thumb` blob，原图仅详情/全屏查看时解码
- 搜索索引常驻内存（千条笔记约 2-3MB），IDB 变更时增量重建受影响文档
- `ocrText/transcript` 不入卡片流序列化，详情页按需取

---

## 8. 后端工程方案

### 8.1 Service 骨架与模块拆分

`server/main.py` 由宿主 loader 以 `importlib.util.spec_from_file_location('app_plugins.jot', entry)` 加载——**不是包**，同级模块无法 `from . import`。方案：`main.py` 内置 8 行 `_load(name)` 辅助函数（同 importlib 路径加载同级 .py），拆出四个文件：

```
server/
├── main.py    ~200  class Jot(Service): __init__(ctx,'jot')；公开方法薄壳（参数校验→委派）；fiber.effect 注册清理
├── store.py   ~250  SQLite 建表/CRUD/搜索/snapshot；线程安全（连接 per-call，宿主已 asyncio.to_thread）
├── media.py   ~180  分块上传会话（内存 map: attId→{chunks,size,sha256}）、拼合校验、落盘 data/media/
└── ai.py      ~180  ocr_image / summarize / extract_todos / transcribe（适配器探测，未配置返回 ok:false）
```

### 8.2 `/api/apps/jot/call` 方法清单（契约草案）

| method | args | 返回 | 说明 |
|---|---|---|---|
| `snapshot` | `{sinceRev?}` | `{notes,attachments,tags,serverRev}` | 对账拉取（全量/增量） |
| `upsert_note` | `{note}` | `{ok,serverRev}` | 含附件元数据数组；LWW 合并 |
| `delete_note` | `{id}` | `{ok}` | tombstone |
| `list_tags` | `{}` | `{tags:[{name,color,pinned,count}]}` | |
| `upload_begin` | `{attId,noteId,kind,size,sha256}` | `{ok,exists?}` | sha256 已存在则秒传 |
| `upload_chunk` | `{attId,seq,b64}` | `{ok,received}` | 单块 ≤1MB(base64 后 ~1.37MB，HTTP JSON 无 256KB 限制) |
| `upload_end` | `{attId,thumbB64?}` | `{ok,path,thumbPath}` | 拼合→校验 sha256→落盘→回写 attachments.serverPath |
| `ocr_image` | `{attId}` | `{ok,text}` | 服务端读文件→data URL→`ctx.llm.stream` 视觉模型 |
| `transcribe` | `{attId,lang?}` | `{ok,segments?}` 或 `{ok:false,reason:'no_adapter'}` | 预留：未来注册 whisper 适配器即开通 |
| `summarize` | `{scope:{noteId?/from,to?/tag?}}` | `{ok,markdown}` | 组装笔记文本+OCR+转写 → `ctx.llm` |
| `extract_todos` | `{noteId}` | `{ok,todos:[{text,due?}]}` | |
| `search` | `{q,type?,tag?,from?,to?}` | `{hits:[{noteId,field,snippet}]}` | 跨设备搜索（默认前端本地搜已够用，此为多端正本） |
| `export` | `{format:'markdown'\|'json'}` | `{ok,path}` | P2 |

全部公开方法：`_` 开头拒绝（宿主护栏）、`ValueError`→400；入参做白名单校验与大小上限（单笔记附件 ≤50，单文件 ≤25MB，mime 白名单 image/jpeg,png,webp / audio/mp4,webm,m4a）。

### 8.3 OCR / AI 提示词策略（要点）
- OCR：system「你是 OCR 引擎，逐字转录图片中的印刷体文字，保留段落结构，不要翻译、不要解释」+ image_url；回传纯文本入库
- 摘要：组装 `{标题/正文/OCR/转写}` 拼接上下文（超 8k token 截断旧内容），输出 Markdown 摘要 + 待办列表
- 无可用模型 Key 时 `ctx.llm` 回退 Echo → 后端检测 Echo 特征返回 `{ok:false,reason:'no_llm'}`，前端展示「AI 功能未配置」降级态

---

## 9. 搜索方案

- **主路径（离线可用）**：客户端内存倒排索引。分词：英文/数字按词边界，中文按 bigram；字段权重 title×3 > text×2 > ocrText/transcript×1；结果按「时间近 × 权重」排序，snippet 截取命中前后 20 字
- **过滤**：`type`（仅图片/仅语音）、`tag`、`location`、`时间段`，Discover 页的自然语言感查询（"last Tuesday"）v1 仅解析时间段短语，其余交给权重排序
- **服务端 search**：同库 LIKE + 字段标注，供多端一致性校验与网页无本地数据时兜底

---

## 10. 权限、隐私与安全

- 权限申请场景化：首次点「拍照/语音」才弹权限；拒绝后显示引导文案 +「改用相册/仅录音」替代路径；位置独立开关（设置页 + 单条笔记可移除）
- 数据归属：默认单机本地 + 自建服务端；公网部署依赖 Caddy basic_auth（宿主既定方案）；敏感内容加密锁列 P2
- 媒体 URL 在 `/plugins/jot/data/` 下可被静态访问——与宿主同级的零鉴权现状一致；文档中向部署者明示 basic_auth 必要性

---

## 11. 平台兼容与降级矩阵

| 能力 | Chrome/Edge | macOS Safari | iOS Safari(PWA) | 降级策略 |
|---|---|---|---|---|
| getUserMedia 拍照 | ✅ | ✅ | ✅(需 HTTPS) | 拒绝/不支持 → 相册入口 |
| MediaRecorder | ✅ webm | ✅ mp4 | ✅(14.3+) mp4 | 不支持 → 隐藏语音入口（极罕见） |
| **SpeechRecognition** | ✅ | ✅(14.1+,webkit 前缀) | ❌ **不支持** | iOS：仅录音 + 「转文字」按钮 → 服务端 transcribe 适配器（未配置则提示「暂不可用」） |
| IndexedDB | ✅ | ✅ | ✅（PWA 内持久化较稳） | 存储压力时 LRU 清理已同步原图、保留缩略图 |
| Geolocation | ✅ | ✅ | ✅ | 超时静默不记 |
| share_target | ✅(Android) | — | ❌ | P1，依赖宿主配合点 #2，不支持即隐藏 |
| Background Sync | ✅ | ❌ | ❌ | 前台补传 + online 事件（§6.4） |

iOS 专项注意：PWA 内相机在锁屏/切后台后流中断，回前台自动重启取景；MediaRecorder 中断时按已收 chunks 落库（部分保存优于全丢）。

---

## 12. 里程碑与任务拆解

| 里程碑 | 内容 | 验收 | 估时 |
|---|---|---|---|
| **M0 骨架联调** | plugin.json + Hello 页 + `class Jot(Service)` snapshot；走完安装/dock/路由/prod 构建全链路；spike T0（ctx.sync 语义、dev 静态透传） | 插件管理页可安装，dock 出现「即刻」 | 1d |
| **M1 文字+时间线** | db.ts、HomeTimeline、NoteDetail（纯文本）、自动草稿、标签、useNav、本地搜索(标题+正文) | 打开即记 ≤1 步；杀进程草稿不丢 | 3d |
| **M2 拍照+相册** | CameraView、image 管线、ImageGrid、多选相册、连拍 | 拍完即存 ≤2 步；离线可拍 | 3d |
| **M3 录音+转写** | RecordView、audio.ts、speech.ts、Waveform、回放、转写编辑 | 说完出字（Chrome）；iOS 降级仅录音可回放 | 3d |
| **M4 后端+OCR** | main/store/media/ai 四件、分块上传、ocr_image、扫描子模式、搜索扩到 OCR+转写 | 拍白板→提取文本→可搜到 | 4d |
| **M5 同步** | outbox→sync 引擎、状态徽标、OfflineBanner、冲突 LWW+历史 | 双端互改收敛；飞行模式链路全绿 | 3d |
| **M6 P1 精选** | 日历视图、待办+提醒、模板×5、智能相册(时间/地点聚合)、AI 摘要、导出 Markdown | 按 P1 清单逐项过 | 5d |

M0–M5 = **P0 完整交付（约 17d）**；M6 后可按 §2 的 P1/P2 排序继续。

### 测试方案
- **后端**：pytest 覆盖 store CRUD/搜索、上传分块乱序+sha256 校验失败、LWW 合并矩阵；`ctx.llm` mock
- **前端**：手动测试矩阵（Chrome/Edge/macOS Safari/iOS PWA）× 权限拒绝路径 × 飞行模式；长录音(30min)、大图(20MB)、千条笔记性能抽查
- **e2e 冒烟脚本**：建→拍→录→OCR→搜→同步→导出，每里程碑回归

---

## 13. 风险与开放问题

| # | 风险/问题 | 等级 | 对策 |
|---|---|---|---|
| 1 | iOS Safari 无 SpeechRecognition，"说完出字"在 iPhone PWA 上体验断档 | 高 | UI 明确降级；中期自建 whisper 适配器（server 侧，独立小服务，不污染 anka 依赖） |
| 2 | `ctx.sync` 语义与笔记模型的契合度未验证 | 高 | M0 spike T0；不满足则走方案 B（纯 /call 推拉），接口已隔离在 lib/sync.ts |
| 3 | dev 下 `/plugins/*/data/**` 静态透传未确认 | 中 | M0 验证；必要时宿主 vite.config 加一条 proxy（白名单改动 #1） |
| 4 | base64 分块上传大文件效率（+33% 体积） | 中 | 单文件 ≤25MB 上限 + 秒带去重；若未来内核开放 multipart 则平滑替换 media.ts |
| 5 | 卸载插件的数据语义（当前不删文件，但无文档承诺） | 中 | 提供导出；向宿主提「卸载前数据提示」建议 |
| 6 | 视觉模型 OCR 成本/延迟 | 低 | 仅在用户点「提取文本」时触发；结果落库只算一次 |
| 7 | IDB 在 iOS 的驱逐策略 | 低 | 设置页显示用量；清理策略只动已同步原图 |

---

## 14. 附录

### 14.1 plugin.json 草案
```json
{
  "id": "jot",
  "name": "即刻 Jot",
  "version": "0.1.0",
  "icon": "notebook-pen",
  "backend": { "entry": "server/main.py" },
  "ui": { "entry": "web/index.ts", "dock": { "order": 10 }, "route": "/jot" }
}
```

### 14.2 红线自查表（提交前逐项过）
- [ ] 每个 .vue 单一根元素
- [ ] 无 `mode="out-in"` 过渡
- [ ] 每文件 ≤300 行
- [ ] 前端零 npm import（只从 `uiCtx` 解构）
- [ ] LLM 调用全部经 `ctx.llm`
- [ ] 副作用注册进 `fiber.effect`，卸载后无残留定时器/监听
- [ ] 不改内核文件（§0 白名单改动单独提评审）

### 14.3 与文档的同步纪律
按 anka「PR 式更新文档」惯例：M0 落地时在 `ARCHITECTURE.md` 的 app 插件示例处补一行 jot 引用、`PROJECT.md` 里程碑区登记 M0–M6。




