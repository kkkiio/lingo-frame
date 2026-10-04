# Translation Unit 合批与固定分隔符

* Status: accepted
* Date: 2026-10-01
* Updated: 2026-10-05
* 修订关系：修订 [ADR-0001](./0001-llm-session-prefix-cache.md) 的消息结构和 Unit 内部分段，以及 [ADR-0002](./0002-translation-chunk-sizing.md) 的候选切分边界。不增加新的 ADR。

## Context and Problem Statement

原协议发送带 `role` 的 JSON 对象，并要求 Provider 返回等长字符串数组。真实 DeepSeek 响应曾返回条数和顺序正确的 `{role,text}` 对象，导致形状校验失败。因此协议已改为纯文本加固定分隔符，不依赖 JSON mode。

随后一个包含单换行的完整翻译项又暴露了边界问题：请求只带一个 `<<<LFSEG>>>`，模型却在两个自然段的译文前各放一个标记。译文内容完整，`finish_reason` 为 `stop`，但本地切出两项，报 `invalidResponse`。

Translation Unit 已决定原文范围、译文插槽和状态。Unit 内再按空行拆 Segment 并不是页面回填的必要条件，反而让请求边界与页面展示边界不一致。问题是如何保持完整 Unit，继续合批，并让模型复制明确的输出边界。

## Decision Drivers

* 一个 Translation Unit 对应一份译文和一个 Translation Slot；
* Unit 内部换行、空行及跨行格式属于内容，不作为请求项边界；
* 多个 Unit 合批，避免一段文字对应一次网络请求；
* 单项与多项使用同一个提示和协议，不要求模型判断模式；
* 输入、输出及 assistant 回填形状一致；
* 数量错误必须失败，不能通过合并或截断译文掩盖错配；
* 页面 DOM、插槽、属性、内部 ID 和 API Key 不进入模型消息。

## Considered Options

* 完整 Unit 合批，统一使用 `[[TRANSLATE]]`
* 单项不带 marker，多项带 marker
* Unit 内按每个换行或空行拆 Segment
* 保持 JSON 信封，放宽返回形状
* 编号锚点

## Decision Outcome

选择「完整 Unit 合批，统一使用 `[[TRANSLATE]]`」。

* 一个 Unit 只序列化为一个 Translation Segment。Segment 保留为内部消息类型，与 Unit 一对一，不再按文本换行或空行继续切分。
* Chunk builder 按 Unit 累计文本量，沿用 ADR-0002 的尺寸窗口、16 项上限和超长原子项策略；Unit 内部空行不再产生候选 Chunk 边界。scanner 已识别的 DOM 边界、标题和章节起点继续有效。
* 每个请求项之前都写 `[[TRANSLATE]]`，包括只有一个 Unit 的请求。输出与成功后的 assistant 回填使用相同格式。
* 系统提示明确：一个 Unit 可以有多行或多个自然段；内部换行和空行不能新增 marker。
* 不使用 `response_format`，不发送 `role` 或内部 ID；按返回顺序绑定本地 ID。
* 本次保留受限 inline Markdown 和 `lf-link:N` 映射。受限 HTML 尚未完成对照验证，不属于本次格式变更。

### 消息结构

```text
user turn
  [[TRANSLATE]]
  First paragraph of the same Unit.
  Second paragraph of the same Unit.
  [[TRANSLATE]]
  Read **the guide** and run `pnpm test`.

assistant turn
  [[TRANSLATE]]
  同一个 Unit 的第一段。
  同一个 Unit 的第二段。
  [[TRANSLATE]]
  阅读**指南**并运行 `pnpm test`。
```

单项请求也使用同样的前置 marker，无需提示词分支。系统消息只构建一次，可以在同一 Session 的不同批次中稳定复用；历史回复由本地按成功解析的译文重新编码。

### 解析、碰撞与失败

沿用按固定字面量切分、逐项 trim、丢弃空片段、检查数量等于请求项数的规则。单项回复若省略 marker，非空正文仍可解析为一项；这是既有解析容错，不是另一种请求模式。单项或多项回复出现额外非空项仍报 `invalidResponse`。

