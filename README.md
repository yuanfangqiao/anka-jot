# anka-jot

即刻（Jot）— 离线优先的速记插件：打开即记、拍完即存、说完出字。
文字 / 拍照 / 录像 / 相册 / 录音五入口，支持粘贴即记；按天分组的时间线瀑布流，增量同步到服务端。

---

## 核心架构

### 1. 离线优先数据流（`web/lib/db.ts` + `web/lib/sync.ts`）

```
UI 读写 ──► IndexedDB（唯一事实源）
              │  每次变更追加 outbox 记录（顺序号 seq）
              ▼
        pushOutbox()  顺序消费 outbox
              │  媒体先于 note.upsert 上传（分块 base64，768KB/块）
              ▼
        服务端 SQLite（plugin server）
              ▲
        pullMerge()  snapshot(sinceRev) 增量拉取；syncBase 三方字段合并与版本留档
```

- **失败项保留**：失败先探活，服务端不可达则停推；单条失败跳过续推，计数最多 5，始终保留待同步项。
- **单一写路径**：取消编辑时的直接写穿透；原图上传成功才发送笔记与附件地址，避免提前显示已同步。
- **mime 归一化**：上传前两端都把 `blob.type` 的 `;codecs=` 参数剥掉再查扩展名
  （iOS Safari 录音 blob 常是 `audio/mp4;codecs=mp4a.40.2`，曾让整条队列卡死）；
  未识别 mime 按 kind 兜底扩展名，不再判非法。
- **媒体硬失败**：本地 blob/sha256 缺失时不上传该笔记，避免「缺媒体的笔记」同步上去。
- **本地未推送编辑保护**：拉取时若本地 `syncState === 'local'`，服务端版本只进历史留档，不覆盖。
- **触发时机**：`online` 事件 + `visibilitychange` 回前台 + 3s 前台增量心跳 + 手动（banner「同步」按钮，
  结果 toast 反馈，失败原因直接显示在 banner 里）。
- **恢复修复**：冷启动、pageshow、回前台、联网及手动下拉时全量核对附件路径；相同 rev 也补路径，保护本地正文与附件增删。普通心跳仍按增量同步。
- **请求可恢复**：同步调用与媒体缓存下载 60 秒超时；需要宿主支持 callApp 第四参数 AbortSignal。
- **小图优先**：列表、图格和视频封面只加载最长边 480px 的 JPEG；原图/原片只在点击查看时加载。`MediaPreview` 在接近视口时加载，`useMedia` 独立持有 URL；回前台可重试。
- **前后端补图**：采集时生成图片/视频小图；旧本地附件可独立补生成。上传和秒传均返回 thumbPath；没有小图的远端附件通过 `ensure_thumbnail` 由 FFmpeg 补生成，前端已有小图也可单独补传。
- **小图缓存**：封面加载后仅回填小图，预热只下载小图；禁止因为显示卡片后台下载原图/整段视频。
- **下拉刷新**：首页列表顶部单指向下拉，松开后刷新本地卡片、同步和重试媒体；离线保留本地内容。

### 2. iOS 录音无声修复 — MicSession（`web/lib/audio.ts`）

**问题**：iOS WebKit 下每次录音都 `getUserMedia`，第二次拿到的流 track 虽显示 live，
但音频会话未重新激活 → MediaRecorder 录到静音、Analyser 读到全 0（波形平线）。

**方案**：会话级持久麦克风流——

- 整个 app 会话只 `getUserMedia` 一次，之后每次录音仅新建 `MediaRecorder`。
- 共享一个 `AudioContext`（iOS 对上下文数量有限制），每次 `start()` 时 `resume()`。
- 流失效（track `ended` / `muted`，PWA 前后台切换常见）自动重建。
- `releaseMic()` 仅在插件 teardown 时调用。

