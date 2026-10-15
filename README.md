# anka-jot

即刻（Jot）— 离线优先的速记插件：打开即记、拍完即存、说完出字。
文本 / 拍照 / 相册 / 语音四入口，按天分组的时间线瀑布流，增量同步到服务端。

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
        pullMerge()  snapshot(sinceRev) 增量拉取，rev 大者胜（笔记级 LWW）
```

- **毒丸不堵队**：单条失败先 `stats` 探活——服务端不可达则保序停推（不烧重试次数）；
  服务端活着则本条计一次失败并**跳过续推**（同笔记乱序由服务端 rev LWW 兜底收敛），5 次转死信。
- **mime 归一化**：上传前两端都把 `blob.type` 的 `;codecs=` 参数剥掉再查扩展名
  （iOS Safari 录音 blob 常是 `audio/mp4;codecs=mp4a.40.2`，曾让整条队列卡死）；
  未识别 mime 按 kind 兜底扩展名，不再判非法。
- **媒体硬失败**：本地 blob/sha256 缺失时不上传该笔记，避免「缺媒体的笔记」同步上去。
- **本地未推送编辑保护**：拉取时若本地 `syncState === 'local'`，服务端版本只进历史留档，不覆盖。
- **触发时机**：`online` 事件 + `visibilitychange` 回前台 + 60s 前台心跳 + 手动（banner「同步」按钮，
  结果 toast 反馈，失败原因直接显示在 banner 里）。
- **UI 刷新节流**：仅当队列/数据确有变化才回调 `onChanged`，避免每 60s 全量重渲染。

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

- **iOS**：Safari 打开 → 分享 →「添加到主屏幕」。必须从主屏图标进入，
  才有独立全屏、后台音频会话与正确 safe-area。
- **Android / 桌面 Chrome**：地址栏安装图标。

---

## `jot-` 语义类速查

| 类 | 用途 |
|---|---|
| `jot-shutter` / `jot-shutter-inner` | 拍照快门 72px 圆钮 |
| `jot-rec-btn` | 录音大按钮 |
| `jot-card` | 笔记卡（圆角 + 发丝边框 + 分层柔影 + 按压反馈） |
| `jot-container` | 主容器响应式宽度（手机满宽 / ≥768px / ≥1280px） |
| `jot-clamp-2` / `jot-clamp-5` | 行截断（替代 line-clamp） |
| `jot-cols` / `jot-col` | 手动瀑布流列 |
| `jot-fs-*` / `jot-leading-145` | 任意值字号 / 行高 |
| `jot-press` / `jot-press-strong` | 按压缩放反馈 |
| `jot-wave` / `jot-wave-bar` | 波形条 |
| `jot-voicebar*` | 语音气泡（播放钮 + 波形 + 时长） |
| `jot-bar-wrap` / `jot-bar-item` / `jot-bar-tile` | 首页通栏方块工具条（圆角方块瓷贴，与宿主胶囊 dock 区分） |
| `jot-date-sep` | 时间线日期分隔（双侧渐变细线 + 加粗标签） |
| `jot-cover-missing` | 封面图加载失败渐变占位 |
| `jot-overlay-blur` / `jot-safe-bottom` / `jot-sheet-maxh` | Sheet 弹层 |
| `jot-rail` / `jot-dot` | 日历时间轴定位 |
| `jot-scan-*` | 扫描参考框 |

## Do / Don't

- ✅ 新视觉关键样式 → 先加 `jot-` 语义类再使用。
- ✅ 新响应式需求 → `ui.css.ts` 里写 `@media` 或 JS `matchMedia`。
- ❌ 不要在模板里写 `h-[72px]`、`md:max-w-3xl`、`columns-2`、`line-clamp-2` 这类新任意值/变体。
- ❌ 不要硬编码颜色；用 `var(--*)`，深色模式才不破。
- ❌ 不要在录音流程里重新 `getUserMedia`（走 `acquireMicStream`）。
