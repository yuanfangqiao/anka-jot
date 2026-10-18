# REVIEW.md · 即刻 Jot 实现总览与代码评审

> 基线 `c8517fa`（2026-10-18）｜全量读码 + 三路并行审查（views/state、lib/components、server）
> 分工：本文件 = 「做成了什么 + 怎么做的 + 该改什么」；`FEATURE.md` 勾选表；`DESIGN.md` 契约；`CHANGELOG.md` 流水
> 规模：前端 ~3.1k 行（views 1.5k / components 1.1k / lib 1.6k）、服务端 630 行、样式 1.2k 行

---

## 一页结论

功能面已完整（采集 → 编辑 → 组织 → 检索 → 同步 → AI），交互与视觉自成一套，离线优先这条主轴落得扎实；剩余问题集中在**同步与编辑的并发边界**、**资源生命周期**两类，靠加功能解决不了。

**最该先修 6 件事**（确定性缺陷）：

1. 录音页卸载只 `stop` 不落库（`Record.vue:78-81`）——切 tab / 重置栈即静默丢整段录音。
2. 每次自动保存都走 `pushOutbox → onChanged → reload`，`reload` 整表替换 `notes` 并逐条串行 `attsOf`（`store.ts:118-131`、`sync.ts:153`、`store.ts:68-78`）。
3. 新建文本笔记的位置永远丢：`App.vue:65-67` 与 `Detail.vue:49-51` 是两个不同对象。
4. `ocr_image` 用客户端可写库里的 `serverPath` 拼路径直读（`ai.py:51-56`，对照 `media.py:102-108`）——任意文件读取 + 内容外送。
5. 服务端 `upsert_note` 全量替换附件行（`store.py:120-123`）+ 拉取侧删「服务端没有」的本地附件（`sync.ts:190-198`）——双设备丢附件元数据。
6. 相机切「原生拍摄」不停 getUserMedia 流（`Camera.vue:131`）——摄像头指示灯常亮到退出页面。

**最值得三笔投入**：① 把「保存 → 推送 → 刷新」从"每次编辑全量重载"改成增量 patch；② 拆 `Detail.vue`(399) / `NoteCard.vue`(296) / `store.ts`(269)，采集编排从 `App.vue` 挪走；③ 补同步协议单测（LWW 边界、分页、墓碑、上传异常目前零覆盖）。

---

## 1. 功能全景

状态：✅ 可用 ｜ ⚠️ 有已知限制 ｜ 📋 仅有接口/占位

### 1.1 采集（五入口）

| 细项 | 实现要点 | 状态 | 位置 |
|---|---|---|---|
| 文本速记 | 新建 → 标题/正文，500ms 防抖自动存，空笔记丢弃 | ✅ | `App.vue:63-72`、`Detail.vue:65-69`、`store.ts:118-131` |
| 实时拍照 | getUserMedia、前后置、闪光、镜像、连拍、≤2048px + 480px 缩略图 | ✅ | `Camera.vue:43-120`、`lib/image.ts` |
| 扫描模式 | 参考框引导 + 拍后一键 OCR（无透视裁边） | ⚠️ | `Camera.vue:18,197-205` |
| 原生相机 | 移动端 `<input capture>`，免授权、拍完即存 | ✅ | `Camera.vue:28-32,101-120` |
| 视频 | 系统录像 / 相册 ≤100MB，抽首帧做海报 | ✅ | `App.vue:95-109`、`lib/video.ts` |
| 相册批量 | 图+视频多选，逐条压缩落库 | ✅ | `App.vue:77-92`、`state/picker.ts` |
| 语音 | MediaRecorder 1s 分片、200 点峰值、双轨（音频 + 文稿） | ✅ | `Record.vue`、`lib/audio.ts` |
| 实时转写 | 已移出录音页（iOS 抢音频会话会录成静音）；改为详情页可编辑文本 | ⚠️ | `Detail.vue:124-136,359-374` |

### 1.2 编辑与结构化