其他保护措施：分片收集（`mr.start(1000)`，崩溃最多丢 1s）、
Analyser 实时峰值采样并降采样到 200 点（详情页渲染波形零解码）、mime 嗅探兼容 Safari。

### 3. 拍照：`<input capture>` 直呼系统相机

移动端用隐藏的 `<input type="file" accept="image/*" capture="environment">`
直接唤起系统相机：**无网页授权弹窗、画质更好、无重复权限请求**（对齐 kurumi CameraCapture）。
桌面端不点它，走插件内实时取景（Camera.vue）。
拍完即存：每张快门立即落 IndexedDB，杀进程不丢，完成时统一挂进笔记。

### 4. 宿主 Tailwind 解耦 —— 塌缩级样式一律用 `jot-` 语义类

**血泪教训**：部署的宿主 CSS 是「构建那一刻」扫描到的类名集合。
插件后续新增的任意值类（`h-[72px]`、`border-[5px]`、`columns-2`、`text-[13.5px]` 等）
在旧构建里**不存在**，曾导致：快门按钮塌缩为 0 尺寸、瀑布流退化为单列、分割线不可见。

**规则**（`web/lib/ui.css.ts`，`setup` 时注入一次、teardown 移除）：

- 布局 / 尺寸 / 边框 / 截断 / 响应式断点等「不写就塌」的样式 → **必须**用这里的语义类（前缀 `jot-`）。
- 纯装饰性、塌了也不影响功能的（`hover:` 变色等）可继续用宿主工具类。
- 响应式（iPad 列数、容器宽度）用 `ui.css.ts` 内的 `@media` 查询 + JS `matchMedia`，
  **不要**用 `md:` / `lg:` 变体（同理可能缺失）。
- 颜色一律走 CSS 变量（`var(--bg-1)` 等），兼容深色跟随。

### 5. 主题跟随（`web/lib/theme.ts`）

- 宿主 `<html data-theme="dark">` → 清空内联覆盖，跟随宿主深色 token。
- 否则向 `.jot-root` 注入奶油浅色板（`--bg-0/--text-1/--line/--primary…`）。
- `MutationObserver` 监听 `data-theme`，切换即时生效。

### 6. 构建缓存失效（`server/app/plugin_builder.py`）

以 `.src-hash` 记录源码指纹：源码未变跳过构建（秒开），
**任何源文件变动 → 指纹变化 → 强制重建**，杜绝「发了新代码还是旧界面」。

### 7. PWA 安装（获得完整体验）

内部页面返回通过宿主 `uiCtx.navigation.register` 接入；当前视图经 `setHash` 镜像，
切应用不清内部栈，根页系统返回保持本应用。禁止插件独立监听顶层 popstate。
完整接口见宿主 `docs/NAVIGATION.md`；旧宿主只兼容页面按钮返回。

- **iOS**：Safari 打开 → 分享 →「添加到主屏幕」。必须从主屏图标进入，
  才有独立全屏、后台音频会话与正确 safe-area。
- **Android / 桌面 Chrome**：地址栏安装图标。

---

## 编辑与并发保存（2026-10-25）

- `state/paste.ts` 处理用户主动粘贴：当前应用非输入区域新建图文笔记；详情正文图片追加附件。只用 paste 事件的 clipboardData，不申请剪贴板读取权限；保存复用现有附件管线和 IDB + outbox。
- 写入路径仍为 IDB + outbox；编辑器保留打开/确认时的基准，只合并实际修改字段。
- 同源页面 BroadcastChannel 通知；独立设备前台 3 秒增量轮询。输入聚焦期间不替换正文，更新提示允许合并。
- 详情「历史版本」合并本机与服务端版本，可恢复；冲突双方留档，mutationId 避免重试覆盖后续编辑。
- `server/schema.py`、`server/note_writes.py` 分离表结构与原子写入；`state/persistence.ts` 管理草稿基准和保存队列；编辑控制逻辑在 `state/useDetail.ts`。
- 语义 CSS 保持原顺序拆到 `ui.css.base0..3.ts`；本次修复样式在 `ui.css.edits.ts`，由 `ui.css.ts` 统一注入。

