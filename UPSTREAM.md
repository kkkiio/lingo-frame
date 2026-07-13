# Upstream and acknowledgements

LingoFrame is a focused GPL-3.0 browser extension derived from the translation workflow and bilingual in-page presentation of [FluentRead](https://github.com/Bistutu/FluentRead). The implementation was developed against FluentRead commit `ab1be13b31b9aaa874eb7e7d5ac652d722ba649a`, which is licensed under GPL-3.0.

The full-page, hover, selection, queue, cache, floating-ball, and multi-provider breadth of FluentRead was intentionally narrowed to one product flow: select one DOM region and translate the readable text inside it. LingoFrame keeps the same core bilingual presentation model—preserve the source text and append its translation beneath it—while using a Region Picker as the entry interaction.

The following files carry the adapted FluentRead behavior and include source-level modification notices dated 2026-07-13:

| FluentRead source | LingoFrame file | Adaptation |
| --- | --- | --- |
| `entrypoints/main/dom.ts` | `src/content/region/scan-region.ts` | Limits traversal to one selected Region and assigns stable Translation Units and interleaved Translation Slots. |
| `entrypoints/main/trans.ts` | `src/content/region/translation-session.ts` | Keeps bilingual loading and failure semantics while translating the Region through one LLM Session. |
| `entrypoints/style.css` | `src/content/region/translation.css` | Keeps FluentRead's default block, inherited-color, bold bilingual presentation under LingoFrame-scoped class names. |

The Region Picker implementation was informed by the public designs of the following projects. Their source trees are not vendored into this repository.

- [Selector Forge](https://github.com/Intuned/selector-forge), commit `d83a01d2e4dfa7987f73c952f683801988247e44` (MIT)
- [uBlock Origin](https://github.com/gorhill/uBlock), commit `697b2f1099a97f7ffb5bf1ccd346822509f51527` (GPL-3.0-or-later)
- [MCP Pointer](https://github.com/etsd-tech/mcp-pointer), commit `59601d17ed63176e994f82d20558c386272cad4f` (MIT)
- [Project VisBug](https://github.com/GoogleChromeLabs/ProjectVisBug), commit `382ecff58dec46b5e1c21e9d1801c4a58afda599` (Apache-2.0)
- [React Grab](https://github.com/aidenybai/react-grab), commit `c7c019855ab271bca31c26ea0111bc09e92afa8c` (MIT)

LingoFrame itself is distributed under the [GNU General Public License version 3](LICENSE).