正文轻格式：`# 标题`、`**加粗**`、`- [ ] 待办`、`@标签`。待办为正文行 ↔ 结构化清单双向映射（勾选/改字/增删即时回写正文），卡片与待办页只读解析、不另存一份数据。另有：标签输入即建 + 确定性配色、附件（图网格 / 视频块 / 语音气泡 / OCR 可编辑）、单篇 AI 摘要与提取待办、置顶（上限 10）、收藏、删除。

### 1.3 卡片与时间线

| 类型 | 尺寸 | 内容 |
|---|---|---|
| 文字卡 | 1:1 | 首字哈希取 10 色马卡龙底 + 噪点，语录排版，无标题取正文首行 |
| 图片卡 | 3:4 | 满幅封面、多图角标，点图全屏、点边框进详情 |
| 视频卡 | 3:4 | 海报 + ▶ + 时长/大小角标，点封面全屏播放 |
| 纯语音卡 | 64px 矮条 | 整条点击播放/暂停，波形随进度点亮 |
| 复合卡 | 3:4 | 标题 → 正文 → 待办域 → 媒体；**有待办时媒体整块不渲染** |

时间线：按创建日分组 + 日期分隔线 + N 列瀑布流（2/3/4 列，`useColCount` + `splitCols`），置顶单独横滑条（宽度对齐单列，>2 张出箭头）。

### 1.4 视图

首页（搜索入口 + 收藏/标签筛选 + 置顶条 + 时间线 + 工具条 + 下拉刷新）、待办页（只筛带 `- [ ]` 的笔记：未完成卡片墙 + 已完成折叠，头部按待办项算进度）、收藏页、日历页（月历打点 + 当日时刻轴）、发现页（最近标签 / 智能相册：地点≥2、同周≥3 / AI 本周摘要）、搜索页（本地倒排索引：中文 bigram + 英文按词，类型/标签过滤，命中高亮）、设置页（位置 / 自拍镜像 / 转写语言 / 存储用量 / 后端状态 / JSON 导出）。

### 1.5 离线与同步

本地事实源 IndexedDB `jot-db`（notes / atts / blobs / tags / outbox / kv / history）；笔记与 outbox 同一事务写入；outbox 按 seq 顺序推、媒体先于 `upsert_note`；`snapshot(sinceRev, limit)` 分页拉、水位存 `lastPullRev`；笔记级 LWW，被覆盖版本进 history；拉取时 `local` 状态不覆盖（服务端版本只留档）；探活区分「服务端挂了（保序停推）」与「坏数据（烧重试跳过）」；触发 = online + 回前台 + 60s 心跳 + 手动下拉对账；媒体 base64 768KB/块、sha256 内容寻址秒传。`ctx.sync` WS 未接，仍轮询（📋）。

### 1.6 媒体与样式

列表只加载 480px 图，四级回退：本地 `:thumb` → 远端 `thumbPath` → 本地 full 补生成 → 服务端 `ensure_thumbnail`；原片只在查看器加载；本地 full 走 LRU(20，未同步不淘汰)。样式：`jot-` 语义类在 `setup` 注入、`teardown` 移除，颜色全走 CSS 变量，深色跟随 `data-theme`；红线是不用任意值类、不用 `md:` 变体。

---

## 2. 实现方案

```
views/       页面（Home/Detail/Camera/Record/Calendar/Todo/Favs/Search/Discover/Settings）
state/       单例状态：store（notes/tags/settings）、confirm、menu、picker
components/  卡片与弹层（NoteCard/CardFoot/CardMenu/各 Viewer/Sheet）
lib/         能力层：db、sync、media、image、video、audio、search、theme、nav、todos、语义类 CSS
host.ts      唯一宿主边界（uiCtx 适配）
server/      main(RPC)、store(SQLite)、media(上传落盘)、thumbnails(FFmpeg)、ai(ctx.llm)
```

**数据模型（两端同构）**：Note `id/title/text/tags/source/createdAt/updatedAt/pinned/fav/color/location/deleted/rev/syncState`；Att `id/noteId/kind/serverPath/thumbPath/尺寸/时长/peaks/ocrText/transcript/sha256/size/pendingOcr`；Tag `name pk/color/pinned/lastUsedAt`；Outbox `seq/type/noteId|name/attempts`；服务端 `notes/atts/tags/media(sha256→path)/kv(serverRev 单调计数)`；媒体 `data/media/<sha[:2]>/<sha>.<ext>`，缩略图同目录 `<sha>.thumb.<thumbsha16>.jpg`（兼容旧名）。

