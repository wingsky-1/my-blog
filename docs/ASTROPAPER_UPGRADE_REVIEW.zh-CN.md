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


## PR1 响应式布局优化记录（待 CI / 视觉验收）

实施分支：`feat/site-responsive-layout`。此部分记录的是提交内容，不表示已经通过浏览器视觉验收。

- 新增 `src/styles/site-layout.css`，定义本站阅读宽度、文章外框与目录列的局部变量，不改变上游 `app-layout` 的 768px 语义；Header、Footer、普通页、SEO 基础 Layout 不修改。
- `src/styles/global.css` 增加一次独立样式导入，属于必要且容易重新应用的上游接入补丁。
- `src/pages/posts/[...slug]/index.astro` 将标题、元信息、正文、标签、分享和上下篇统一放入 `PostContentLayout` 阅读列；这是需要在上游升级时人工合并的主要冲突文件。
- `PostContentLayout.astro` 删除 `left:50%` 和 `transform`，采用三轨 Grid：中间保持阅读列居中，右侧独立 TOC；窄屏退化为单栏。
- `PostToc.astro` 使用 Astro 渲染的标题数组，桌面端简洁 sticky 目录，移动端固定触发器与原生 dialog；脚本用动画帧节流跟踪当前章节，并处理页面路由变更时的监听清理。
- 目录有 H2 时才出现；H3 可显示缩进。保留页面内容索引，目录自身添加 `data-pagefind-ignore`。
- 风险与尚待验证：移动触发按钮与 BackToTop 的空间关系；多页面 View Transition 后 TOC 生命周期；不同标题密度的活动章节判断；Safari dialog、安全区域和 1280px 临界布局；主站 SEO/RSS/OG/Pagefind 回归测试。
- 上游参考 Issue：<https://github.com/satnaing/astro-paper/issues/542>。不重复创建 Issue，视觉验收后再决定是否向现有讨论补充方案。

### 验收前禁止合并

须确认 GitHub CI、Gitleaks、安全审计及 Cloudflare Pages Preview，使用实际预览测试 375、390、768、1024、1280、1440、1920、2560px。另验证中文文章 200、标签、搜索索引、RSS、Sitemap、OG、日夜模式、键盘和 Escape 焦点返回。本站作者明确批准前不能合入 main。

## PR #20 补充：页尾署名及升级冲突台账

本次 PR 新增页尾技术署名：Astro（https://astro.build/）、AstroPaper（https://github.com/satnaing/astro-paper）、Cloudflare Pages（https://pages.cloudflare.com/）。使用可点击文字链接，没有引入 JS 或依赖。

| 文件 | 对上游侵入性 | 修改与升级注意事项 |
| --- | --- | --- |
| `src/styles/global.css` | 低至中（原文件新增导入） | 保留原版 `app-layout`，只导入 `site-layout.css`；升级时检查 Tailwind v4 @import 顺序 |
| `src/styles/site-layout.css` | 低（本站新增） | 所有宽屏 Grid、宽度 Token 集中维护；检查 Tailwind 与浏览器对 `min()` / `dvh` 支持 |
| `src/pages/posts/[...slug]/index.astro` | 高（原路由结构调整） | 优先人工合并上游新 SEO、OG、文章渲染、导航；禁止整文件覆盖，保留 `render(post).headings` 契约 |
| `src/pages/posts/[...slug]/_components/PostContentLayout.astro` | 低（本站组件） | 三轨 Grid 中央保持阅读列，右侧预留 TOC；升级后核对页面组件插槽行为 |
| `src/pages/posts/[...slug]/_components/PostToc.astro` | 低（本站组件） | H2/H3 标题数据、`dialog` 可访问性、视图切换脚本解绑、移动入口与返回顶部按钮位置需要回归 |
| `src/components/Footer.astro` | 中（上游同路径文件） | 增加技术署名链接；以后若上游重构 Footer，优先提取本站署名为独立组件再接入，不应覆写上游版权和社交功能 |
| `docs/ASTROPAPER_UPGRADE_REVIEW.zh-CN.md` | 低（本站维护文档） | 每次升级继续记录新文件差异和已移除补丁 |

### 升级时需要重点回归的新增行为

- Astro ClientRouter 页面切换：TOC 脚本初始化、事件释放、原生 `dialog` 关闭与焦点恢复，不得重复监听。
- 移动端：目录浮动入口与原版 BackToTop 的相对位置，特别是宽度 375px/390px、安全区、暗色主题。
- 桌面端：1280px 断点、Sticky 滚动区域、活动章节高亮；在 1024/1440/1920/2560px 比对正文视觉中心。
- 全站：Footer 署名换行、外链、横向滚动条；搜索、标签、归档、文章分页、Pagefind、SEO、OG、RSS、Sitemap。
- 工程：pnpm lint、format:check、build、audit 与 Gitleaks；Cloudflare Preview 必须实际打开文章检查。

状态约束：以上是实施台账，不代表浏览器截图或全量验收已经完成；此 PR 在站长明确批准前保持不合并。