数量检查不能证明内容完整或顺序正确，也不能保证 marker 次数严格正确。模型可能改变换行、漏译或换序，需用 live eval 样本检查，不能把成功解析当成完全遵守协议。

`[[TRANSLATE]]` 是固定常量，避免裸词在自然语言中出现时误切，也避免 `<|...|>` 等模型特殊 token 外观。没有基于内容动态切换分隔符。原文若包含该字面量，模型复制后仍可能导致切分数量错误；本次接受这项限制，不静默合并译文。

形状失败不自动重试。失败后保留前面已完成的 Unit，停止后续请求，在未完成 Slot 显示错误；取消、45 秒请求超时和追加式 transcript 规则继续沿用 ADR-0001。

### 展示与超长 Unit

完整译文写入该 Unit 已有的 Slot，行内格式和换行由受限 Markdown 渲染器构造，链接只从本地映射恢复。Unit 内不再依赖多个 Segment 的 `separatorBefore` 重新拼接。

超长 Unit 整体发送，即使超过软上限或跨项硬上限；译文全部返回后才显示该 Unit。失去同一 Unit 内部分完成的展示能力，是保持翻译边界与页面边界一致的明确代价。多个 Unit 仍按 Chunk 渐进显示。

### Consequences

* Good, because Unit、翻译项和 Slot 一对一，边界易于理解与排查；
* Good, because 单项和多项协议一致，模型只需复制固定 marker；
* Good, because 句子和跨行格式不会因源码换行被切开；
* Good, because 合批继续降低请求与历史前缀的重复开销；
* Bad, because marker 数量与翻译完整性仍依赖模型遵守指令；
* Bad, because 超长 Unit 不能在内部拆批或渐进展示；
* Bad, because 没有编号，模型调换两份译文时数量检查无法发现；
* Neutral, because Markdown、链接白名单和可信凭据边界继续保留。

## Confirmation

* 单元测试：单项和多项编码、段内换行和空行、过多/过少输出、固定 marker 碰撞、历史 assistant 回填，以及一个 Unit 只产生一项和一个 Slot。
* Chromium E2E：真实扩展发送新 marker；一个含空行的 Unit 作为一项请求并回填一个 Slot；格式、链接、章节合批、失败和取消行为继续验证。
* `pnpm test:live`：通过生产 provider 对用户报告的 food-culture 原文执行单项和三 Unit 合批请求。同一个多行 Unit 不拆开，验证译文数量、内容锚点、顺序及段落覆盖。无凭据请求和完整响应写入 `test-results/unit-protocol-live.json`，marker 和精确换行偏差留作审阅；不做自动重试。

## Evidence and Limits

对原文进行过 3 个 marker × 2 种分段方式的小规模 DeepSeek 实验，每组一次，提示词保持一致。两段合为一项时，`<<<LFSEG>>>` 和 `[[SEG]]` 都多插一个 marker，`[[TRANSLATE]]` 返回一项；拆成两项时三个 marker 都正确返回两项。总计 3,253 tokens。

这支持把 `[[TRANSLATE]]` 作为候选，但每组一次不能证明长期可靠性，也不能证明按所有换行切分更好。后续新提示的 live eval 曾遇到单项回复省略 marker、单换行扩展为空行；原文内容仍完整。解析保留既有数量容错，原始响应保留供审阅，持续评估真实失败而不是反复采样到通过。

## Pros and Cons of the Alternatives

单项省略 marker 能去掉该类计数错误，但需要两种提示和解析模式；本次选择统一协议。按换行拆项可以对齐这条案例的自然段，却会让源码排版切断句子；按空行拆项仍让 Unit 与请求项一对多，本次均不采用。

JSON 信封增加转义与可被模仿的返回形状，不提供顺序锚定。编号可检查顺序和重复，但需要模型保持编号正确，本次不引入。受限 HTML 可作为后续格式实验；任意模型生成 HTML 直接插入页面仍不允许。