**写读链路**：读一律 IDB；写 = IDB（事实源）+ outbox → 后台上推 → 只在拉取对账时读服务端。

**LWW 粒度是整篇笔记**：附件列表随笔记一起被替换，没有字段级合并、没有设备 ID、没有 CAS。

**待办映射**：存储仍是正文 `- [ ]` 行（可搜、可 AI 读、可跨端同步，零额外表）；详情页 `splitTodoText` 拆出清单、编辑后 `composeTodoText` 拼回正文尾部；卡片/待办页再次解析用于展示。

**卡片分类顺序**：有待办 → 复合卡（只显示清单）→ 无媒体 → 文字卡 → 纯语音/纯视频/纯图 → 复合卡；尺寸由 `jot-card-std / -text / -voice` 固定。

**媒体管线**：采集即压缩（canvas 重编码 + 480px thumb；视频一次性 metadata/seek/canvas 抽帧并超时释放解码器）→ 附件落 IDB → `upload_begin`（可带 thumbB64，sha 命中即秒传）→ `upload_chunk`×N → `upload_end`（长度 + sha256 双校验、临时文件原子改名）→ 服务端缺封面再补 FFmpeg（`BoundedSemaphore(2)`、单次 15s、`-protocol_whitelist file,pipe`）。

---

## 3. 使用场景

| # | 场景 | 用到的能力 | 体验落点 |
|---|---|---|---|
| 1 | 随手记一句话 | 五入口 → 文本 → 自动存 | ≤1 步进入、退出不丢、空笔记自动丢弃 |
| 2 | 拍单据/白板/书页 | 拍照或相册 → OCR → 全文搜索 | 拍完即存，OCR 可改可搜 |
| 3 | 会议/课堂 | 文本 + 待办 + 标签 + AI 摘要 | 会后一键摘要 + 提取待办 |
| 4 | 购物/家务清单 | 待办域 + 待办页卡片墙 | 勾一项划一项，头部进度条直观 |
| 5 | 走路时语音速记 | 录音 → 语音卡即点即播 | 波形定位、时长可见 |
| 6 | 旅行/生活相册 | 批量导入 + 地点 + 日期分组 + 智能相册 | 按周/按地点自动聚合 |
| 7 | 灵感与摘抄 | 文字语录彩卡 | 时间线有视觉节奏，不千篇一律 |
| 8 | 回找旧内容 | 本地全文搜索（标题/正文/OCR/转写）+ 日历打点 | 离线可搜、命中高亮 |
| 9 | 手机 + 电脑双端 | outbox 推拉 + LWW + 秒传 | 媒体只存一份，跨设备可见 |
| 10 | 地铁/飞机/弱网 | 离线优先 + 待同步横幅 + 回前台补传 | 断网照写，恢复后无人值守补齐 |
| 11 | 每周整理归档 | 收藏 + 标签筛选 + 置顶 | 一键筛出要处理的 |
| 12 | 数据带走 | 复制 `data/` 目录 / JSON 导出 | 数据在本地目录，不锁定 |

**现阶段不承诺**：多人协作编辑、富文本/表格、长文档写作、到点提醒（无通知）、扫描件透视裁边、公网多租户部署（见 §4.5）。

## 4. 评审：问题清单

分级：**P0** 数据/资源会真丢或安全失守 ｜ **P1** 正确性或性能明显受损 ｜ **P2** 结构性/可维护性

### 4.1 数据安全与一致性

