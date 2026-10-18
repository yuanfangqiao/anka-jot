# Changelog — 即刻 Jot

格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循语义化版本。

## [Unreleased]

### 修复（2026-10-18 0 字节录音附件让 outbox 永久 400「文件大小非法: 0」）
- **现象**：`upload_begin` 400，`size: 0`、`sha256: e3b0c442…`（空串的哈希），`drainOutbox` 每次心跳与日历进入都重试同一条 `note.upsert`，队列永远排不空。
- **根因**：录音结束时 `MediaRecorder` 没产出任何分片（iOS 音频会话失效 / 起录即停），`attachAudio` 照旧把 0 字节 blob 落库；服务端 `upload_begin` 校验 `size>0` 恒定拒绝，本地这条笔记又没有别的上传路径。
- **自愈（`lib/sync.ts`）**：`uploadAtt` 发现本地 blob 缺失或 0 字节时直接 `delAtt` 丢弃该附件并继续推笔记；若丢完笔记已空（空语音壳）则 `tombstone` 整条归档，不再把空笔记推上服务端。旧数据下次同步自动清掉，无需手工清库。
- **顺手修**：附件缺 `sha256` 但 blob 有数据时改为现算哈希再上传（原先按坏附件硬失败，会误伤旧数据）。`uploadAtt` 返回值改为「是否丢弃了附件」。
- **源头（`state/store.ts` + `views/Record.vue`）**：`attachAudio` 拒收 0 字节 blob 并返回 `null`，录音页给出「这段录音没采到声音，请检查麦克风后重试」且不落空笔记。
- **验证**：`cd web && npm run build` 通过；`@vue/compiler-sfc` 单独编译 `Record.vue` 通过；改动文件 lint 无报错。

### 变更（2026-10-18 日历改远端数据源：整月计数 + 按天分页）
- **数据源切换**：日历页不再遍历本地全量 `notes` 打点，改为服务端聚合。`Calendar.vue` 重写为显式状态机（月份/当日各自 `loading` / `ready` / `error` + 请求序号），写路径与同步模型完全未动。
- **服务端两个新方法**（`server/main.py` + `store.py`）：
  - `calendar_counts(dayStarts, knownRev)`：一次返回整月每天真实条数（缺日补 0）与区间 `MAX(rev)`；`knownRev` 命中时只回 `{rev, unchanged: true}`，不重传数组。
  - `notes_by_day(startMs, endMs, cursor, limit)`：按天 keyset 分页（`createdAt DESC, id DESC`），游标为 urlsafe base64 不透明串，`limit` 钳制 1..100。
- **时区不做服务端推断**：客户端逐日构造 N+1 个「本地零点」毫秒边界，服务端只做数值区间运算；夏令时 23/25 小时的天不会错格（未使用 SQL `localtime`）。
- **索引**：新增 `idx_notes_created(createdAt DESC, id DESC)` 与部分索引 `idx_notes_alive_created(createdAt) WHERE deleted=0`，计数走 index-only scan。
- **正文不回传**：列表投影用 `substr(text,1,600) AS preview` + `length(text) AS textLen`（`MAX_TEXT_LEN` 20 万，全文会让单页膨胀到 MB 级）；点开时 `get_note` 取全文、写回 IndexedDB 后再进详情。
- **缓存与一致性**：月缓存键含时区指纹（旅行/改时区自动失效），会话内最多 12 个月；`MAX(rev)` 含软删行，删除后打点立即失效。
- **待同步提示**：进入日历前 `pushOutbox()` 与 1.5s 超时竞速；`syncState.pending > 0` 显示「N 条待同步」；推送完成或 rev 变化后静默重取月份，列表只给「有更新 · 刷新」胶囊、不重置滚动位置。
- **只读卡片**：`NoteCard` / `CardFoot` 新增 `readonly` prop，日历列表隐藏置顶角标与「⋯」，避免把 600 字预览当正文写入。
- **新增文件**：`web/lib/api.calendar.ts`（边界、时区指纹、月缓存、分页、`ensureLocalNote` 回填）、`tests/test_calendar_store.py`（10 例）。
- **验证**：`python3 tests/test_calendar_store.py` 10 例通过；`python3 tests/test_todos_store.py` 无回归；`cd web && npm run build` 通过。
- **偏差与未做**：未引入 `AbortController` 取消在途请求（用请求序号丢弃过期响应，目录未改 `host.ts` 的调用签名）；下拉刷新未接管（同步完成自动校验 + 错误重试替代）；设备时钟偏差导致的跨天仍未处理。

