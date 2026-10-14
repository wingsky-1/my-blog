# 安全与发布约定

- 所有发布更改通过 Pull Request，经 CI（lint、格式、构建、密钥检查、依赖漏洞扫描）验证后合并。
- 不要在文章、图片、代码块中提交 API Key、Token、SSH 私钥、Cookie 或真实的基础设施凭据。
- 部署环境不需要 Cloudflare API Token：优先使用 Cloudflare Pages 与 GitHub 原生 Git 集成。
- 仅授予 Pages 对本仓库的必要访问权限；不在 PR 工作流中注入生产密钥。
- 建议在 GitHub 仓库 Settings → Rules → Rulesets 中保护 main，要求 CI 检查通过后合并。
- 发现已泄露凭据时立即轮换；删除 Git 历史中的凭据并不能让其失效。
- 依赖安全扫描可能因为上游问题失败；修复或记录例外，不要随意关闭检查。
