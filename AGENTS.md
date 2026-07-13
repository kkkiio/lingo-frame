# AGENTS.md

## Domain Language

- **Region Picker** — 进入独占选择状态、命中页面 DOM 元素并返回所选 Region 的交互模块。
- **Region** — 用户确认的单个 DOM 元素或 DOM 容器，也是文本扫描和 LLM Session 的硬边界。
- **Translation Unit** — Region 内保持原文与译文对应关系、具有稳定 ID 和独立翻译状态的最小可读语义块。
- **LLM Session** — 一个 Region 对应的完整 LLM 对话上下文。
- **Translation Slot** — 紧邻一个 Translation Unit 原文之后、用于 interleaved 展示其译文的位置。
- **Bilingual Content** — 一个 Translation Unit 的原文与紧随其后的 Translation Slot 共同形成的双语内容。
- **Provider** — 接受 LLM Session 当前请求并按 Translation Unit ID 返回译文的 DeepSeek 或 OpenAI-compatible 后端。
- **Translation Session** — 一次 Region 选择产生的翻译生命周期，拥有一个 LLM Session 以及全部 Translation Unit 和 Translation Slot。

## Policies & Mandatory Rules

- Region 扫描必须严格停留在所选根节点内，任何优化都不得向祖先或页面全局扩张。
- API Key 只允许存在于 options/background 等扩展可信上下文，禁止发送到 content script、页面 DOM、日志或测试截图。
- 生产 manifest 保持 `activeTab` 按需注入，provider 网络访问使用用户操作触发的 optional host permission。
- 修改 Picker、事件拦截、manifest 权限或 content/background 消息边界时，必须运行真实 Chromium 端到端测试。

## Project Structure Guide

```text
lingo-frame/
├── entrypoints/
│   ├── background.ts             # 工具栏入口、可信翻译请求与取消控制
│   ├── content.ts                # Picker → scan → session 的页面控制器
│   └── options/                  # Provider、目标语言与凭据设置页
├── src/
│   ├── content/
│   │   ├── picker/               # iframe 隔离高亮层与深层元素命中
│   │   └── region/               # Region 文本扫描和 FluentRead 式双语展示
│   ├── shared/                   # 消息协议、Zod 设置模型与本地存储
│   └── translation/              # OpenAI-compatible provider transport
├── tests/                        # 文本扫描、设置和 provider 单元测试
├── e2e/                          # 真实 Chromium 扩展交互测试与 README 截图源
├── public/icons/                 # Chrome manifest 图标和矢量源文件
├── docs/images/                  # 经 E2E 生成并人工核验的产品截图
├── docs/engineering/             # LLM Session 等长期工程决策
├── wxt.config.ts                 # MV3 权限、命令、图标和构建差异
├── UPSTREAM.md                   # FluentRead 基线与 Region Picker 参考归属
└── LICENSE                       # GPL-3.0-only 全文
```

入口层只负责生命周期编排。Region Picker 不读取翻译配置，scanner 不发网络请求，content script 不接触 API Key，provider 不操作页面 DOM。

## Operation Guide

使用 Node.js 20.12 或更高版本。首次进入仓库后运行 `corepack pnpm install --frozen-lockfile`，WXT 会通过 `prepare` 生成 `.wxt` 类型文件。

常用命令：

```bash
pnpm dev          # 启动 WXT Chrome 开发构建
pnpm typecheck    # 运行 Vue/TypeScript 静态检查
pnpm test         # 运行 Vitest 单元测试
pnpm e2e          # 构建 E2E manifest 并在真实 Chromium 中测试扩展
pnpm check        # 依次运行类型检查、单元测试和生产构建
pnpm build        # 输出生产扩展到 output/chrome-mv3
pnpm zip          # 生成可分发压缩包
```

`pnpm e2e` 会生成 `output/chrome-mv3-e2e`，其中只为本地测试服务器加入 `http://127.0.0.1/*` host permission；生产构建会删除 WXT 为 runtime content script 推导出的持久 host permission，并依赖 `activeTab` 注入。

README 截图来自端到端固定页面；只有在交互或展示确实变化时才运行 `CAPTURE_DEMO=1 pnpm e2e` 并查看 `docs/images/region-picker.png` 与 `docs/images/bilingual-result.png`。
