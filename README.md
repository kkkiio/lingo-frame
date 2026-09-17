# LingoFrame

[![CI](https://github.com/kkkiio/lingo-frame/actions/workflows/ci.yml/badge.svg)](https://github.com/kkkiio/lingo-frame/actions/workflows/ci.yml)

![LingoFrame 的区域选择器](docs/images/region-picker.png)

LingoFrame 是一款 Chrome 网页区域翻译扩展。点击你想读的文章、评论或讨论，即可在原文下方查看中文译文。

[English](README_en.md) · [三步上手演示](https://kkkiio.github.io/lingo-frame/)

![LingoFrame 的页内双语译文](docs/images/bilingual-result.png)

## Installation

[从 Chrome 应用商店安装 LingoFrame](https://chromewebstore.google.com/detail/lingoframe/keapjhhlniaecddikklclkmbgkllmmmn?hl=zh-CN)，点击“添加至 Chrome”。

安装后，在 Chrome 工具栏的“扩展程序”菜单中固定 LingoFrame，方便随时使用。

## Usage

1. **配置 API Key**：首次点击 LingoFrame 图标会打开设置页。选择 DeepSeek，填入自己的 API Key，点击“保存设置”并允许连接该服务。也可以使用其他兼容 OpenAI 的翻译服务。
2. **点击扩展**：打开想读的网页，点击工具栏里的 LingoFrame 图标，或按 `Alt+Shift+L`。
3. **选中区域**：将鼠标移到想翻译的内容上，点击确认。译文会逐段出现在原文下方；按 `Esc` 可取消选择。

默认翻译为简体中文，也可以在设置中选择其他语言。API Key 是翻译服务提供的访问密钥，需要从对应服务获取；扩展免费，翻译服务可能按用量收费。

Chrome 设置页和应用商店页面无法翻译，请在普通网页上使用。

## Privacy

你选中区域中的文字会直接发送给你选择的翻译服务。API Key 和设置保存在当前浏览器中。

完整的数据处理、权限用途与删除方式请参阅 [Privacy Policy](PRIVACY.md)。

## 致谢

感谢 FluentRead 为 LingoFrame 的翻译流程和双语展示提供了重要的参考基础。
