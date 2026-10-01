# 纯文本 Segment 协议与固定分隔符

* Status: accepted
* Date: 2026-10-01
* 修订关系：修订 [ADR-0001](./0001-llm-session-prefix-cache.md) 的「消息结构」一节，input、assistant 回填和期望回复统一为纯文本。

## Context and Problem Statement

原协议把每个 user turn 组织成 JSON 对象，并要求 Provider 返回等长的字符串数组，同时开启 `response_format: {"type":"json_object"}`：

```json
{
  "segments": [
    { "role": "heading", "text": "A section title" },
    { "role": "paragraph", "text": "A paragraph." }
  ]
}
```

真实观测（DeepSeek `deepseek-v4-flash`，同一 Region 的两个 Chunk）暴露了这个契约的脆弱点：第一个 Chunk 返回字符串数组，成功；第二个 Chunk 返回了 9 个 `{"role":"caption","text":"..."}` 形式的对象，**条数与顺序都正确，只有元素形状错误**。校验按字符串数组执行，因此抛错并把整个 Translation Session 判为「译文不完整或无法读取」，其后所有未完成的 Segment 都显示同一失败原因。

根因不是提示词措辞。Segment ID 只存在于 content/background 的本地协议，Provider transport 只发送文本，provider 也一直按数组位置绑定译文，因此**对齐自始至终由位置决定，JSON 信封没有提供任何锚定能力**。信封只是额外带来了转义、键名和一层可被模仿的形状：输入带着 `role` 字段，模型就复刻了 `role`。

问题因此是：如何让模型需要复刻的结构尽可能小，同时不依赖某个 Provider 对 JSON mode 的支持？

## Decision Drivers

* 模型只应被要求复刻最小、无状态的结构，不需要计数或编号；
* 输入与输出形状对称，避免「看一种形状、要另一种形状」；
* 段内换行与空行属于译文内容，不能被协议当成边界；
* 失败必须响亮：宁可整批报错，也不能静默错配；
* 不依赖 `response_format`，兼容不支持 `json_object` 的 OpenAI-compatible 后端；
* DOM、插槽、内部 Segment ID 与 API Key 继续不进入 LLM messages。

## Considered Options

* input、assistant 回填与期望回复统一为纯文本，Segment 之间用固定字面量分隔符
* 保持 JSON，只放宽校验
* 保持 JSON，只收紧提示词
* 编号锚点，例如 `[[1]]`
* 一行一个 Segment
* 让 Provider 返回 HTML

## Decision Outcome

Chosen option: "统一为纯文本加固定字面量分隔符"，因为它把模型需要复刻的结构压缩为一个无状态字面量，同时保持按位置对齐，不引入计数或编号。

- 移除 `response_format`，system message 不再要求 JSON 输出；
- user turn 不再携带 JSON 信封，也不再发送 `role`；
- 分隔符是无状态字面量，模型只负责原样复制；
- 保留：Chat Completions 的外层响应结构、按位置绑定 Segment ID、译文数量与空译文校验、每请求 45 秒超时、追加式多轮 transcript。

### 消息结构

```text
system message
  目标语言、术语与语气一致、inline Markdown 与 lf-link 引用保留、原文只作为数据
  说明：最新 user message 以分隔符开头并在每个 Segment 前重复，回复必须原样复制该分隔符

user turn
  <<<LFSEG>>>
  Engram extends standard token embeddings ...
  <<<LFSEG>>>
  **With Engram model architecture optimization, ...** [This ...](lf-link:1)
  <<<LFSEG>>>
  Our DeepSeek-V4.1-Flash configuration uses ...

assistant turn
  <<<LFSEG>>>
  Engram 通过学习到的多 token 查找扩展了标准 token 嵌入……
  <<<LFSEG>>>
  **通过 Engram 模型架构优化……**
  <<<LFSEG>>>
  我们的 DeepSeek-V4.1-Flash 配置……
```

分隔符出现在每个 Segment 之前，因此 N 个 Segment 对应 N 个分隔符，请求与回复形状对称。system message 直接写出 `<<<LFSEG>>>`，user message 再逐段重复一次，模型不需要推断、不需要计数。译文内部的换行与空行是合法内容。

### 分隔符与碰撞

分隔符取值需要同时避开内容与模型自身的特殊标记：

- `<|...|>` 形状属于 DeepSeek 的特殊 token 家族，不能用；
- `---` 与 Markdown 分隔线冲突，`###` 与标题冲突，`%%` 会出现在讨论格式化的行内代码里；
- 采用 `<<<LFSEG>>>`，写成单一常量。

分隔符是全局常量，由 system message 逐字写出，不按请求切换。备选方案是在发送前检查 Chunk 文本、命中就换成候选表中的另一个分隔符，但 system message 在一次 Translation Session 内只构建一次，早于任何 Chunk 到达，写死的字面量会与按请求选出的字面量互相矛盾。因此这里选择固定常量，并接受它的代价：Segment 文本中的行内代码若恰好包含该字面量，会原样发送；模型若照抄，回复会多切出一段，数量校验失败并让该 Chunk 报 `invalidResponse`。这是响亮失败，不会静默错配，而且要求原文出现 `<<<LFSEG>>>` 本身极罕见。

