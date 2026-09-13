# LLM Session、结构分片与 Prefix Cache

## 状态

已采纳，适用于 Region 翻译协议、Provider transport 和 interleaved 双语渲染。Translation Chunk 的边界与尺寸规则由 [Translation Chunk 尺寸窗口与反馈节奏](./translation-chunk-sizing.md) 修订。

## 决策

一次 Region 选择创建一个 Translation Session，并对应一个多轮 LLM Session。scanner 只在 Region 硬边界内提取 Translation Unit；content 根据标题与连续空行生成有序 Translation Chunk，background 在同一 Provider transcript 中串行翻译这些 Chunk，并在每轮完成后立即把译文推送给页面。

结构分片不使用字符数或 token 数强制截断。`h1` 至 `h6` 开始一个新 Chunk，并与后续正文组成章节；相邻 `<br><br>` 和文本节点内的空行也开始新 Chunk。没有这些结构边界的章节保持完整，即使它很长。

Translation Unit 仍然是原译文对齐、展示和状态跟踪的边界。文本节点内的空行只在请求层生成多个 Translation Segment，Segment 译文会按原空行合并回同一个 Translation Slot，不增加页面插槽或改变 DOM 扫描粒度。

## 消息结构

system message 定义目标语言、多轮上下文语义和 JSON 输出契约。每个 user turn 只包含当前 Chunk：

```json
{
  "segments": [
    {
      "role": "heading",
      "text": "A section title"
    },
    {
      "role": "paragraph",
      "text": "A paragraph."
    }
  ]
}
```

Provider 只需按输入顺序返回等长的字符串数组：

```json
{
  "translations": [
    "一个小节标题",
    "一个段落。"
  ]
}
```

Segment ID 只存在于 content/background 的本地消息协议。background 校验译文数组与当前输入等长且没有空译文，再按数组位置绑定内部 Segment ID；LLM 不复制或生成 ID。页面按内部 ID 写入已经存在的 Translation Slot。Segment 的文本内容使用受限的 inline Markdown；content 使用 markdown-it 解析并创建文本、强调、行内代码、链接和换行节点，原始 HTML 不参与 DOM 构造。DOM 节点、插槽、页面属性、内部 Segment ID 和 API Key 都不进入 LLM messages。链接目的地使用 Session 内稳定的 `lf-link:N` 引用；地址映射仅保留在 content，并限定到对应 Segment。

## 多轮上下文与 Prefix Cache

Provider Chat Completions 接口不提供可依赖的隐式会话。background 为 Port 生命周期保存 messages，并在每轮请求中发送恢复 LLM Session 所需的完整 transcript：

```text
system
+ chunk 0 user
+ chunk 0 assistant
+ chunk 1 user
+ chunk 1 assistant
+ ...
```

因此后续 Chunk 能看到此前原文和译文，用于保持术语、语气和指代一致，但看不到尚未发送的后文。追加式 messages 也为支持 prefix cache 的 Provider 提供稳定前缀；缓存只是性能优化，不属于正确性契约。

完整 transcript 会随文章增长，且包含原文与译文。单个无结构章节或累计 transcript 仍可能超过模型上下文窗口，这种 Provider 限制以明确错误呈现，不通过静默截断或创建另一个 LLM Session 规避。

## 渐进状态、失败与取消

Translation Session 在网络请求前创建全部 Translation Slot。每个 Chunk 成功后立即更新涉及的 Slot；一个 Unit 的全部 Segment 完成后才进入 translated 状态。background 随后开始下一个请求，每个请求独立使用 45 秒超时，整个 Translation Session 没有总超时。

第 N 个 Chunk 失败时，前 N-1 个 Chunk 的译文继续保留，当前未完成内容和后续内容显示相同失败原因，Session 停止且不跳过、不自动重试。取消或 runtime Port 断开会中止当前 fetch，并阻止后续 Chunk 请求；已完成译文继续保留。

## 结果

- 首个结构章节完成后即可开始阅读，不必等待整个 Region；
- 一次 Region 始终只有一个按顺序增长的 LLM Session；
- 结构边界优先保护章节与段落语义，不以固定预算牺牲翻译效果；
- interleaved 渲染位置仍完全由本地 DOM 扫描决定；
- API Key 和 Provider transcript 始终限制在 background 等可信扩展上下文。

## 放弃的方案

### 每个 Translation Unit 独立请求

该方案会把每个段落变成独立会话或产生过多轮次，重复发送上下文，并削弱章节级语义。

### 固定字符或 token 预算

固定预算会在与文章结构无关的位置切换请求。LingoFrame 只接受标题和连续空行等明确结构边界；没有边界时保持整个章节。

### 预先发送完整 Region

先发送全文再逐片要求译文仍会让首轮承担完整输入，并让未来内容过早进入上下文。本协议按阅读顺序发送 Chunk，只保留已经处理的上下文。

### 让 Provider 返回 HTML

HTML round-trip 会把 DOM 完整性和安全性委托给模型输出。LingoFrame 保留本地 Translation Slot，接收按内部 ID 对齐的 Markdown 译文。Markdown 仅表达块内文本语义，原页面负责标题、列表和表格的外层结构。模型返回的链接只按本地白名单恢复，输出不携带可执行 HTML 或任意 DOM 属性。

## Markdown 语义保留

scanner 记录所选根节点内已接受文本节点的行内祖先，按原始文本空行确定 Segment 后，再用 Turndown 序列化筛选后的 DOM 片段。每个 Segment 的格式独立闭合；不会通过对 Markdown 字符串再次切片产生不完整的标记。被过滤的隐藏内容、代码块和其他 Unit 不参与转换。

原文显示保持原样。每轮完成后按 Segment 解析译文，按原分隔符组合回同一个 Slot。译文继承所在语义块的字重，局部 strong、em、code 和链接提供对应样式。

以 `pnpm test:live` 的相同模型、相同提示和相同分段，对比纯文本、包含原 URL 的 Markdown、包含本地链接编号的 Markdown。结果写入 `test-results/markdown-comparison.json`，包含译文、耗时和 API token 用量。格式与链接完整性可自动校验，语义准确性需要阅读样本；单次运行不能证明整体质量或性能提升。