| # | 级 | 问题 | 证据 | 建议 |
|---|---|---|---|---|
| D1 | P0 | 录音页卸载丢录音：`onUnmounted` 只 `rec.stop()`，不走 `stop()` 的落库分支 | `Record.vue:78-81` vs `57-75` | 卸载复用 `stop()`，并加"录音中禁止切页"守卫 |
| D2 | P0 | 每次自动保存触发全量重载：`persist → pushOutbox → drainOutbox(changed) → onChanged(reload)`；`reload` 整表替换 + 逐条 `attsOf` | `store.ts:118-131`、`sync.ts:153`、`store.ts:68-78` | `markSynced` 后就地 patch 单条；`reload` 只留冷启动/对账；`attsOf` 批量 `getAll` 分组 |
| D3 | P0 | 编辑期丢更新：Detail 持的是 reload 前对象，`{...note}` 把同步新写入的 `rev/atts` 覆盖回旧值；被拒重试又改 `rev`，可能来回震荡 | `store.ts:123`、`sync.ts:116-121` | 写前 `getNote` 重读，只合并用户字段；`rev` 由同步层独占 |
| D4 | P0 | 新建文本笔记位置丢失：App 建对象 A 并 `captureLocation`，Detail 用同 id 又 `newNote` 出 B，A 因空笔记被跳过 | `App.vue:65-67`、`Detail.vue:49-51`、`store.ts:120` | 位置由 Detail 首次保存写入；或 App 先把 A 入库 |
| D5 | P0 | 附件全量替换：LWW 命中时服务端 `DELETE FROM atts WHERE noteId` 再插入客户端列表；客户端列表过期即抹掉对端新增附件（含 OCR/转写/peaks） | `store.py:120-123`、`sync.ts:115` | 按 `att.id` 增量 upsert + 显式删除列表；或附件独立 rev |
| D6 | P1 | 拉取侧删本地附件：快照里没有的本地附件直接 `delAtt`（连 blob） | `sync.ts:190-198` | 仅「已同步且服务端 rev 更新」时删，`local` 状态不删 |
| D7 | P1 | 毒丸永久重试：`outboxFail` 只加计数不清零不丢弃，60s 心跳继续扫；附件缺 sha256 会永远卡住 | `db.ts:222-231`、`sync.ts:140,257` | `attempts≥5` 指数退避 + 设置页暴露异常项 + 手动重试/放弃 |
| D8 | P1 | 删除双路径：`tombstone` 入队后立刻直呼 `delete_note`，再 `outboxDropNote`，竞态可能重复删 | `store.ts:156-169` | 只留 outbox；`delete_note` 保持幂等 |
| D9 | P1 | 删除口径分散：待办页自己过滤 `deleted`，其他页靠 `db.listNotes` | `Todo.vue:20`、`db.ts:71-75` | store 出口统一过滤，视图不各自判断 |
| D10 | P1 | 历史快照无上限、无 TTL | `sync.ts:118-121,184` | 每笔记留最近 N 条 + 总配额 |

### 4.2 功能缺陷

| # | 级 | 问题 | 证据 |
|---|---|---|---|
| F1 | P0 | 切「原生拍摄」不停流 → 摄像头常亮 | `Camera.vue:131`（`finish()` 才停） |
| F2 | P1 | `<component :is>` 无 `:key`，连续压同类型视图复用实例；Detail 只在 `onMounted` 读 `props.id` | `App.vue:153`、`Detail.vue:42-55` |
| F3 | P1 | 删除用原生 `confirm()`，与 `ConfirmDialog` 双轨；`deleted` 在 `removeNote` 前置位，失败后卸载不再 flush | `Detail.vue:224-228,61` |
| F4 | P1 | 搜索命中依赖非响应式索引实例、无 debounce，新笔记/编辑后结果不刷新 | `Search.vue:17-26`、`store.ts:12` |
| F5 | P1 | 日历 computed 内对缓存数组原地 `sort()`（副作用） | `Calendar.vue:36-37` |
| F6 | P1 | 详情页三处 AI 共用 `aiBusy`，`finally` 互相清除 → 并发时按钮态错乱 | `Detail.vue:111-121,139-146,209-219` |
| F7 | P1 | `useMedia.failed()` 无法重试：`cursor` 已耗尽，`select()` 立即退出，只能等 `mediaRevision++` | `useMedia.ts:41,26-38` |
| F8 | P1 | 波形不随宽度重绘：无 `ResizeObserver`，切列数/旋屏后拉伸失真 | `Waveform.vue:45-46` |
| F9 | P2 | 相机缩略图先取全尺寸 blob URL 再退 `:thumb` | `Camera.vue:36-38` |
| F10 | P2 | 导出后立刻 `revokeObjectURL`（Safari 可能截断），`exportJson` 无 `catch` | `Settings.vue:41-45` |
| F11 | P2 | `decodeURIComponent(hash)` 无 try，畸形 hash 阻断 `initNav` | `nav.ts:26,61` |
| F12 | P2 | `Camera/Record` 的 `emit('done')` 无监听者 | `Camera.vue:125`、`Record.vue:73` |
| F13 | P2 | 搜索高亮用 `⟨⟩` 占位再 split，正文含该字符时错位 | `Search.vue:28-32,81-86` |