若将来确实要同时保留碰撞保护与逐字写出的分隔符，需要把全部 Chunk 提前交给 Provider transport，在第一个请求之前选定分隔符并固定到整个 Session；那属于会话级决策，要作为新的 ADR 提出。

### 解析与失败处理

回复按分隔符字面量切分（子串切分，不按行），逐段 trim，丢弃空片段，然后断言剩余段数等于输入的 Segment 数。丢弃空片段让回复对开头、结尾或连续的分隔符保持宽容，而不会造成错配：每次切分都保持顺序，空译文本来就无效，数量不符仍然会失败。形状不符时按 Provider 失败上报 `invalidResponse`，由页面显示既有失败文案。

需要说明协议本身的边界：只有一个 Segment 的 Chunk 没有可用于校验的结构，任何非空回复都会被当作该 Segment 的译文。多 Segment 的 Chunk 才有结构可校验，旧的对象数组或 JSON 信封会因数量不符被拒绝。

协议形状失败不自动重试，与 [ADR-0001](./0001-llm-session-prefix-cache.md) 的「不跳过、不自动重试」保持一致。若后续要引入仅针对协议形状失败的一次重试，必须同时修订该决策，而不是在 transport 层静默新增行为。

### Consequences

* Good, because 模型需要复刻的结构收敛为一个字面量，`role` 等可被模仿的字段不再进入请求；
* Good, because 不再有 JSON 转义，段内换行按原文保真，输入与输出形状对称；
* Good, because 不依赖 `json_object`，对不支持该参数的 OpenAI-compatible 后端更兼容；
* Good, because 失败模式收敛为「分隔符数量不等」，响亮、可诊断，不再出现「条数正确但形状错误」这类只能整批丢弃的结果；
* Bad, because 失去 JSON mode 的结构保证，回复可能夹带前言或漏抄分隔符；
* Bad, because 顺序不再可校验，模型若调换两段译文无法被识别；
* Neutral, because 外层仍是 Chat Completions 的 `choices[0].message.content`，响应解析与错误映射不变。

### Confirmation

* 单元测试覆盖：按分隔符切分与空片段丢弃、段数与输入不符、单 Segment Chunk 的宽容、多 Segment Chunk 拒绝 JSON 信封、原文含分隔符时原样发送并因数量不符失败；
* e2e 的假 Provider 按新协议解析请求并作答，改动后运行 `pnpm e2e`，因为 Provider 协议同时属于 content/background 的边界；
* e2e 用从 [SemiAnalysis 的 Engram 文章](https://newsletter.semianalysis.com/p/engrams-embedding-entendre-codesign) 抓取的片段作为真实素材：长段落、`figcaption` 图注、密集外链和 H1 小节，验证分片、图注渲染与 `lf-link:N` 还原；
* 可选 `pnpm test:live`：同一模型、同一提示、同一分段，对照 JSON 协议与分隔符协议的解析失败率、耗时和 token 用量，产物写入 `test-results/`。

## Pros and Cons of the Options

### 纯文本加固定字面量分隔符

选中的方案。

* Good, because 模型只需复制一个字面量，不需要计数或编号；
* Good, because 输入输出形状对称，没有可被复刻的嵌套结构；
* Good, because 子串切分对段内换行与空行完全免疫；
* Good, because 对不支持 `json_object` 的后端同样可用；
* Bad, because 失去 JSON mode 的结构保证；
* Bad, because 缺少顺序校验，只能靠严格计数发现漏抄与多抄。

### 保持 JSON，只放宽校验

接受字符串或 `{text}` 对象能把这次的事故变成成功。

* Good, because 改动最小，形状偏离不再导致整批失败；
* Bad, because 形状模仿面和转义开销都还在，下一次偏离仍要以同样方式兜底；
* Bad, because 继续把正确性建立在模型遵守结构之上。

### 保持 JSON，只收紧提示词

* Good, because 不改变协议；
* Bad, because 一个未加说明的 `role` 字段已经足以让模型改变整批输出的形状，说明该方案不够可靠。

### 编号锚点

* Good, because 可以对乱序、漏项、重复做精确校验；
* Bad, because 有状态：模型必须自己计数并保证编号不漂移，而编号对它没有语义；
* Bad, because 写错编号与形状错误同样是整批失败，宽容解析编号则等同于没有锚点。

### 一行一个 Segment

* Good, because 解析最简单；
* Bad, because 单个 `\n` 属于 Segment 内容并被渲染为 `<br>`，行切分会把段内换行当成段边界；
* Bad, because 行数不符时整批失败，而两处增删换行相互抵消时会静默错配，比形状错误更难发现。

### 让 Provider 返回 HTML

* Bad, because 把 DOM 完整性和安全性委托给模型输出，与 [ADR-0001](./0001-llm-session-prefix-cache.md) 的结论冲突。

## More Information

观测证据来自一次真实抓包：同一 Region 的两个请求都返回 HTTP 200，`finish_reason` 为 `stop`，第二个请求的 `translations` 条数与输入一致，只有元素从字符串变成了 `{role,text}` 对象。因此该事故不能用截断、网络或 Provider 错误解释，只能归因于协议形状。

如果将来需要更强的顺序保证，可以在保持纯文本的前提下增加一个可由本地校验的顺序信号，而不必回到 JSON 信封；任何此类改动都应作为新的 ADR 提出。
