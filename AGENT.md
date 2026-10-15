# AGENT.md · 即刻 Jot 插件 AI 工作守则

> 本目录是 anka 的应用插件。在此工作前：先读本文件 → `README.md`（工程规则）→ `DESIGN.md`（设计契约）。
> 宿主通用红线（≤300 行、单一根元素、禁 `mode="out-in"`、副作用可逆）以仓库根 `AGENT.md` 为准，本文件只补插件私有规则。
> 最后更新：2026-10-15

## 1. 文档地图

| 文件 | 作用 | 何时更新 |
|------|------|----------|
| `README.md` | 工程规则与 `jot-` 语义类速查 | 新增语义类 / 新工程决策 |
| `PLUGIN.md` | 产品功能说明与 Backlog | 功能分层变化 |
| `DESIGN.md` | 设计与工程方案契约（数据模型、API、降级矩阵） | 数据模型 / API / 同步策略变更 |
| `FEATURE.md` | 功能状态全景（✅/⚠️/📋） | 每次交付功能后勾选 |
| `CHANGELOG.md` | 变更记录（Keep a Changelog） | 每次核心修改追加 |
| 本文件 | AI 行为规范 | 规则变化时 |

冲突时优先级：`DESIGN.md`（契约）> `README.md`（工程规则）> 本文件（流程）。

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
1. `CHANGELOG.md` 追加条目（Unreleased 或新版本）
2. `FEATURE.md` 同步功能状态勾选
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
| 毒丸 | 连续失败 5 次转死信的 outbox 记录，不堵队 |
| LWW | Last-Write-Win，按 rev/updatedAt 收敛冲突 |
| 方案 B | 纯 `/call` 轮询推拉同步（当前实现），区别于 `ctx.sync` WS 实时通道（📋） |
| MicSession | 会话级持久麦克风流，iOS 修复方案，见 `lib/audio.ts` |
| `jot-` 语义类 | 插件注入 CSS 类，规避宿主 Tailwind 构建缺类风险 |