### 变更（2026-10-18 导航与顶栏按钮顺序）
- 顶部胶囊标签改为「首页 / 待办 / 收藏 / 日历 / 发现」：把高频的待办、收藏提到日历前面（`App.vue` 的 `TABS` 数组，样式按数组顺序渲染，`TAB_ROOTS` 是集合、不受影响）。
- 详情顶栏四按钮改为「置顶 / 待办 / 收藏 / 删除」，与标签栏顺序对齐；图标、行为、`aria-pressed` 均不变，仅调换 DOM 顺序。

### 变更（2026-10-18 详情顶栏三键开态：深色边 + 金色心）
- 顶栏「置顶 / 待办 / 收藏」的开态统一为双色标志：形状不变、不加圆底，描边加深到 `--text-0`，内部填金 `--warn`（`flagStyle()` + `flagFillStyle()` 内联到 `<button>` / `<svg>`）。未开仍是灰色细描边。
- 待办图标用的 `ListChecks` 全是线段、无面积可填，改用叠层描边（`.jot-flag-stack`）：同一路径叠两层，下层 `stroke-width: 4` 的墨色露出外缘当框，上层 `stroke-width: 2.6` 的金色当芯，同样得到「金线包墨边」，不再需要换图或铺底色。
- 填色用 `style` 而不是 `fill` 属性：SVG 表现属性里的 `var()` 在部分内核不可靠。
- 着色走内联而非样式表类：`text-brand` 加在按钮上会被后注入的 `.jot-icon-btn { color }` 盖掉，只有同时改 `fill` 才看得出变化。
- 卡片脚注的待办小图标同步转琥珀（`.jot-todo-mini`），与顶栏同一色系；待办进度胶囊仍按期变绿。
- 移除未生效的 `.jot-fav-on` / `.jot-todo-on` 与重复的 `.jot-fav-mini`（保留 `ui.css.cards.ts` 一份），`README.md` 语义类速查相应更新。

### 新增（2026-10-18 事项独立字段 + 待办标志 + 六类卡型）
- **事项从正文拆出**：新增 `note.todos: {id,text,done}[]`，勾选/行内改/增删只改数组并走原有 500ms 防抖保存；正文 `text` 不再夹带 `- [ ]` 行。`lib/todos.ts` 重写为结构化工具（新建 / 历史行拆分 / 归一 / 统计）。
- **待办标志**：新增 `note.todo`，详情顶栏第三按钮与卡片菜单均可开关。标志只决定「待办卡」与待办页收录；关掉标志后事项照常保留、可勾选。`persist` 空笔记判定纳入事项与标志，纯清单笔记不会被丢弃。
- **六类卡型**：文字 / 图片 / 语音 / 视频 / 待办 / 复合。待办卡 3:4 只显示标题→正文→清单；未打标志的复合卡有清单时清单占满剩余空间、媒体不上卡；待办页 `Todo.vue` 改为只按 `note.todo` 收录。
- **老数据三重迁移**：客户端 `initStore` / `reload` 懒迁移并批量单事务写回 + 入 outbox；服务端加 `todo`/`todos` 列并在 `kv` 标记下一次性拆分，`rev` 连续分配保证快照分页不漏行；`upsert_note` 对缺省字段保留库中原值，旧客户端继续写正文复选框也能就地拆分。迁移不改 `updatedAt`，时间线不重排。
- **搜索与 AI**：本地索引新增 `todo` 字段（命中标注「待办」），服务端 `search` 命中 `todos` JSON；`ai._gather_text` 纳入事项文本。新增 `tests/test_todos_store.py`（7 例）覆盖拆分、补列迁移、缺省保留、快照序列化与搜索。