## `jot-` 语义类速查

| 类 | 用途 |
|---|---|
| `jot-shutter` / `jot-shutter-inner` | 拍照快门 72px 圆钮 |
| `jot-rec-btn` | 录音大按钮 |
| `jot-card` | 笔记卡（圆角 + 发丝边框 + 分层柔影 + 按压反馈） |
| `jot-home` / `jot-container` | 首页占满应用窗口，卡片滚动区与按钮组居中限宽；底栏背景不受内容最大宽度限制 |
| `jot-clamp-2` / `jot-clamp-5` | 行截断（替代 line-clamp） |
| `jot-cols` / `jot-col` | 手动瀑布流：手机（<640px）2 列，平板/电脑（≥640px）统一 5 列 |
| `jot-fs-*` / `jot-leading-145` | 任意值字号 / 行高 |
| `jot-press` / `jot-press-strong` | 按压缩放反馈 |
| `jot-wave` / `jot-wave-bar` | 波形条 |
| `jot-voicebar*` | 语音气泡（播放钮 + 波形 + 时长） |
| `jot-card-std` / `jot-card-text` | 主页标准卡容器（图片/复合 3:4 竖卡，纯文字 1:1 方卡） |
| `jot-card-voice` / `jot-vc-*` | 主页语音小卡（64px 矮条语音条：整条点击播放/暂停，时间在右下角） |
| `jot-text-cover` / `jot-cover-content` / `jot-cover-heading` / `jot-cover-body` | 适中字号文字封面，按剩余高度展示正文 |
| `jot-textcard` / `jot-tc-*` | 文字语录彩卡（哈希取色 `--tc-bg` + 噪点防眩 + 居中排版，深色自动降明度） |
| `jot-imgcard` / `jot-comp-img` / `jot-comp-body` | 图片卡满幅区 / 复合卡图区(56%)与文区 |
| `jot-imgbadge` / `jot-comp-play` | 多图角标 / 复合卡迷你播放钮 |
| `jot-vid-play` / `jot-vid-dur` | 视频卡 ▶ 播放徽章 / 左下时长角标 |
| `jot-videocard` | 详情页视频块（16:9 海报，点击全屏播放） |
| `jot-card-foot` | 卡片底部信息行（时间 + 同步点） |
| `jot-fav-mini` / `jot-todo-mini` | 卡片脚注的收藏 / 待办小标志（琥珀）；详情顶栏同一色由组件内联 `var()` 上色 |
| `jot-bar-wrap` / `jot-bar-item` / `jot-bar-tile` / `jot-bar-label` | 底部采集栏：平板/电脑 47px 紧凑图文按钮，手机圆形图标；桌面覆盖在 ui.css.desktop.ts |
| `jot-date-sep` | 时间线日期分隔（双侧渐变细线 + 加粗标签） |
| `jot-cover-missing` | 封面图加载失败渐变占位 |
| `jot-media-preview` | 图片/视频 JPEG 缩略图填满卡片，接近视口时加载，缺失自动补图 |
| `jot-refresh-list` / `jot-refresh-status` | 列表内下拉刷新与状态提示，隔离浏览器页面刷新 |
| `jot-overlay-blur` / `jot-safe-bottom` / `jot-sheet-maxh` | Sheet 弹层 |
| `jot-rail` / `jot-dot` | 日历时间轴定位 |
| `jot-cal-nav` | 日历翻月钮（圆底 hover，替代任意值 padding 组合） |
| `jot-cal-note` / `jot-cal-warn` / `jot-cal-link` | 日历状态行：载入中 / 离线缓存 / 失败 + 重试链接 |
| `jot-cal-chip` | 日历右上角小胶囊（待同步 / 离线 / 有更新） |
| `jot-cal-retry` | 日历错误重试、加载更多按钮 |
| `jot-cal-skel` | 日历首屏与续页骨架卡（含 `prefers-reduced-motion` 降级） |
| `jot-update-notice` / `jot-history*` | 外部更新提示、历史列表与恢复 |
| `jot-card-check` / `jot-card-undo` / `jot-undo-notice` | 卡片事项勾选与跨分组撤销提示 |
| `jot-scan-*` | 扫描参考框 |

