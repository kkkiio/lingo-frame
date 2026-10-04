# 测试与请求审阅

`pnpm check` 运行类型检查、离线单元测试和生产构建。`pnpm e2e` 加载真实 Chromium 扩展，通过本地 HTTP 服务测试页面交互和翻译请求。这两组测试不调用付费模型。

## 审阅快照

| 文件 | 审阅内容 |
| --- | --- |
| [`scan-region.test.ts.snap`](../tests/__snapshots__/scan-region.test.ts.snap) | 按扫描顺序排列的原文、语义角色和章节起点；案例输入在测试文件及 `tests/fixtures/region-scanning/` |
| [`translation-session.test.ts.snap`](../tests/__snapshots__/translation-session.test.ts.snap) | 文本如何分片、分批 |
| [`provider.test.ts.snap`](../tests/__snapshots__/provider.test.ts.snap) | DeepSeek 与 OpenAI-compatible 的完整请求 body，包括默认及自定义翻译要求 |
| [`inline-code-request.json`](../e2e/__snapshots__/inline-code-request.json) | Chromium 扩展发送到本地 HTTP 服务的单轮请求 body |
| [`multi-turn-requests.json`](../e2e/__snapshots__/multi-turn-requests.json) | 按发送顺序保存的两轮请求，包含完整历史对话 |

请求快照保留 `messages[].content` 的字符串类型以及全部 body 字段。按 [ADR-0003](./adr/0003-plain-text-segment-protocol.md)，`content` 是纯文本 Segment 消息，不再包含内层 JSON；JSON 快照中的换行使用 `\n` 转义表示，Provider 的 Vitest 快照会将提示词换行直接展示出来。快照不包含请求头或 API Key。

普通测试运行会对比已提交的基线。确认行为变化符合预期后，用 `pnpm test --update` 或 `pnpm e2e --update-snapshots` 更新对应基线，再逐项审阅 Git diff。

## DeepSeek live 测试

在仓库根目录的 `.env` 中配置 `DEEPSEEK_API_KEY`，也可以通过进程环境提供，然后运行：

```bash
pnpm test:live
```

该命令使用项目默认 DeepSeek endpoint、model 和翻译要求，对固定文章执行两轮真实翻译，会消耗 API 额度。缺少密钥时会报错；常规测试和 CI 不运行此用例。

运行结果写入 `test-results/deepseek-live.json`，包括每轮完整请求 body 和逐段原文、真实译文。用例检查返回数量、中文输出及命令保留情况；具体措辞留给人工审阅，不做严格相等的译文快照。每次成功收到两轮响应后覆盖上次记录。

现有 live evals 共三组：

| 用例 | 检查内容 | 结果文件 |
| --- | --- | --- |
| `tests/live/deepseek.live.ts` | 两轮上下文中的中文输出和行内命令保留 | `test-results/deepseek-live.json` |
| `tests/live/markdown.live.ts` | 纯文本、原 URL Markdown、本地链接引用 Markdown 的两轮对照，以及嵌套格式、命令、数字和链接恢复 | `test-results/markdown-comparison.json` |
| `tests/live/unit-protocol.live.ts` | food-culture 多行 Unit 单独翻译及三 Unit 合批，检查数量、内容锚点、顺序和段落覆盖 | `test-results/unit-protocol-live.json` |

最后一组使用用户报告的实际失败原文，通过生产 scanner、serializer 和 provider 验证统一 `[[TRANSLATE]]` 协议。原始请求和响应不包含凭据；失败时也保留已收到的响应。精确 marker 次数、换行保真和具体语义需要审阅响应，数量校验成功不代表模型完全遵守协议。这些用例没有自动重试，也没有整体翻译质量评分或统计成功率；受限 HTML 尚未加入对照。

`.env` 和 `test-results/` 均由 Git 忽略。Chromium 测试的失败 trace 存在 `test-results/e2e/`，不会清除 live 结果。
