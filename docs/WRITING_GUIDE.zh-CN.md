# 个人技术博客：写作、预览与发布指南

> 仓库：<https://github.com/wingsky-1/my-blog>  
> 正式地址：<https://blog.唐意.top/>（以 Cloudflare 自定义域名状态 active 为准）  
> 技术栈：AstroPaper / Astro 7 / Markdown / MDX / pnpm / Cloudflare Pages

## 1. 文章保存在哪里？

所有文章统一放在 `src/content/posts/`。支持 `.md` 和 `.mdx` 文件，可以按主题划分目录，例如：

```text
src/content/posts/
├── linux/
│   └── ubuntu-docker-compose.md
├── network/
│   └── headscale-home-lan.md
└── ai/
    └── codex-workflow.md
```

文件名建议用小写英文、连字符，稳定、易分享；标题和正文使用简体中文。不需要手动维护文章列表，Astro Content Collections 会自动收录。

## 2. 文章最小模板

复制为 `src/content/posts/linux/ubuntu-docker-compose.md`：

```markdown
---
title: "Ubuntu 上使用 Docker Compose 的实践"
description: "记录 Docker Compose 部署、检查与常见问题排查。"
pubDatetime: 2026-10-14T20:00:00+08:00
modDatetime: 2026-10-14T20:00:00+08:00
tags: ["Linux", "Docker", "运维"]
featured: false
draft: false
---

## 背景

简要说明场景、环境与目标。

## 操作步骤

```bash
docker compose up -d
docker compose ps
```

## 验证

列出验证命令、预期输出及故障排查。

## 总结

记录取舍、坑点与参考链接。
```

**字段说明**

| 字段 | 是否必需 | 说明 |
| --- | --- | --- |
| `title` | 是 | 文章标题 |
| `description` | 是 | SEO 与列表摘要 |
| `pubDatetime` | 是 | 发表时间，建议显式写 `+08:00` |
| `modDatetime` | 否 | 更新时间 |
| `tags` | 否 | 标签数组，建议 2–4 个 |
| `featured` | 否 | 是否首页精选 |
| `draft` | 否 | 为 `true` 时不公开发布 |
| `ogImage` | 否 | 文章分享图片（默认由主题处理） |
| `author` | 否 | 缺省使用站点作者 |
| `canonicalURL` | 否 | 重发文章的规范原文地址 |

如未编写首篇文章，首页和归档为空属于正常现象。

## 3. 图片、代码和链接

建议将文章插图放在 `src/assets/images/`（方便 Astro 图片优化），或将静态文件放在 `public/images/`（直接用绝对路径访问）。例子：

```md
![网络拓扑图](/images/headscale-topology.png)

[GitHub 仓库](https://github.com/wingsky-1/my-blog)
```

复杂技术笔记优先使用 Markdown 表格、代码围栏以及清晰的章节标题；切勿贴出真实 Token、SSH 私钥、云主机密码、用户数据和实际内网敏感配置。必要时使用 `example.com` 与伪造 IP/Token。

## 4. 本地开发（Windows 11 / WSL / macOS / Linux）

要求 Node.js 24 和 pnpm 11：

```bash
git clone https://github.com/wingsky-1/my-blog.git
cd my-blog
corepack enable
pnpm install --frozen-lockfile
pnpm dev
```

用终端打印的本地 URL 预览。发布前运行：

```bash
pnpm lint
pnpm format:check
pnpm build
pnpm audit --audit-level high
```

`pnpm build` 会生成静态页面与 Pagefind 搜索索引；构建成功后再提交。

## 5. GitHub 网页直接写文章（适合 iPhone / iPad）

1. 打开仓库 `src/content/posts/`，点击 **Add file → Create new file**。
2. 使用带路径的文件名，如 `linux/ubuntu-docker-compose.md`，粘贴上述 Frontmatter 与正文。
3. 选择 **Create a new branch for this commit and start a pull request**，不要直接推送受保护的 `main`。
4. 创建 PR 后等待 GitHub Actions 的代码检查、安全审计和 Cloudflare Pages Preview。
5. 打开 Preview URL 检查标题、目录、代码、图片和手机排版；通过后 **Squash and merge**。
6. Cloudflare Pages 自动部署 `main`；发布后检查正式地址、RSS 和搜索索引。

**提示：** 单纯修改 Markdown 内容也要走 PR，可保证构建和链接错误在发布前暴露。

## 6. 命令行发布

```bash
git checkout main
git pull --ff-only
git switch -c post/docker-compose-notes
# 在 src/content/posts/ 下新增文章并完成验证
git add src/content/posts
git commit -m "docs(post): add Docker Compose notes"
git push -u origin post/docker-compose-notes
```

然后在 GitHub 网页创建 PR，等待所有 Required Checks 通过后合并。

## 7. 修改“关于”与站点信息

- 关于页面：`src/content/pages/about.md`
- 站点标题、描述、作者、语言、时区、社交链接：`astro-paper.config.ts`
- Astro 的路由语言列表：`astro.config.ts`
- Favicon：`public/favicon.svg`
- 分享封面：`public/default-og.jpg`
- CI：`.github/workflows/ci.yml`、`.github/workflows/security.yml`
- Dependabot：`.github/dependabot.yml`

如以后更换域名，请同步更新 `astro-paper.config.ts` 中的 `site.url` 并验证 RSS、Sitemap、Canonical 和分享链接。

## 8. 发布检查清单

- [ ] 没有真实密码、密钥、个人隐私或内网敏感信息
- [ ] 文件名/文章 slug 稳定，不随意更改已发布链接
- [ ] Frontmatter 必需字段齐全
- [ ] 代码片段可复现，图片链接正常
- [ ] CI / Gitleaks / Dependency Audit 通过
- [ ] Cloudflare Preview 通过，移动端正常
- [ ] 合并后正式网址可访问，搜索、RSS、Sitemap 正常

## 9. 维护策略

**不要直接同步上游主题 main 覆盖自己的博客。** 每次升级先创建 PR，审查 Astro、MDX、Shiki 和依赖锁文件的兼容性，等待 GitHub Checks 与 Pages Preview 通过后再合并。Dependabot 的多个 PR 可能重复更新同一条依赖链，要逐个比较，避免批量盲目合并。