### 修复（2026-10-18 P0 六项：数据一致性与资源生命周期）
- **录音页卸载丢录音**：`onUnmounted` 只 `rec.stop()` 不落库，切 tab / 重置导航栈会静默丢掉整段录音。抽出 `doStop()` 统一「停止 → 建笔记 → 附件落库 → 持久化」，按钮与卸载共享同一次停止（`finishing`），卸载路径也走完整落库。
- **自动保存后整表重载**：`persist → pushOutbox → onChanged → reload` 原本每次都全表替换 `notes` 并逐条 `attsOf`。同步回调改为回报受影响的 note id，`store.patchFromSync()` 只重读这几条（>40 条或全量对账才退回 `reload`）；新增 `db.attsByNote()` 一次读全量附件分组，初始化/重载不再 N+1。
- **新建文本笔记丢位置**：`App.vue` 建了对象 A 采集定位，`Detail.vue` 又用同 id 新建对象 B，A 因空笔记从不落库。现在只传 id，定位由 `Detail` 在真正会被保存的 `note` 对象上采集。
- **OCR 路径穿越**：`ai.ocr_image` 直接 `data_dir.parent / att.serverPath` 读盘（该字段可由客户端写库），构成任意文件读取并把内容发往云端模型。新增 `MediaStore.resolve_media()` 作为唯一读盘入口（`data/media` 白名单 + `is_file`），`ocr_image` 只接受已校验的绝对路径。
- **附件被全量替换**：`store.upsert_note` 命中 LWW 时 `DELETE` 全部附件行再插入客户端列表，客户端拉取又按「服务端没有」删本地附件与 blob，双设备下会丢 OCR / 转写 / 波形元数据。服务端改为按 `att.id` 增量 upsert，删除只认显式 `removedAtts`；客户端只在笔记被删除时清理附件。
- **相机切原生不停流**：`useNative()` 未停止 `getUserMedia` 流，指示灯常亮且系统相机可能抢不到摄像头。切换前 `stop` 所有 track 并清空 `stream`。
- **相机在 PWA 里反复授权**：真机判定混入 `navigator.plugins.length === 0`，而 iOS / Android Chrome 的 plugins 可能非空 → 真机被判成桌面，拍照默认进实时取景并 `getUserMedia`，PWA 每次打开都重新询问摄像头授权。恢复只看 UA（含 iPadOS 桌面 UA + 多点触控），真机一律默认系统相机 `<input capture>`，不申请网页摄像头权限。

