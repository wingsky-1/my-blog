# 个人技术笔记

基于 [AstroPaper](https://github.com/satnaing/astro-paper) 与 Astro 的个人技术笔记站点，记录 VPS 运维、Linux、Docker、AI 工具和编程实践。

## 开发

- Node.js 24，pnpm 11
- `pnpm install --frozen-lockfile`
- `pnpm dev`：本地预览
- `pnpm lint && pnpm format:check && pnpm build`：发布前检查

## 内容

文章放在 `src/content/posts/`，使用 Markdown/MDX；关于页面位于 `src/content/pages/about.md`。

## 部署

Cloudflare Pages 已连接 GitHub，生产分支为 `main`，构建命令 `pnpm build`，输出目录为 `dist`。正式站点：[wingsky.ren](https://wingsky.ren/)。域名通过 Cloudflare DNS 托管并绑定到 Pages 项目 `my-blog`；旧域名保留作迁移过渡。

## 安全

PR 必须通过构建、Gitleaks 和高危依赖审计；请勿将 Token、密钥、真实凭据写入文章。详见 [SECURITY.md](SECURITY.md)。

## 上游与许可

博客使用 AstroPaper 模板构建。保留原项目 [LICENSE](LICENSE)，上游变更通过独立分支评估同步。
