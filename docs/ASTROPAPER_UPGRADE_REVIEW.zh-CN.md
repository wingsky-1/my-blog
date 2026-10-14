# AstroPaper 本站定制、响应式架构与上游升级维护

> 更新日期：2026-10-14。项目：`wingsky-1/my-blog`。当前工作分支：`feat/site-responsive-layout`，PR：[#20](https://github.com/wingsky-1/my-blog/pull/20)。
>
> 状态约束：本文描述 PR #19 已合并的定制与 PR #20 分支上的改动；PR #20 尚未获站长视觉验收，不表示其内容已经进入 `main`。不能将 CI/部署成功等同于所有屏幕的交互验收成功。

## 1. 基线、目标与原则

- 原主题：AstroPaper v6.1 模板；项目采用 Astro 7、Tailwind CSS v4、Markdown/MDX、Pagefind 和 Cloudflare Pages 静态部署。
- 保留：文章路由、日期与标签、分页、SEO/Canonical/OG/JSON-LD、RSS、Sitemap、Pagefind、明暗主题、GitHub Actions、Gitleaks、依赖审计。
- 目标：全站维持 AstroPaper 的窄栏阅读理念；宽屏时文章标题、元信息、正文与底部组件共享阅读轴，右侧 TOC 占独立网格轨道；小屏 TOC 随时可访问。
- 优先独立组件与 CSS Token；不修改 `node_modules`、不引入 UI 框架或新的服务端基础设施；升级时逐文件人工比对，不整体覆盖本站源码。

## 2. 当前实施架构

### 2.1 普通页面及站点框架

上游 `app-layout` 继续使用 `max-w-3xl`，首页、归档、搜索、标签等普通页面，以及 Header、Footer、Breadcrumb、Main 继续依赖这一共享容器。**本次没有将整站文字内容无差别拉宽**。

### 2.2 文章页

`src/styles/site-layout.css` 定义 `--blog-reading-width`、`--blog-post-shell-width`、`--blog-page-gutter` 等站点级规则。文章使用 `post-page-shell` 和 `post-page-grid`。在 1280px 以上采用三轨 Grid，中央阅读列保持约 720px，右侧目录占独立轨道，不再通过 `left: 50%`、`translateX()` 等方式修补定位。标题、元信息、正文、标签、分享和相邻文章导航共用同一阅读列。

目录来自 `render(post).headings`：H2/H3 导航，桌面 Sticky、当前章节提示；窄屏使用固定在右下角的目录触发器与原生 `dialog`。原主题返回顶部控件在文章窄屏通过本站 CSS 定向移动到左下角，避免与目录重叠。**此行为只对文章页面且宽度小于 1280px 生效，不更改上游 `BackToTopButton.astro`。**

### 2.3 首页与页尾

首页 Hero 增加弱化的小字“虽然也没有什么技术含量。”，是本站文本偏好。页尾版权、Astro、AstroPaper、Cloudflare Pages 署名集成于同一个弹性排版区域；宽度不足允许自然换行，原有社交链接保留。不引入额外依赖。

## 3. 定制文件台账：以升级冲突而非代码行数判断侵入

| 文件 | 来源与用途 | 上游冲突风险 | 升级处理 |
| --- | --- | --- | --- |
| `astro-paper.config.ts` | 本站站点信息、中文、编辑开关 | 低 | 比对新版配置字段及默认值 |
| `astro.config.ts` | i18n / OG 字体等项目配置 | 中 | 检查 Astro API、字体与路由语义 |
| `src/styles/global.css` | 上游文件，PR #20 增加本站 CSS 导入 | 低至中 | 保留一次 `site-layout.css` 导入，检查 Tailwind 层叠顺序 |
| `src/styles/site-layout.css` | **本站新增**，阅读列、Grid、窄屏导航位置 | 低 | 尽量独立保留；检查断点、浏览器兼容及控件间距 |
| `src/pages/posts/[...slug]/index.astro` | **上游原文件重组，最高风险** | **高** | 人工逐段合并，保证静态路由、OG、SEO、标题与文章组件接入 |
| `src/pages/posts/[...slug]/_components/PostContentLayout.astro` | 本站新增 Grid 封装 | 低 | 检查 slot、`headings` 传递契约 |
| `src/pages/posts/[...slug]/_components/PostToc.astro` | 本站新增桌面与移动目录交互 | 低至中 | 验证 ClientRouter 生命周期、焦点、锚点、高亮与安全区域 |
| `src/pages/posts/[...slug]/_components/PostMeta.astro` | 本站新增阅读统计展示 | 低 | 日期、字词与阅读时长保持响应式换行 |
| `src/utils/getReadingStats.ts` | 本站新增近似阅读统计 | 低 | 补充复杂 MDX/代码块测试 |
| `src/components/Footer.astro` | 上游同路径，合并署名至版权行 | **中** | 比对上游 Footer 差异；保持社交区、版权及 HTML 属性 |
| `src/pages/index.astro` | 中文首页及个性化文案 | 中 | 优先保留本站内容，人工吸收上游结构改进 |
| `src/pages/search.astro` | Pagefind 中文 UI | 低至中 | 检查 Pagefind API 与语言配置 |
| `src/pages/og.png.ts`、`src/pages/posts/[...slug]/index.png.ts` | 中文 OG 图片字体 | 中 | 检查 Astro/Satori/字体 API，实际渲染中文长标题 |
| `src/pages/posts/[...slug]/_components/ShareLinks.astro` | 本站 X/Telegram/复制/系统分享 | 中 | 保留官方 X 图标语义，测试 Web Share API |
| `src/styles/typography.css` | 正文细节调整，包括 h3 样式 | 低至中 | 优先迁往本站独立样式，避免全局选择器变化 |
| `pnpm-workspace.yaml` 与 lockfile | 安全依赖 override | 中 | 上游修复后评估能否去除 override |
| `.github/workflows/**` | 构建、安全扫描与审计 | 中 | 保持最小权限，禁止用上游 workflow 整体覆盖 |
| `src/content/posts/**`、`src/content/pages/**` | 本站内容 | 低 | 永不以主题更新覆盖文章 |
| `docs/ASTROPAPER_UPGRADE_REVIEW.zh-CN.md` | 本站升级维护台账 | 无上游同文件冲突 | 每次升级整合更新，避免附加过期流水账 |

### 直接修改上游文件的必要性

- **不可完全避免**：文章路由原本负责数据获取、SEO 元信息及文章编排，需要最小接入 `PostContentLayout`；这仍是本次最主要的上游合并冲突面。
- **有限且易恢复**：`global.css` 只提供独立 CSS 入口，`Footer.astro` 只做简短技术署名，`index.astro` 属本站首页文本。
- **已隔离**：PostToc、PostContentLayout 和 site-layout.css 均属于本站定制，不应因为每次 AstroPaper 升级就整体重写。
- **刻意不触碰**：`Layout.astro`、`PostLayout.astro`、`Header.astro`、`Main.astro`、`BackToTopButton.astro` 等上游核心文件。

Footer 合并冲突风险是**中低规模的人工处理成本**：它属于上游同路径文件，理论上可能冲突，但改动只在尾部版权容器，不需要为消除一处小补丁而过度设计可配置 Footer 框架。如上游以后重做 Footer，可将署名抽为本站单独组件再接入。

## 4. 响应式、可访问性与潜在问题

- 小于 1280px：文章单列，目录按钮固定右下角，原站返回顶部按钮用页面限定 CSS 定位在左下角；两者不再依赖不同的 bottom 数值硬编码避让。
- 大于等于 1280px：正文位于居中 Grid 轨道，右侧 TOC 独立 Sticky；切换点必须检查页面跳动和长标题布局。
- `dialog`：需验证 Esc、焦点返回、点击锚点关闭及 Safari 行为；目录必须确保无重复 ID 和隐藏焦点问题。
- `ClientRouter`：切换页面时检查目录脚本与阅读进度条的重复初始化、事件监听清理。
- `data-pagefind-ignore`：目录内容不参与文章搜索索引；正文仍能搜索。
- 图片、表格、代码块：测试横向溢出，不使用 transform 修补阅读列。
- 暗色主题、安全区域、触控尺寸及 reduced-motion 都应验证；CI 通过不等于这些已由浏览器实测。

## 5. 上游跟踪与 Issue 评估

AstroPaper 上游仓库：https://github.com/satnaing/astro-paper

相关已有 Issue：https://github.com/satnaing/astro-paper/issues/542 ，主题正是改善文章 TOC 与阅读位置提示。维护者曾讨论 absolute + sticky 原型及双目录/默认简洁性的取舍。建议先在该 Issue 交流，**不要另开重复 Issue，未经作者确认不要发帖**。固定 720px 阅读列、中文文案和页尾署名属于个人定制，不应作为上游缺陷提交。

## 6. 升级标准流程（SOP）

1. 记录当前 `main`、AstroPaper 上游 Release/Tag SHA、依赖版本、最新安全公告；读取本表中高/中风险文件。
2. 创建 `chore/upgrade-astropaper-<version>` 分支，仅在该分支逐项合并上游；**禁止直接覆盖项目文件或改 main**。
3. 优先应用依赖更新与上游 bugfix；随后手工处理文章路由、首页文案、Footer、中文 OG/Search，确保 `site-layout.css` 等新增文件完整保留。
4. 如上游有等效 TOC 或扩展点，评估替换并移除本站补丁，不能叠两套目录。
5. 执行 `pnpm install --frozen-lockfile`、`pnpm lint`、`pnpm format:check`、`pnpm build`、`pnpm audit --audit-level high`，并核对 Gitleaks 与 Actions 权限。
6. 用 Cloudflare Preview 验证文章 URL 200、SEO、中文 OG、Pagefind、RSS/Sitemap、标签、分享和所有交互。
7. 检查 375、390、768、1024、1280、1440、1920、2560px 下 Header/Footer、文章、TOC、浮动按钮互不覆盖，暗色主题和键盘可用。
8. 在 PR 中列出可删除的历史补丁、仍需保留的侵入点、失败与修复记录；站长视觉验收并明确同意后方可合并。

## 7. PR #20 验证与交付状态

- 已实施：集中式文章布局、TOC 桌面/移动行为、首页小字、同行版权与技术署名、窄屏导航角落分离。
- 已有阶段性结果：此前提交的 CI、Security 与 Cloudflare Pages 预览已成功；**之后的新提交仍需重新核对最新状态，不得沿用旧结论**。
- 待站长验收：完整多分辨率截图、真实 Safari/Chrome 键盘与触控验证、最终外观。不得在未验收时合入。
- 后续单独文章 PR：参照 Library 草稿，仅在上述改动最终合并/验收后撰写真实复盘，并由站长确认发布。

**维护原则：升级时争取删除不再必要的补丁，而不是一边追上游一边累计更多条件覆盖。**
