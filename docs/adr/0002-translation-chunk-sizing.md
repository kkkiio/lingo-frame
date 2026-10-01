# Translation Chunk 尺寸窗口与反馈节奏

* Status: accepted
* Date: 2026-09-16
* 修订关系：修订 [ADR-0001](./0001-llm-session-prefix-cache.md) 中仅由标题和连续空行决定 Translation Chunk 的规则。

## Context and Problem Statement

Translation Session 需要尽快返回 Region 顶部的译文，同时避免大量小请求。请求过大会延迟第一次可读反馈；请求过小则会放大网络与模型首 token 的固定开销，并在多轮 LLM Session 中反复携带不断增长的对话前缀。

页面结构只能说明哪里适合切分，不能单独决定是否值得发起一次请求。短推文可能用空行组织三段文字，但整体仍远小于一次合理请求。文章也可能连续出现多个很短的小节；逐节请求不会改善阅读反馈，反而增加等待和成本。

问题因此是：Translation Chunk 的边界如何既尊重阅读结构，又不让结构本身决定请求数量？

## Decision Drivers

* 首个可读译文尽快出现，且首次反馈不能被大请求推迟；
* 不在多轮会话中反复携带增长的前缀，也不制造大量小请求；
* 切分点应与阅读结构相关，而不是任意字符位置；
* 跨 Segment 的总量仍需一个绝对上限；
* 尺寸估算不能绑定到某个可配置模型的 tokenizer；
* 单个语义块优先保持完整，质量优先于严格命中尺寸上限。

## Considered Options

* 尺寸窗口加候选结构边界
* 每个标题或连续空行边界各发一次请求
* 固定字符或 token 预算硬截断
* 每个 Translation Unit 独立请求

## Decision Outcome

Chosen option: "尺寸窗口加候选结构边界"，因为页面结构只能说明哪里适合切分，只有累计文本量能说明是否值得发起一次请求。

Translation Unit 继续负责 DOM 对齐、Translation Slot 和独立翻译状态。Translation Segment 继续负责一个请求内的输入输出对齐。Translation Chunk 专门负责请求批次，不再与每个标题或空行一一对应。

标题、Translation Unit 边界和连续空行是候选切分点。Chunk builder 按阅读顺序累计 Segment，并根据新增 Segment 的 Markdown 文本的估算 token 数选择候选边界：

| 批次 | 最小值 | 目标值 | 软上限 |
| --- | ---: | ---: | ---: |
| 首个 Chunk | 200 | 300 | 400 |
| 后续 Chunk | 500 | 750 | 1000 |

达到最小值后遇到标题或连续空行时结束当前 Chunk；没有优先结构边界时，达到目标值后的下一个 Segment 边界结束 Chunk。加入下一个 Segment 会越过软上限时，也在该 Segment 前结束当前 Chunk。

每个 Chunk 最多包含 16 个 Segment，并以 1500 个估算 token 作为跨 Segment 的绝对上限。单个 Segment 是语义原子；如果它自身超过上限，仍作为一个完整 Chunk 发送，不在句子中间截断。

估算只服务于交互节奏，不承担 Provider 上下文窗口的精确计量。使用 UTF-8 字节数除以三作为跨英文、中文和混合文本的稳定近似，避免把分片协议绑定到某个可配置模型的 tokenizer。

Region 结束时立即提交剩余 Segment，即使没有达到最小值。因此一条只有几十个 token、包含多个空行段落的推文仍然只产生一个请求。

首个 Chunk 较小，使页面顶部通常能在一次短生成后出现译文。后续 Chunk 更大，降低总请求数和重复 transcript 的增长速度。每个 Chunk 完成后仍立即更新对应 Translation Slot；同一 Region 的 Provider transcript 仍按请求顺序增长，保持术语、语气和指代一致。

分片只改变请求调度，不改变 Region 硬边界，也不让 content script 接触 Provider 设置或 API Key。

### Consequences

* Good, because 短推文、评论和多个短小节会合并为一次请求；
* Good, because 长文章仍按阅读顺序渐进展示，不必等待整个 Region；
* Good, because 标题和空行继续保护语义结构，但不会制造低价值的小请求；
* Good, because 请求数量下降，完整 transcript 的重复传输和 Prefix Cache 压力随之降低；
* Good, because 超长的单一语义块保持完整，翻译质量优先于严格命中尺寸上限；
* Neutral, because 尺寸窗口是交互节奏参数，与 Provider 上下文窗口的精确计量无关，调整时不需要改动协议；
* Bad, because 请求边界不再与页面结构一一对应，排查时需要同时看 Chunk builder 的累计量。

### Confirmation

本地性能测试以首个可读译文中位数 2 至 3 秒、95 分位不超过 5 秒为目标，后续单片目标是 3 至 5 秒。典型文章应控制在 5 至 8 个请求以内。调整尺寸窗口时以这些体验指标为依据，并同时检查 Provider 错误率和单次返回的 Segment 数量，不记录被翻译的正文。

## Pros and Cons of the Options

### 尺寸窗口加候选结构边界

选中的方案。

* Good, because 首个 Chunk 小，顶部译文出现快；
* Good, because 后续 Chunk 大，总请求数与前缀重复传输下降；
* Good, because 候选边界仍来自阅读结构，语义不被任意位置切断；
* Good, because 估算方法与具体 tokenizer 解耦；
* Neutral, because 绝对上限允许单个超长 Segment 独占一个 Chunk；
* Bad, because 阈值是经验参数，需要按体验指标持续校准。

### 每个标题或连续空行边界各发一次请求

[ADR-0001](./0001-llm-session-prefix-cache.md) 的原始规则。

* Bad, because 连续多个短小节会产生低价值的小请求；
* Bad, because 每次请求重新携带增长的前缀，放大固定开销；
* Bad, because 短推文的多个空行段落会被拆成多次请求，反而推迟完整译文。

### 固定字符或 token 预算硬截断

* Bad, because 切分点与文章结构无关；
* Bad, because 语义块可能被从中间截断，破坏译文完整性。

### 每个 Translation Unit 独立请求

* Bad, because 轮次过多，重复发送上下文；
* Bad, because 章节级语义与术语一致性被削弱。

## More Information

阈值、Segment 上限与估算公式集中在 Chunk builder 中，修改它们不应波及 scanner、Provider transport 或渲染层。

分片策略不改变 API Key 边界：content script 只生成 Chunk 结构，真正的 Provider 请求仍由 background 发起。