### 修复 / 变更（2026-10-18 首页置顶横滑条）
- 首页「全部 / 收藏 / 标签」筛选行被压成一条短横：滚动区为纵向 flex 容器，该行带 `overflow-x-auto`，其自动最小高度按规范归零，负自由空间全部压在它身上再被自身裁切。修复为收纳进搜索框右侧筛选按钮（底部弹层选 全部 / 收藏 / 标签 + 清除），并在 `.jot-search-row` / `.jot-shelf` 上显式 `flex: 0 0 auto`，不再依赖宿主是否构建 `shrink-0`。
- 新增置顶横滑条：位于搜索框与「今日」之间，复用 `NoteCard`，一屏并排 5 个、宽度自适应、可左右滑动查看全部置顶；条带高度按图片卡 3:4，窄卡内隐藏脚注/二级摘要并收紧字号。原「置顶」N 列瀑布流区与 `pinnedCols` 删除，置顶内容只出现一次。
- 新增 `components/FilterSheet.vue`：应用内 absolute 弹层（不 Teleport 到宿主 body），受控读写 `activeTag` / `favOnly`，`useBack` 支持系统返回关闭；筛选生效时按钮主色激活。
### 修复（2026-10-17 iOS PWA 实机问题）
- 日历在 iOS PWA 塌成单列竖排：`grid grid-cols-7` / `aspect-square` 属宿主部署构建缺失的类，改为语义类 `jot-cal-grid`（7 等分 CSS Grid）+ `jot-cal-cell`（aspect-ratio 方形格），日期按钮高度由 `.jot-cal-cell > button` 兜底。同步把同样风险的 `grid-cols-2/3/4` 调用点（智能相册、图片九宫格、四入口面板）换成 `jot-grid-2/3/4`、`jot-sq`。
- 首页顶部「N 项待同步 / 文件大小非法」浮条移除，同步详情只在「我的 → 数据」卡内展示，不再挤压时间线首屏。
- iOS 底部工具条下方多余空白：`.jot-bar-wrap` 不再叠加 `env(safe-area-inset-bottom)`（安全区由宿主 dock 负责），上下内边距固定 8px/10px，Android 表现不变。
- 底部五入口改为**淡彩圆片**（同色相三级台阶：底 18% / 1px 边 34% / 图标 100%）：文本藏蓝 `#2f3b57` / 拍照墨绿 `#2e6a5e` / 视频靛紫 `#4c3f8f` / 相册赭橙 `#a9662c` / 语音酒红 `#8e3b57`，深色宿主自动提亮一档；标签文字跟随同色。
- 首页搜索框宽度改为容器的 2/3（`jot-search`，居中，桌面限宽 24rem）。
- 详情顶栏四按钮改回语义正确的「置顶 / 收藏 / 待办列表 / 删除」：第二格原为 AI 摘要（星火图标易误认为收藏），现改为收藏星标（`fav` 字段，落库 + 同步 + 卡片角标 + 首页筛选）；AI 摘要下沉为正文下方虚线胶囊。
- 笔记详情页骨架改为语义类 `jot-detail`：底部圆角入口行不再被内容区下缘裁掉（自带 32px 下留白），并允许换行防窄屏溢出；顶栏改 `jot-detail-head` + `jot-icon-btn`，返回键图标与正文左缘对齐（此前受宿主全局 button 内边距影响整体内缩，看着像居中）。

### 新增（2026-10-17 自拍镜像）
- 实时取景拍照的镜像改为跟随镜头：前置（facingMode `user`）预览与成片都左右翻转成自拍镜面，后置保持原样；扫描模式仍强制不镜像（OCR 需正向文字）。
- 移除手动的「镜像」切换按钮，改为前置时显示「镜像」状态徽标；新增设置项「自拍镜像」（默认开，存 IndexedDB `selfieMirror`）可整体关闭。
- 系统相机路线（`<input capture>`）与视频录制由系统相机 App 决定成像方向：Jot 无法读取实际使用的镜头，故沿用系统策略，默认后置不镜像。

### 变更（2026-10-17 日历当日列表改用主页卡片）
- 日历当日时间轴保留左侧竖线与时刻，卡片改为复用 `NoteCard`（图片/语音/视频/文字/复合五类一致），单列竖排不再手写简化卡。
- `NoteCard` 新增 `showTime`：时间轴已显示时刻时卡内不再重复；底栏无内容时不再留空条（日期仍由组头展示）。
- 移除日历内自绘波形与「N 张图片」占位，语音改由 VoiceMini 直接播放。

### 变更（2026-10-17 我的入口迁移）
- 顶部标签只保留首页/日历/发现；「我的」标签删除，改为点击左侧「即刻」徽标进入。
- 设置页由栈根改为压栈页（`push('settings')`），系统返回回到进入前的页面；深链 `#/settings` 也补首页父级。
- 在设置页时徽标文字高亮为品牌色作为当前页标识。验证：插件 lint 无报错，移动/桌面双视口待看。

