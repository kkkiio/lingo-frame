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

请求快照保留 `messages[].content` 的字符串类型以及全部 body 字段。JSON 文件中的换行和内层 JSON 使用转义表示；Provider 的 Vitest 快照会将提示词换行直接展示出来。快照不包含请求头或 API Key。

普通测试运行会对比已提交的基线。确认行为变化符合预期后，用 `pnpm test --update` 或 `pnpm e2e --update-snapshots` 更新对应基线，再逐项审阅 Git diff。

## DeepSeek live 测试

在仓库根目录的 `.env` 中配置 `DEEPSEEK_API_KEY`，也可以通过进程环境提供，然后运行：

```bash
pnpm test:live
```

该命令使用项目默认 DeepSeek endpoint、model 和翻译要求，对固定文章执行两轮真实翻译，会消耗 API 额度。缺少密钥时会报错；常规测试和 CI 不运行此用例。

运行结果写入 `test-results/deepseek-live.json`，包括每轮完整请求 body 和逐段原文、真实译文。用例检查返回数量、中文输出及命令保留情况；具体措辞留给人工审阅，不做严格相等的译文快照。每次成功收到两轮响应后覆盖上次记录。

`.env` 和 `test-results/` 均由 Git 忽略。Chromium 测试的失败 trace 存在 `test-results/e2e/`，不会清除 live 结果。