## Do / Don't

- ✅ 新视觉关键样式 → 先加 `jot-` 语义类再使用。
- ✅ 新响应式需求 → `ui.css.ts` 里写 `@media` 或 JS `matchMedia`。
- ❌ 不要在模板里写 `h-[72px]`、`md:max-w-3xl`、`columns-2`、`line-clamp-2` 这类新任意值/变体。
- ❌ 不要硬编码颜色；用 `var(--*)`，深色模式才不破。
- ❌ 不要在录音流程里重新 `getUserMedia`（走 `acquireMicStream`）。

## 缩略图生成与验证

浏览器采集时生成最长边 480px、JPEG 质量 0.7 的小图。服务器补生成图片/视频封面需要
系统 `ffmpeg`（不新增 Python/npm 包）：macOS `brew install ffmpeg`；Debian/Ubuntu
`sudo apt-get install ffmpeg`。用 `ffmpeg -version` 检查后重启后端。
客户端上传的小图可在无 FFmpeg 时保存；旧文件和浏览器不能解码的视频需要服务器生成。
FFmpeg 无法解码时保留原文件、返回明确错误，卡片可点击查看原文件。

- `upload_begin` 支持可选 `thumbB64`，秒传结果包含 `path / thumbPath`。
- `upload_end` 保存原文件及前端小图；小图缺失/不合格则补生成，生成失败不撤销原文件上传。
- `ensure_thumbnail({attId, thumbB64?, force?})` 修复旧封面，返回 `{ok,path,thumbPath}`；元数据变化更新 note rev，重复调用不重复推进 rev。
- JPEG 最长边 480px、最大 512KB；新生成封面以内容哈希命名，避免命中旧损坏缓存。

从宿主根目录执行隔离回归（合成数据，不读写插件 data/）：

```bash
PYTHONDONTWRITEBYTECODE=1 .venv/bin/python -m unittest discover -s plugins/anka-jot/tests -p 'test_thumbnails.py' -v
ANKA_PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs ANKA_THUMB_SCREENSHOTS=/tmp/jot-thumbnails node plugins/anka-jot/tests/check-thumbnails.mjs
```

浏览器回归需要 Chrome 和 Playwright，检查前端图片/视频小图、历史补图、秒传地址保留、
列表零原文件请求、点击加载大图、恢复重试，并输出 390×844 / 1440×900 截图。

## 并发与交互回归

```sh
PYTHONDONTWRITEBYTECODE=1 .venv/bin/python -m unittest discover -s plugins/anka-jot/tests -p 'test_*.py' -v
node web/scripts/build-plugin.mjs anka-jot
node plugins/anka-jot/tests/serve-interactions.mjs
```

最后一条启动 5184 端口的隔离环境，Python 使用临时 SQLite 数据库。分别打开
`http://127.0.0.1:5184/anka-jot` 与 `http://localhost:5184/anka-jot` 可模拟独立本地缓存的两个客户端，
无需登录、不访问真实 data/。顶栏「运行存储回归」显示断言结果；再检查同笔记互改、历史恢复、
搜索返回、列表滚动、事项勾选/撤销，以及手机与电脑尺寸。粘贴回归覆盖文字、图片、混合内容、
刷新保留、输入框原位粘贴及弹层保护。此隔离服务不实现媒体上传，只验证图片本机保存和展示，
图片显示待同步属于测试环境边界。停止进程自动清理临时服务端数据库，浏览器端隔离来源的 IDB 保留。