### 4.3 性能

| # | 级 | 问题 | 证据 |
|---|---|---|---|
| P1 | P1 | `listNotes()` 全表 `getAll()`（含正文全文），已建时间索引未用，无分页 | `db.ts:71-75` |
| P2 | P1 | `initStore/reload` 每笔记一次 `attsOf`（N+1 串行） | `store.ts:55,70` |
| P3 | P1 | 时间线全量 DOM，无虚拟滚动；`notes` 整表替换出新对象 → 全卡 re-patch | `Home.vue:154-161`、`store.ts:126` |
| P4 | P1 | 搜索索引 `remove` 遍历全词表，`reload` 无条件 upsert 全部笔记（O(N×V)） | `search.ts:54-58`、`store.ts:73` |
| P5 | P2 | 待办解析重复：待办页 3 份 computed + 每卡再解析 | `Todo.vue:18-34`、`NoteCard.vue:52` |
| P6 | P2 | `snapshot` 按 `rev` 过滤但只有 `updatedAt` 索引 → 每页全表扫 + 排序；每页重发全部 tags | `store.py:173-196,21` |
| P7 | P2 | `snapshot(0)` 默认 500 条被 `stats`/`summarize` 当全量用 → 统计与"本周摘要"失真 | `main.py:163,188` |
| P8 | P2 | 波形 canvas 每次 `timeupdate` 重读 `clientWidth/getComputedStyle` 并重建画布 | `Waveform.vue:17-27` |
| P9 | P2 | 60s 心跳即使 `pending===0` 也扫 outbox 并拉一次 snapshot | `sync.ts:257` |
| P10 | P2 | `useMedia` 的 `watch(deep:true)` 因 `ocrText/transcript` 变化重跑整条候选链 | `useMedia.ts:43-86` |

### 4.4 架构与可维护性

| # | 问题 | 证据 | 建议 |
|---|---|---|---|
| A1 | `Detail.vue` 399 行承担四类笔记渲染 + 待办 UI + 附件 + AI + 保存编排；`NoteCard.vue` 296 行扛五种卡片 + 预览 + 播放 + 菜单 | `Detail.vue`、`NoteCard.vue:37-120` | 拆 `useNoteDraft`（保存/草稿）、`TodoPanel`、`AttGrid`、`CardText/CardImage/CardVideo/CardVoice` |
| A2 | `App.vue` 同时管导航栈、全局弹层、手势、采集编排（`onAlbum/onVideo` 与 `state/picker.ts` 三份相似逻辑） | `App.vue:63-140`、`picker.ts` | 抽 `lib/capture.ts`，App 只做装配 |
| A3 | 重复实现：`splitCols` 在 Home 内联一份；`tagColorMap` 在 Home/Todo/Detail/Favs 各一份；空态两套；弹层骨架两套；三处音频/视频播放器 | `Home.vue:33-40`、`Home.vue:23` 等 | 统一 `useTagColors()` + `masonry()` + `Empty/Sheet` 复用 |
| A4 | 死代码：`collectTodos`、`toggleTodoLine`、`delAttsOf`、`createPlayer`、`tagColors` prop（NoteCard 仍声明但未用）、`Search.vue:22` 未用 `re` | `lib/todos.ts:60-75`、`lib/audio.ts:30`、`NoteCard.vue:8` | 删；`prop` 契约收窄 |
| A5 | 弹层定位策略不一致：CardMenu `Teleport` + 文档事件，Sheet absolute + 高度 `clamp` → 键盘弹出时被顶飞 | `components/CardMenu.vue:60-94`、`Sheet.vue:18-20` | 统一 `Teleport` + `visualViewport` 兜底 |
| A6 | 移动端 `<input capture>` 的类型/大小守卫在 App、Camera、picker 三处各写一遍 | `App.vue:77-109`、`Camera.vue:101-120` | 收口到 `lib/capture.ts` 的 `pickAndStore()` |
| A7 | `plugin.json` 版本 0.1.0 未随演进更新；`db.ts` 注释称"schemaVersion 由 plugin.json 管理"但清单里没有该字段；IDB 缺 `onupgradeneeded` 迁移分支 | `plugin.json:3`、`db.ts:14-24` | 补 `schemaVersion` + 版本化迁移表 + CHANGELOG 对齐 |
| A8 | 主题语义类集中在 2 个 TS 字符串里（773 + 389 行），改动靠肉眼查重 | `lib/ui.css.ts`、`lib/ui.css.cards.ts` | 拆成 per-feature 片段文件（cards / sheets / timeline / detail）再拼装 |

