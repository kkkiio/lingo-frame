# LingoFrame Privacy Policy

Effective date: July 13, 2026

LingoFrame is a Chrome extension that translates readable text inside a webpage region explicitly selected by the user. This policy explains what data LingoFrame handles, why it is needed, where it goes, and how users can remove it.

## Data LingoFrame handles

LingoFrame handles the following data only to provide its region translation feature:

- **Selected website content.** After the user activates LingoFrame and confirms a Region, the extension reads the readable text inside that Region. Depending on what the user selects, this content may include website content, user-generated content, or personal communications.
- **Provider credentials and configuration.** The extension stores the API Key, API Base URL, model name, selected provider, and target language entered by the user.
- **Connection-test content.** When the user chooses `Test connection`, LingoFrame sends the fixed text `Hello` to the configured provider to verify that the endpoint is usable.

LingoFrame does not retain browsing history, visited URLs, advertising identifiers, analytics events, or the translated Region content after the translation request completes.

## How data is used and shared

Selected Region text is sent directly from the extension's trusted background context to the translation provider configured by the user. The API Key is sent to that provider in the request authorization header. LingoFrame's developer does not operate an intermediary translation server and does not receive the selected text, API Key, translation response, or provider configuration.

The configured provider processes requests under its own terms and privacy policy. Users should choose a provider they trust and review that provider's data-retention practices before sending sensitive content.

LingoFrame uses handled data only to provide or improve its user-facing translation functionality. It does not sell data, use data for advertising or credit decisions, create user profiles, or allow humans to read user data.

## Local storage and retention

Provider credentials and preferences are stored in `chrome.storage.local` within the user's Chrome profile. Storage access is restricted to trusted extension contexts, so content scripts and webpage scripts cannot read the API Key.

The settings remain until the user changes them, clears the extension's stored data, or uninstalls LingoFrame. Translation requests are held only in memory while active and are released when they complete, fail, time out, or are cancelled. A selected provider may retain request data according to its own policy.

## Network security

Remote provider endpoints must use HTTPS. Plain HTTP is accepted only for loopback addresses (`localhost`, `127.0.0.1`, and `[::1]`) so users can connect to a model service running on the same device.

## Chrome permissions

- `activeTab` grants temporary access to the current tab after the user invokes LingoFrame.
- `scripting` injects the Region Picker and bilingual presentation code into that active tab.
- `storage` stores provider credentials and translation preferences locally.
- Optional host permissions allow translation requests only after the user grants access to the configured provider origin.

## User controls

Users choose when LingoFrame runs, which Region is translated, and which provider receives the selected text. Users can cancel Region selection, replace or remove provider credentials, revoke site access from Chrome's extension settings, clear extension storage, or uninstall LingoFrame at any time.

## Changes to this policy

Material changes to LingoFrame's data practices will be reflected in this policy and disclosed in the extension or Chrome Web Store listing before the changed practices take effect.

## Contact

Questions or concerns about this policy can be submitted through the [LingoFrame issue tracker](https://github.com/kkkiio/lingo-frame/issues).

---

# LingoFrame 隐私政策

生效日期：2026 年 7 月 13 日

LingoFrame 是一款 Chrome 扩展，用于翻译用户明确选择的网页 Region 中的可读文字。本政策说明 LingoFrame 会处理哪些数据、处理目的、数据去向以及用户如何删除这些数据。

## LingoFrame 处理的数据

LingoFrame 仅为提供区域翻译功能处理以下数据：

- **用户选择的网页内容。** 用户启动 LingoFrame 并确认 Region 后，扩展读取该 Region 内的可读文字。根据用户选择的内容，其中可能包含网页内容、用户生成内容或个人通信内容。
- **Provider 凭据与配置。** 扩展存储用户填写的 API Key、API Base URL、模型名称、所选 Provider 和目标语言。
- **连接测试内容。** 用户点击 `Test connection` 时，LingoFrame 会把固定文本 `Hello` 发送给配置的 Provider，以验证端点是否可用。

LingoFrame 不会保留浏览历史、访问过的 URL、广告标识符、分析事件，也不会在翻译请求结束后保留所选 Region 的内容。

## 数据的使用和共享

所选 Region 的文字由扩展可信 background 上下文直接发送给用户配置的翻译 Provider。API Key 会通过请求授权头发送给该 Provider。LingoFrame 开发者没有运营中转翻译服务器，也不会收到所选文字、API Key、翻译响应或 Provider 配置。

Provider 会依据其自身条款与隐私政策处理请求。用户应选择可信的 Provider，并在发送敏感内容前了解其数据保留规则。

LingoFrame 只会为提供或改进用户可见的翻译功能使用这些数据，不会出售数据、将数据用于广告或信贷决策、创建用户画像，也不会允许人工阅读用户数据。

## 本地存储和保留期限

Provider 凭据和偏好设置保存在当前 Chrome profile 的 `chrome.storage.local` 中。存储访问权限仅限扩展可信上下文，content script 和页面脚本无法读取 API Key。

设置会一直保留到用户修改设置、清除扩展存储或卸载 LingoFrame。翻译请求只在请求进行期间保存在内存中，并在完成、失败、超时或取消后释放。Provider 可能依据其自身政策保留请求数据。

## 网络安全

远程 Provider 端点必须使用 HTTPS。只有回环地址（`localhost`、`127.0.0.1` 和 `[::1]`）可以使用 HTTP，以支持用户连接同一设备上运行的模型服务。

## Chrome 权限

- `activeTab` 在用户主动调用 LingoFrame 后临时访问当前标签页。
- `scripting` 将 Region Picker 和双语展示代码注入当前标签页。
- `storage` 在本地保存 Provider 凭据和翻译偏好。
- Optional host permissions 只在用户授权配置的 Provider Origin 后允许发送翻译请求。

## 用户控制

用户决定何时运行 LingoFrame、翻译哪个 Region，以及由哪个 Provider 接收所选文字。用户可以取消 Region 选择、替换或移除 Provider 凭据、在 Chrome 扩展设置中撤销站点权限、清除扩展存储或随时卸载 LingoFrame。

## 政策变更

如果 LingoFrame 的数据处理方式发生实质变化，本政策将同步更新，并会在新的处理方式生效前通过扩展界面或 Chrome Web Store 页面进行披露。

## 联系方式

如对本政策有疑问或意见，请通过 [LingoFrame issue tracker](https://github.com/kkkiio/lingo-frame/issues) 联系。
