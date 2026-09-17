# LingoFrame

[![CI](https://github.com/kkkiio/lingo-frame/actions/workflows/ci.yml/badge.svg)](https://github.com/kkkiio/lingo-frame/actions/workflows/ci.yml)

![Select a webpage region with LingoFrame](docs/images/region-picker.png)

LingoFrame is a Chrome extension for translating a selected part of a webpage. Choose an article, comment, or discussion and read the translation right below the original text.

[简体中文](README.md) · [Three-step demo (Chinese)](https://kkkiio.github.io/lingo-frame/)

![Read original text and Chinese translations together](docs/images/bilingual-result.png)

## Installation

[Install LingoFrame from the Chrome Web Store](https://chromewebstore.google.com/detail/lingoframe/keapjhhlniaecddikklclkmbgkllmmmn?hl=en) by clicking **Add to Chrome**.

Pin LingoFrame in Chrome's Extensions menu so it is easy to reach from the toolbar.

## Usage

1. **Set up your API key.** Click the LingoFrame icon to open settings on first use. Choose DeepSeek, enter your own API key, save your settings, and allow the connection to that service. Other OpenAI-compatible services are also supported.
2. **Click the extension.** Open a webpage you want to read and click the LingoFrame toolbar icon, or press `Alt+Shift+L`.
3. **Select a region.** Point to the content you want to translate and click. Translations appear below the original text. Press `Esc` to cancel selection.

The default translation target is Simplified Chinese; choose another language in settings. Obtain your API key from your translation provider. The extension is free, but the provider may charge for API usage.

Use LingoFrame on regular webpages. Chrome settings and Chrome Web Store pages cannot be translated.

## Privacy

Text in the region you select is sent directly to your chosen translation service. Your API key and settings are stored in your current browser.

See the [Privacy Policy](PRIVACY.md) for data handling and deletion details.

## Acknowledgments

Thanks to [FluentRead](https://github.com/FluentRead/FluentRead) for its translation workflow and bilingual reading experience, which provided an important foundation for LingoFrame.