### 4.5 安全

| # | 级 | 问题 | 证据 |
|---|---|---|---|
| S1 | P0 | `ocr_image` 直接读 `data_dir.parent / path`，仅校验 `is_file()`，路径可穿越；读到的内容还会发给云端模型 | `ai.py:51-56`（对照 `media.py:102-108` 的白名单实现） |
| S2 | P1 | 无用户维度：插件数据只有 `data/jot.db` + `data/media/`，宿主若多账号共享实例则所有账号读写同一池（含 AI 密钥配置） | `main.py:24-26`、`plugin.json` |
| S3 | P2 | 上传只校验长度与 sha256，不校验扩展名白名单/大小上限 | `media.py:56-95` |
| S4 | P2 | `thumbnails.py` 里 `hostPath` 直接进 `subprocess` 参数，落盘文件名来自请求（目前无 shell 拼接，仍建议白名单化） | `thumbnails.py:19-56` |
| S5 | P2 | 日志可能带路径与 noteId（无敏感内容，但排障信息过细） | `main.py` rpc 统一异常日志 |

### 4.6 体验细节

- `Todo.vue` 头部进度按"待办项"、折叠区计数按"笔记"，两套口径并列，用户会误读（`Todo.vue:31-33,78`）。
- 首页筛选（收藏/标签）状态在返回后保留但无视觉分组提示，容易"以为笔记丢了"。
- 下拉刷新只刷新数据，不清 `filters`，用户期待"回到默认视图"。
- 搜索页首帧不与 `route.query` 联动（`Search.vue:24-26`），深链进搜索会丢关键词。
- 无"到点提醒"，待办页容易被理解成任务管理（文案上可明确"轻清单"）。
- 空态文案/图标分三套（Home、Todo、Search 各写一份），语气不统一。

---

## 5. 重构与优化路线

**批次一 · 正确性（不动结构，1-2 天量级）**
1. 录音卸载落库（D1）；相机切原生停流（F1）。
2. 位置写入改到 Detail 首存（D4）。
3. `ocr_image` 改走 `resolve_path` + `data_dir` 白名单（S1）。
4. `markSynced` 后 patch 单条、`reload` 仅冷启动（D2/D3 的第一步）；`attsOf` 批量分组（P2）。
5. 删除统一走 outbox（D8）、store 出口统一过滤 `deleted`（D9）。
6. `useMedia` 失败置 `retryable` 并可手动重试（F7）；波形加 `ResizeObserver`（F8）。

