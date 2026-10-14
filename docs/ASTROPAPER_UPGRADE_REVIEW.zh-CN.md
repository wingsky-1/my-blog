# AstroPaper 自定义改动与上游升级评审

> 记录日期：2026-10-14。基于当前仓库源码和 PR #19 检查，不等同于完整的上游差异审计。更新主题前必须重新对照上游 Release 和 Git diff。

## 结论

当前实现整体保留 AstroPaper 的基础框架和静态构建模式，但并非“零侵入主题”。文章页面的 `src/pages/posts/[...slug]/index.astro` 是最主要的上游合并冲突点。建议维持最小编排代码，具体行为放独立组件。

| 位置 | 定制用途 | 侵入程度 | 上游升级时处理 |
|---|---|---|---|
| `astro-paper.config.ts` | 中文站点、域名、分享及编辑开关 | 低 | 对照新版配置 Schema；核对新默认项 |
| `astro.config.ts` | 中文 i18n、Noto Sans SC OG 字体 | 中 | 检查 Astro 字体 API、i18n 路由变更 |
| `src/pages/index.astro` | 中文首页及移除模板宣传 | 中 | 对照上游首页变更，保留本站内容 |
| `src/pages/search.astro` | Pagefind 中文文案 | 低至中 | 检查 Pagefind UI 参数兼容 |
| `src/pages/og.png.ts`、`src/pages/posts/[...slug]/index.png.ts` | 中文 OG 字体 | 中 | 检查 Satori、Astro 字体 API 和图片输出 |
| `src/pages/posts/[...slug]/index.astro` | 插入文章布局、元信息及分享组件 | **高** | 每次升级逐项人工对照，不整文件覆盖 |
| `src/pages/posts/[...slug]/_components/{PostContentLayout,PostMeta,PostToc}.astro` | 自定义布局、阅读时长和目录 | 低（新增独立文件） | 主要确认插槽/标题数据契约 |
| `src/pages/posts/[...slug]/_components/ShareLinks.astro` | SVG 社交分享 | 中 | 已替换原实现；与上游变化比对 |
| `src/styles/typography.css` | 去除 h3 斜体 | 低 | 优先考虑新增独立覆盖样式，减少修改上游规则 |
| `src/utils/getReadingStats.ts` | 生成阅读统计 | 低（新增文件） | 处理 Markdown/MDX 正文解析及统计准确性 |
| `src/content/posts/**`、`src/content/pages/about.md` | 本站内容 | 低 | 不从上游覆盖 |
| `pnpm-workspace.yaml`、`pnpm-lock.yaml` | 漏洞修复 override | 中 | 优先恢复上游兼容修复，审视 override 是否还能删除 |
| `.github/workflows/**` | CI、安全扫描、构建检查 | 中 | 不直接套上游 Actions；每次独立审查 permissions 与第三方 Action SHA |
| `src/content.config.ts` | 文章 Schema | 当前未为分类魔改 | 保持标签方案，避免新增不必要的 category 字段 |

## 已采取的低侵入设计

1. 文章页保留原来的 `PostLayout`、Markdown 渲染、OG、文章标签与分页导航。
2. 使用 `render(post).headings` 构建目录，不新增目录数据库或依赖。
3. 将宽屏/移动端布局、元信息、目录拆成独立 Astro 组件，仅在文章路由中接入。
4. 手机端采用原生 `details/summary`，桌面侧栏通过 CSS 布局控制，避免全局 JS 状态。
5. 分享复用项目原有 X、Telegram SVG；不增加新的图标依赖，避免与主题 UI 样式脱节。
6. 博客仍使用 Astro 静态构建 + Pagefind，避免引入额外服务端基础设施。

## 仍存在的改进事项和风险

- 文章路由本身仍由本站定制；未来 AstroPaper 改动 OG、文章日期、分页、路由时，需要人工比对。
- 阅读时长目前是近似估算；Markdown 中代码块、链接以及 MDX 自定义组件的处理需要补更完整的单元测试。
- 文章正文依旧维持合理阅读宽度，超宽屏不会将单行文本无限拉长；目录与正文需分别检查 1280、1440、1920、手机断点。
- Pagefind 搜索索引、Sitemap、RSS 的中文效果需要在真实文章发布后持续验证。
- OG 图片在中文标题较长时需视觉验收，不能以构建成功替代。
- PostCSS selector parser 目前使用 pnpm override 解决安全告警；后续上游解除旧版依赖后应移除 override。
- 从模板初始化删除了部分原作者维护文档和演示资源；主题升级时不要无选择地复制回来。

## 建议的上游升级 SOP

1. 记录当前 AstroPaper 基线版本和上游 Git tag、更新日志，检查安全公告与 breaking changes。
2. 新建 `chore/upgrade-astropaper-<version>` 分支或 PR，逐文件对比而不是覆盖项目。
3. 优先升级无冲突的工具链、CSS 和配置；逐项合并文章路由、OG、搜索等定制文件。
4. 运行 `pnpm install --frozen-lockfile`、`pnpm lint`、`pnpm format:check`、`pnpm build`、`pnpm audit --audit-level high`。
5. 在 Cloudflare Preview 实际打开中文文章页，验证 375/768/1280/1440/1920 宽度、TOC、图标分享、文章标签、搜索与 OG。
6. 确认不增加意外的 GitHub Actions 写权限和生产密钥泄漏风险，再审核合并。
7. 以“能够解释每个定制补丁的必要性”为升级评审目标；若上游已经提供同等功能，优先考虑删除自定义实现。

**重要：** 本文件是后续 Agent 的审查清单，不是自动升级指令；禁止未经人工审批自动合并升级 PR。
