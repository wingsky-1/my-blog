# 中文技术笔记：文章分类与标签规范

当前 AstroPaper 仅有原生 **tags** 系统，没有独立的 `category` Frontmatter 字段。为减少上游修改，第一阶段采用「目录组织 + 受控标签」方案，不增加第二套分类路由。

## 目录分类

推荐一级目录，采用英文小写、连字符。目录组织不一定直接显示为前台分类菜单，前台仍使用标签页。

| 目录 | 内容边界 | 主标签 |
| --- | --- | --- |
| `vps/` | VPS、Cloudflare、Caddy、公网部署 | `VPS` |
| `linux/` | Linux、Docker、服务管理、存储 | `Linux` |
| `network/` | Headscale、Tailscale、WireGuard、DNS | `网络` |
| `ai/` | Codex、Agent、MCP、模型和工具链 | `AI` |
| `dev/` | 前后端、脚本、测试、工程实践 | `开发` |

示例：`src/content/posts/network/headscale-subnet-router.md`。

## 标签设计

- 每篇建议 **2–5 个标签**，一个领域标签 + 1–4 个具体技术或场景标签。
- 领域标签优先使用：`VPS`、`Linux`、`网络`、`AI`、`开发`。
- 技术标签统一书写：`Docker`、`Cloudflare`、`Caddy`、`Headscale`、`Tailscale`、`WireGuard`、`Codex`、`GitHub Actions`、`Astro`、`Python`。
- 避免近义重复：例如不要同时创建「CF」与「Cloudflare」、「容器」与「Docker」来表示同一技术。
- 不用「随笔」「其他」「教程」作为每篇的默认标签；确有需求再使用。
- 既有文章的 slug 不要因改目录/标签随意变更，否则需配置重定向。

## 建议的文章 Frontmatter

```yaml
---
title: "Headscale 家庭子网路由实践"
description: "梳理 Tailscale 子网路由、192.168.31.0/24 路由配置及故障排查。"
pubDatetime: 2026-10-14T20:00:00+08:00
tags: ["网络", "Headscale", "Tailscale"]
featured: false
draft: false
---
```

## 搜索验收

当前博客基于 Pagefind 构建时索引，支持中文网页的语言识别；无正文文章时，仅能检查索引文件存在，**不能断言中文查询效果已通过**。

发出第一篇正式中文文章后执行验收：
1. 在正式搜索页输入文章标题中的连续中文词，如「子网路由」，确认命中标题。
2. 输入英文关键词 `Headscale`、`Docker`，确认命中中英混排正文。
3. 输入技术短语「192.168.31」检查匹配，但不将 IP 分词结果当作强保证。
4. 检查搜索结果不包含 `draft: true` 的草稿。
5. 检查移动端输入框、清空按钮和结果链接可用。

重要：中文搜索具体分词和召回率取决于 Pagefind 版本与实际文本，不保证任意单字都能命中。文章题名、描述、正文建议采用自然的完整中文词组。