**批次二 · 协议与数据（需要设计，3-5 天量级）**
1. 附件增量同步：`attDiff` 三列表（upsert / delete / keep），服务端不再整段删除（D5/D6）；附件组单独 rev。
2. 冲突收敛：引入 `baseRev` 或字段级 merge（正文/标题/标签/待办分开比），减少"整篇笔记谁更新谁赢"的误伤。
3. outbox 退避 + 死信箱 + 设置页可见（D7）。
4. `snapshot` 增加 `rev` 索引与 tags 增量（P6）；`stats/summarize` 走分页聚合（P7）。
5. 同步协议单测：LWW 边界、分页中断、墓碑、上传失败、离线恢复（当前 tests/ 只覆盖 store/media/ai 的正常路径）。

**批次三 · 结构与性能（按需，持续）**
1. 拆 `Detail.vue`（`useNoteDraft` / `TodoPanel` / `AttGrid`）、`NoteCard.vue`（按类型拆子卡）、`store.ts`（`store/notes.ts`、`store/sync.ts`）。
2. 列表分页 + 时间线虚拟化（P1/P3）；搜索索引增量维护（P4）。
3. 采集编排收口 `lib/capture.ts`（A2/A6）；`useTagColors` / `Masonry` / `Empty` 复用（A3）；清死代码（A4）。
4. 弹层统一 `Teleport` + `visualViewport`（A5）；语义类按功能拆文件（A8）。
5. 多账号隔离：`dataDir/<userId>/` 或库内 `owner` 列（S2）。

**验收口径**：每批都以"真机三件套"回归——① 断网写 20 条 → 联网自动补齐；② 双端并发改同一笔记 → 无静默丢失、history 有档；③ 拍照/录像/录音/批量导入各 5 条 → 列表不加载原文件、可播可看可搜。

---

## 6. 评审方法与未覆盖

- 覆盖：`web/**`（views、components、lib、state、App、host）、`server/**`、`plugin.json`、`tests/`、`AGENT.md` / `DESIGN.md` / `FEATURE.md` 的契约一致性。
- 依据：静态读码 + 交叉验证（同一结论至少在两个文件互相印证）；未运行浏览器/真机，**视觉与手势类结论需要实机复核**；宿主 `server/app/*`（鉴权、WS、打包）不在本仓库，多账号结论基于 `main.py` 的数据目录形态推断，标为"待验证"。
- 未评审：宿主构建管线（web 目录无 package.json，产物由宿主打包）、线上压测数据、PWA 离线缓存策略细节。

---

## 7. 修复记录（2026-10-18，§4 的六项 P0）

| 原条目 | 状态 | 改动 |
|---|---|---|
| D1 录音卸载丢数据 | 已修 | `Record.vue`：`doStop()` 统一停止+落库，按钮/卸载共享 `finishing`，卸载也走完整保存 |
| D2 自动保存全量重载 | 已修 | `sync.ts` 回报受影响 id；`store.patchFromSync()` 增量 patch（>40 条退回 reload）；`db.attsByNote()` 批量读附件 |
| D4 新笔记丢位置 | 已修 | `App.vue` 只传 id；`Detail.vue` 在真正入库的 `note` 对象上 `captureLocation()` |
| S1 OCR 路径穿越 | 已修 | 新增 `MediaStore.resolve_media()` 白名单；`ai.ocr_image(ctx, fp)` 只接受已校验绝对路径 |
| D5/D6 附件被替换/误删 | 已修 | `store.upsert_note` 按 id 增量 upsert，删除只认 `removedAtts`；客户端仅在笔记删除时清附件 |
| F1 相机切原生不停流 | 已修 | `Camera.vue:useNative()` 先 stop 所有 track 再切模式 |

**回归**：服务端 `py_compile` 通过，`tests/` 9 项全过；额外脚本验证「过期列表不抹附件」「removedAtts 精确删除」「四类穿越路径全部拦截」。前端无构建环境，仅静态检查（`read_lints` 0 报错），仍需真机复核录音落库与双设备附件合并。

**仍未覆盖（本次范围外）**：D3 编辑期旧对象覆盖 `rev`（建议随批次一第 4 步一起做 `db.getNote` 重读）、D7 outbox 毒丸退避、D8 删除双路径、附件显式删除的前端入口（服务端已支持 `removedAtts`，但没有 UI 会发）。