### 修复（2026-10-17 缩略图性能与生成链路）
- 根据实际加载速度改回列表小图，图片/视频统一 480px JPEG；进入视口附近才加载，点击后加载原图/原片，列表及预热不后台下载原文件。
- 前端独立补生成旧附件小图，修复视频 metadata/seek/抽帧与资源清理；浏览器不能解码时由服务器 FFmpeg 生成。
- 新增 ensure_thumbnail，可补生成旧封面或单独接收前端小图；封面采用内容哈希与原子落盘，元数据变更同步推进 rev，重复调用幂等。
- upload_begin 秒传返回/补齐 thumbPath；upload_end 小图缺失或非法时补生成，缺少解码器不丢原文件。旧客户端漏传小图地址的笔记提交也会补齐。
- 前端生成与补图限并发，封面加载后只缓存小图；更新 AGENT、README、DESIGN、FEATURE。
- 验证：9 项隔离后端接口回归通过、Chrome 实际卡片生成/补图/秒传同步/网络请求检查、双视口截图与构建；iOS/Android 真机待验收。

### 修复与新增（2026-10-17 媒体恢复）
- 原图优先，不等待缩略图；缩略图生成失败不影响保存大图；视频无海报时加载原片。
- 统一 MediaPreview/useMedia，各组件独立持有 URL，修复封面撤销共享 URL 导致后续全空白；失败回退及恢复重试。
- 冷启动/前台/pageshow/联网重新对账，即使 note rev 相同也修复缺失附件路径；IDB 连接关闭后允许重开。
- 删除直接 upsert 写穿透，统一媒体先上传再写笔记；失败队列保留，旧缺失队列补回，上传中的新编辑不标记已同步。
- 首页卡片列表支持顶部单指下拉刷新、松开同步、离线提示与重复手势防重入。
- 同步请求与缓存回填增加超时，媒体回填合并同一附件下载，拒绝缓存登录 HTML。
- 更新 AGENT、README、DESIGN、FEATURE；本轮仅构建，未运行自动化测试，PWA 真机验收待执行。


### 修复（2026-10-16 应用内部返回）
- 内部导航栈通过 Anka `uiCtx.navigation` 注册返回处理器，移除独立顶层 popstate 监听与 `replaceState(null, ...)`。
- hash 经宿主镜像，仅处理 `/anka-jot` 深链；刷新非根页面补首页父级；切应用保留内存导航位置，teardown 注销处理器。
- 图片/视频预览与动作面板优先关闭；录音中系统返回先走正常停止/保存流程。
- 新宿主负责系统返回边界；旧宿主保留按钮返回与 hash 兼容。Android/iOS 已安装 PWA 系统手势仍待真机验证。
- 验证：插件生产构建通过；宿主 Chrome 开发/生产回归覆盖真实 Jot 搜索页面进入、系统历史返回、切回恢复、深链刷新，双视口检查通过。真实设备录音保存待验证。

### 优化（2026-10-16 媒体同步策略）
- 本地 blob 引入 LRU 上限 20 个（缩略图不计）：推送成功后自动裁剪，超出保留最近使用的，淘汰只按 key 删行不物化内容；尚未同步成功的附件绝不参与淘汰。此前上传后本地 blob 永不清理，IndexedDB 无限膨胀
- 列表封面 `coverOf` 补服务端缩略图兜底：LRU 淘汰/新设备/清库后封面不再显示「同步中」占位（宿主已静态伺服 `/plugins/<id>/data/media/...`，`<video>/<img>/<audio>` 直连服务端路径即可流式预览，天然支持 Range）
- 新增 `lib/media.ts` 回填：组件走服务端兜底显示/播放时，后台 fetch 拉回本地缓存（缩略图 + 点击查看/播放的全量），下次离线也能看；回填进入 LRU 管辖
- 删除附件/笔记时同步撤销 objectURL 与 LRU 记录（原先只删 blob 行，会话内悬挂引用）

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
