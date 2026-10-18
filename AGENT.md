# AGENT.md · 即刻 Jot 插件 AI 工作守则

> 本目录是 anka 的应用插件。在此工作前：先读本文件 → `README.md`（工程规则）→ `DESIGN.md`（设计契约）。
> 宿主通用红线（≤300 行、单一根元素、禁 `mode="out-in"`、副作用可逆）以仓库根 `AGENT.md` 为准，本文件只补插件私有规则。
> 最后更新：2026-10-18

## 1. 文档地图

| 文件 | 作用 | 何时更新 |
|------|------|----------|
| `README.md` | 工程规则与 `jot-` 语义类速查 | 新增语义类 / 新工程决策 |
| `PLUGIN.md` | 产品功能说明与 Backlog | 功能分层变化 |
| `DESIGN.md` | 设计与工程方案契约（数据模型、API、降级矩阵） | 数据模型 / API / 同步策略变更 |
| `FEATURE.md` | 功能说明书（现在能做什么、怎么操作、边界在哪） | 行为变化时改对应条目并标日期 |
| `CHANGELOG.md` | 变更记录（Keep a Changelog） | 每次核心修改追加 |
| `REVIEW.md` | 实现总览 + 代码评审（问题分级、重构路线） | 大版本后重评一次 |
| 本文件 | AI 行为规范 | 规则变化时 |

冲突时优先级：`DESIGN.md`（契约）> `README.md`（工程规则）> 本文件（流程）。

**文档分工（勿混）**：

- `FEATURE.md` 只写「现状」，写成说明书语气：某条行为变过就在句末标 `（YYYY-MM-DD 变化）`，说明这处最近调整过；没标即自初版未变。验收缺口写进「已知限制与待验收」，不写成叙事。
- `CHANGELOG.md` 写「什么时候改了、改了什么」：修复清单、回归结论、真机验收状态一律放这里。
- 禁止在 `FEATURE.md` 新增「本轮修复」「修复记录」这类段落——它必然与 CHANGELOG 形成两份说法，且会随下一次修复过时。

## 2. 插件私有红线

1. **零 npm import**：前端一切能力经 `uiCtx`（vue/components/icons/api/toast/layout），禁止 `import` 任何包。
2. **`jot-` 语义类铁律**：布局/尺寸/边框/截断/响应式等塌缩级样式，必须先加语义类到 `web/lib/ui.css.ts` 再使用；禁写新任意值类（`h-[72px]`）与断点变体（`md:`）。详见 README「宿主 Tailwind 解耦」。
3. **录音不重新 `getUserMedia`**：一律走 `lib/audio.ts` 的 MicSession（`acquireMicStream`），iOS 二次录音无声是修过的坑。
4. **移动端拍照走 `<input capture>`**：直呼系统相机，不弹网页授权；桌面端才用 getUserMedia 取景（Camera.vue）。
5. **写路径铁律**：一切写先落 IndexedDB，数据变更与 outbox 追加在**同一事务**；读默认读本地。
6. **颜色一律 CSS 变量**（`var(--bg-1)` 等），禁硬编码色值，深色跟随靠 `lib/theme.ts`。
7. **后端无私有路由**：能力一律 `POST /api/apps/jot/call {method,args}`；LLM 只经 `ctx.llm`，禁直调 provider SDK。
8. **`data/` 是运行时数据**：不提交、不手改、不往代码里写死其内容（已 gitignore）。
9. **不改宿主内核**：确需宿主配合的改动（如 share_target、SW 注入）按 DESIGN §0 白名单流程提评审，不顺手改。
10. **系统返回经宿主分发**：`lib/nav.ts` 维护 Jot 内部栈，通过 `uiCtx.navigation.register` 注册返回；hash 经 `setHash('anka-jot', ...)` 镜像，禁止监听顶层 `popstate` 或覆盖路由器 history.state。切应用保留本插件栈，teardown 注销。完整协议见宿主 `docs/NAVIGATION.md`。

11. **列表只加载缩略图**：图片与视频卡片使用最长边 480px 的 JPEG；缺图时从本地 full 补生成或调用 `ensure_thumbnail`，禁止列表自动下载远端原图/原片，点击查看才加载原文件。采集生成失败不得丢原文件；上传/秒传均须返回 thumbPath。`useMedia` 独立持有 URL，失败可重试，禁止永久 broken 状态。
12. **PWA 恢复必须重试媒体**：visibilitychange 可见、pageshow、online、冷启动和下拉刷新触发附件对账；相同 note rev 也补缺失路径。本地待传编辑不得被远端覆盖。
13. **服务端缩略图依赖 FFmpeg**：前端无法解码或旧数据缺封面时由服务端补生成；不可用须明确报错并保留原文件。回归必须检查列表没有原文件请求，并覆盖图片、视频、秒传与历史补图。
14. **只有一条同步写路径**：先 IDB + outbox，后媒体上传，再 upsert_note；禁止绕开 outbox 写穿透或失败五次后删除队列。同步请求应可超时，UI 不等待上传完成。

## 3. 标准工作流

### 开工前
1. 读 `FEATURE.md` 确认功能现状与 Backlog，读 `DESIGN.md` 相关章节确认契约
2. 涉及 UI 先看 `README.md` 的 `jot-` 速查表，已有语义类优先复用

### 实现中
- 改 `web/`：dev 下刷新即生效（vite 即时编译），无需重启
- 改 `server/`：必须重启后端才生效
- 生产验证：`cd web && npm run build`（`.src-hash` 指纹变化会强制插件重建）

### 验证要求（本插件特有）
- **iOS PWA 真机必测**：录音（连录两次）、拍照、safe-area、宿主旧构建下无新工具类塌缩
- 飞行模式链路：写 → 离线横幅计数 → 联网补传收敛
- 双视口：390×844 与 1280×800 各看一眼（列数响应式是否正确）

### 收尾前（必须）
1. `CHANGELOG.md` 追加条目（Unreleased 或新版本），含修复清单、回归结论、真机待验收项
2. `FEATURE.md` 只改对应条目：状态勾选 + 句末标 `（YYYY-MM-DD 变化）`；不追加「本轮修复」段落，不搬运 CHANGELOG 内容
3. 新增 `jot-` 语义类 → `README.md` 速查表补一行
4. 数据模型 / API 变更 → `DESIGN.md` §4/§8.2 同步

## 4. 命令速查

```bash
./start_all.sh                 # 开发：宿主 + 插件全链路
# 后端日志关键字：agentos.jot
# 浏览器排障：DevTools → Application → IndexedDB `jot-db`
sqlite3 plugins/anka-jot/data/jot.db   # 服务端库直查
```

## 5. 术语对照

| 术语 | 含义 |
|------|------|
| outbox | IndexedDB 内的有序同步队列（seq 保序） |
| 失败项 | 失败计数最多 5，条目保留并重试，不阻塞其他笔记；不得静默删除 |
| LWW | Last-Write-Win，按 rev/updatedAt 收敛冲突 |
| 方案 B | 纯 `/call` 轮询推拉同步（当前实现），区别于 `ctx.sync` WS 实时通道（📋） |
| MicSession | 会话级持久麦克风流，iOS 修复方案，见 `lib/audio.ts` |
| `jot-` 语义类 | 插件注入 CSS 类，规避宿主 Tailwind 构建缺类风险 |
