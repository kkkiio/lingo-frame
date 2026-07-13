# LLM Session 与 Prefix Cache

## 状态

已采纳，适用于 Region 翻译协议、Provider transport 和 interleaved 双语渲染。

## 决策

一次 Region 选择创建一个 Translation Session，并对应一个 LLM Session。scanner 在 Region 硬边界内提取全部 Translation Unit，按照原文顺序和结构角色稳定编号。当前 LLM Session 只有一个翻译 turn：Provider 在一次 Chat Completions 请求的 user message 中接收 Region 的全部 Translation Unit，并一次返回全部译文。

当前实现从单轮 LLM Session 开始，Session messages 由一次整区翻译请求及响应构成。未来进行译文修订、追问或扩展为同一页面单 Session 时，可以保留已有 system、user 和 assistant messages，并在末尾追加新的 turn。

Translation Unit 是原译文对齐、展示和状态跟踪的边界。HTML 块元素或 `<br>` 形成多个 Translation Unit 时，每个 Unit 都有一个紧邻原文的 Translation Slot，译文按 interleaved 策略写入对应 Slot。单个 Text node 内的换行保留在同一个 Unit 和译文块中，不引入文本 Range 拆分逻辑。Region 不按 token 数或 DOM 子树拆成多个 LLM Session。

## 当前消息结构

system message 定义目标语言、整区上下文语义和 JSON 输出契约。Region 的全部 Translation Unit 放在一个 user message 中：

```json
{
  "units": [
    { "id": "unit-0", "role": "heading", "text": "A title" },
    { "id": "unit-1", "role": "paragraph", "text": "A paragraph." }
  ]
}
```

DOM 节点、Translation Slot、页面属性、request ID 和 API Key 都不进入 LLM messages。content script 只发送稳定 ID、结构角色和可读文本；API Key 继续限制在 background 等扩展可信上下文。

Provider 必须返回以 Translation Unit ID 对齐的 JSON：

```json
{
  "translations": [
    { "id": "unit-0", "text": "一个标题" },
    { "id": "unit-1", "text": "一个段落。" }
  ]
}
```

background 在响应跨越消息边界前校验 JSON、完整 Unit ID 集合、重复 ID 和空译文。页面只通过 `textContent` 写入已经存在的 Translation Slot，不解析或插入 Provider 生成的 HTML。

## Prefix Cache

当前实现中，每个 LLM Session 只发送一次整区翻译请求，因此同一 Region 内没有后续 turn 需要复用缓存。用户再次选择相同 Region 时，相同 messages 仍可能由 Provider 的自动 prefix cache 复用，但这不属于 Translation Session 的功能契约。

未来增加后续翻译操作时，客户端应保存当前 LLM Session 的 messages，并采用标准多轮形式追加新的 user message：

```text
system + region user message + assistant translation + new user message
```

这种追加方式完整复用上一轮请求输入和模型输出形成的缓存前缀。缓存属于性能优化；每次 Chat Completions 请求仍携带恢复当前 LLM Session 所需的 messages，不能依赖 Provider 隐式持久化服务端会话。

## 请求与失败

Translation Session 在开始网络请求前创建全部 Translation Slot，并显示各 Unit 的加载状态。一次请求成功后按 ID 将结果分别写入对应 Slot。

当前结构化响应采用整区原子校验。网络错误或输出协议错误会使整个 Region 进入失败状态并显示错误原因，不提供重试控件。用户需要重新选择 Region 才能创建新的 Translation Session。取消 Translation Session 会中止仍在进行的 Region 请求。

## 结果

- Provider 始终看到完整 Region，跨段落翻译保持统一语境；
- 一次 Region 翻译只产生一个 user message 和一次初始 Chat Completions 请求；
- interleaved 渲染位置由本地 DOM 扫描决定，Provider 输出无法控制页面结构；
- 后续功能可以在同一 LLM Session 中追加 messages，并进一步扩展为页面级 Session；
- 任意 OpenAI-compatible endpoint 都必须满足当前 JSON Output 契约，协议错误会显式呈现。

## 放弃的方案

### 每个 Translation Unit 独立请求

该方案重复发送或丢失 Region 上下文，跨段落一致性较差，并增加网络往返次数。

### 按 token 预算自动拆分 Region

该方案会让同一次用户选择产生多个互不完整的 LLM Session，并随着模型窗口增长保留长期复杂度。本项目选择直接暴露 Provider 的实际上下文限制。

### 让 Provider 返回 HTML

HTML round-trip 能携带结构，却把 DOM 完整性和安全性委托给模型输出。LingoFrame 保留本地 Translation Slot，只接受按稳定 ID 对齐的纯文本译文。
