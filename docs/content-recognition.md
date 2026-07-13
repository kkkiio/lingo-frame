# 内容识别范围

LingoFrame 翻译用户明确选择的 Region，并将扫描范围严格限制在该 DOM 根节点内。识别结果取决于页面的内容结构和选中的元素，不依赖网站域名。

## 可以识别的内容

- 标题、段落、列表项、引用、表格单元格和图片说明等语义块；
- 聊天消息、评论、卡片等由普通容器承载的可读文字；
- 用户直接选择的行内文字或叶子容器；
- 以 `<br>` 分隔的多段内容，以及文本节点中保留的换行；
- 用户直接选择的纯文本 `<pre>`，适用于借助预格式化元素排版自然语言正文的页面。

原文中的链接、强调和其他行内标记会合并进所属 Translation Unit。译文会插入到对应原文之后，形成 Bilingual Content。

## 主动跳过的内容

- 脚本、样式、模板、表单控件、iframe、SVG 和 canvas；
- 隐藏、透明、`aria-hidden` 或仅供屏幕阅读器使用的内容；
- 可编辑区域、`.notranslate` 内容、扩展自身 UI 和已经翻译的内容；
- 更大 Region 内部的 `<code>` 与 `<pre>` 代码块；
- 直接选择的 `<pre><code>…</code></pre>` 代码块。

直接选择纯文本 `<pre>` 是一项明确的用户意图。选择包含该元素的上层文章或页面容器时，LingoFrame 仍会跳过 `<pre>`，避免把普通代码块发送给翻译 Provider。

## 已验证案例

| 页面结构 | 选择的 Region | 预期结果 | 回归案例 |
| --- | --- | --- | --- |
| 语义化文章 | `<article>` | 标题和段落分别形成 Translation Unit | `tests/scan-region.test.ts` |
| 评论或聊天容器 | 外层容器 | 每条叶子消息形成 Translation Unit | `tests/scan-region.test.ts` |
| `<br>` 分隔内容 | 文本容器 | 按硬换行交错插入译文 | `tests/scan-region.test.ts` |
| 自然语言存放在 `<pre>` | 直接选择 `<pre>` | 形成一个文本 Translation Unit | [`prose--preformatted-article.html`](../tests/fixtures/region-scanning/prose--preformatted-article.html) |
| 文章中包含代码块 | 外层文章 | 保留正文并跳过代码块 | `tests/scan-region.test.ts` |

`prose--preformatted-article.html` 来自 [antirez 文章页](https://antirez.com/news/169) 的精简结构。该页面在 2026-07-13 被验证为使用 `<pre>` 承载自然语言正文。

## 页面边界

Chrome 内部页面、Chrome Web Store 等受保护页面不允许扩展注入。跨域 iframe、关闭的 Shadow Root、图片中的文字以及 canvas 绘制的文字无法作为当前页面的 Region 扫描。

当选中区域没有产生 Translation Unit 时，LingoFrame 会显示 `No readable text found in this region`。报告识别问题时，请提供页面 URL、选中区域的截图、相关 DOM 片段和预期内容；请勿包含 API Key 或其他凭据。
