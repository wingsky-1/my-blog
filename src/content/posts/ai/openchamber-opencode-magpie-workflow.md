---
title: "我把 Muse 放上了主控位：OpenChamber + OpenCode + Magpie"
description: "Codex 里用 Sol 起手加 V1 子代理已经能跑，但我不想每次新建会话都先发一句 hi。于是换到 OpenCode，让 Muse 直接派活，OpenChamber 管手机入口，Magpie 继续管模型和额度。"
pubDatetime: 2026-10-20T16:00:00+08:00
tags: ["AI", "OpenChamber", "opencode", "Magpie"]
featured: false
draft: false
---

上一篇[Plus 订阅回本记](/posts/ai/plus-subscription-worth-it/)刚写完，我又把主控换了。

倒不是 Codex 那套不能用。**新会话先用 Sol 发一句 `hi`，再切到 Muse，配合 Magpie 的 V1 子代理兼容方式，我已经跑通过。** 只是每次新建会话都要先走这一步，多少有点别扭。尤其我经常拿手机继续电脑上没做完的事，打开就想派任务，不想先给 GPT 打个招呼。

所以这次没继续研究怎么绕 Codex 的限制，而是换到 OpenCode。Magpie 没丢，之前接好的模型和额度也没白折腾。

现在我从手机打开 OpenChamber，新建会话，主控就是 Muse。它负责拆任务、派活、收结果，具体干活的还是其他模型。

## 为什么是这三个

我最后留下的是三层，没再往里面塞第四个调度器：

```text
手机 / 电脑
    │
    ▼
OpenChamber        会话、项目、通知、定时任务
    │
    ▼
OpenCode v2.0.32   Muse 主控、子代理、工具权限
    │
    ▼
Magpie             账号、模型路由、额度、故障切换
    │
    ▼
各个平台的模型
```

**[OpenChamber](https://github.com/openchamber/openchamber) 是我用来操作的界面。** Web 入口用固定端口，底下的 OpenCode 服务由它管理，端口可以在启动时分配。手机上能看会话、接着提要求，长任务结束也能收到通知。它省掉的是我为了一个任务还得打开电脑的麻烦。

**[OpenCode](https://github.com/anomalyco/opencode) 才是真正干活的。** 选哪个主控、能叫哪些子代理、谁可以修改文件、哪些 MCP 工具能用，都由它管。我当前用的是 v2.0.32，配置主要放在 `~/.config/opencode/opencode.jsonc`。相比给 Codex 新会话做「Sol 起手」的操作，这里直接选 Muse 当主控就行。

**[Magpie](https://github.com/yetone/magpie) 还是老本行。** 它把不同平台的账号、免费额度和订阅放在同一个本地网关里，再给 OpenCode 提供模型。现在我的网关里有 35 个模型条目，但没必要把 35 个都摆进 OpenCode 的菜单。

这一套也不是完全没依赖。OpenCode 用到 Magpie 路由的模型时，网关停了，请求就会失败。但界面、任务调度、模型供给各管一块，比三处同时设置 fallback 容易排查得多。

## Muse 负责派活，别让它把活全干了

我在 OpenCode 里留了七个角色。看着不少，其实常用的就几个：

| 角色 | 负责什么 | 我现在配的模型 |
| --- | --- | --- |
| `build` | 主控，拆任务、派发、整合、验收 | Muse Spark 1.3 |
| `explore` | 只读找文件、查代码 | `auto/deepseek-v4.1-flash#high` |
| `worker` | 边界明确的编码任务 | `auto/deepseek-v4.1-flash#max` |
| `general` | 边查边改的杂活 | `auto/deepseek-v4.1-flash#max` |
| `reviewer` | 只读检查改动，报告问题 | `auto/glm-5.3-flash#high` |
| `spec` | 动手前整理中文规格 | `auto/step-5-preview#medium` |
| `oracle` | 架构决策、疑难问题兜底 | `group/hard#max` |

`build` 没有单独写死 `model`，用的是会话选中的默认模型，现在就是 Muse。它的提示词里我写得很直白：**自己负责拆分、跟进和验收，能交出去的执行任务就别亲自动手。** 子代理也不能只回来一句「已完成」，要说改了什么、验证了什么，还有什么问题。

Muse Spark 1.3 在我当前配置里给了 1M 上下文。这对主控挺有用：同时派出去几个任务，回来一堆检索结果和改动说明，不至于太快把对话挤满。但窗口大不等于它适合亲手写所有代码，所以 `worker` 和 `general` 仍交给 DeepSeek。

`reviewer` 我故意和 `worker` 分开。写代码的模型自己说没问题，我一般不太放心；换个角色只读检查，至少能让它从另一种角度挑毛病。`spec` 则负责把模糊需求先变成能验收的文字，省得几个子代理各自理解一套。

最舍不得乱用的是 `oracle`。它背后的 `group/hard` 优先走 `codex/gpt-6.1-sol`，后面才是免费模型兜底。有次查额度，Sol 的五小时窗口已经用了 88%，所以我把它限定在架构、难调试和便宜模型处理不了的任务上。日常找文件、整理文档，没必要动它。

还有个我现在坚持的做法：**fallback 只放在 Magpie 一层。** OpenCode 的 agent 不再各写一套降级，OpenChamber 里对应的路由开关也关着。否则任务明明换了模型，我却不知道是哪层替我做的决定。

## 真正烦人的，是配置对不上

换栈之后没再卡在子代理工具上，倒是被几个看起来很小的配置问题耽误了时间。

### 模型名字有两套

Magpie 路由组里用的是内部名字，比如 `auto-minimax-m3-1-flash-free`；OpenCode 要填的是网关暴露出来的 `auto/minimax-m3.1-flash-free`。

我一开始直接复制了内部名，结果 OpenCode 报模型不存在。不是账号失效，也不是路由没启动，就只是名字不对。

现在改 agent 前，我先看：

```bash
magpie models opencode
```

从输出里抄对外模型名，不从 Magpie 的内部路由配置里猜。

### 网关有模型，不等于 OpenCode 列表里有

当时 Magpie 网关里有 35 个模型条目，`magpie visible opencode` 列出来的却只有 7 个 family、8 个模型。

我起初以为同步失败了，后来才明白，**网关全量和给 OpenCode 显示的模型是两回事**。可见性名单没选中的模型，不会因为我手动在 agent 里写了名字就自动出现在选择菜单。

```bash
magpie visible opencode
magpie visible opencode <family>
```

第一条查看，第二条是我需要某个 family 时再显式调整。平常用不到的模型继续藏着，菜单反而清爽。

### OpenCode V1 和 V2 的 MCP 配置别混着抄

这个坑更隐蔽。我配置里留着两种写法：旧式 `mcp.<name>.enabled` 和 V2 的 `mcp.servers.<name>.disabled`。同一个 Tavily，在一处看着启用，另一处却是关闭的。

我当时盯着配置看了半天，最后还是 `opencode mcp list` 一眼看出了 disabled。现在用 V2，就按 [V2 MCP 文档](https://dev.opencode.ai/v2/docs/mcp-servers/) 整理 `mcp.servers`，不再拿旧版示例混着改。

顺带还发现 `sequential-thinking` 仍然是 connected。以前觉得 MCP 多一点总没坏处，现在反而想删掉不必要的：主控已经在拆任务了，再塞一套固定思考步骤，对我这套派发方式没什么帮助。

## 更新完，顺手验一下

三件套里我最常动的是 Magpie 的模型和路由。改完不靠猜，通常顺手跑一遍：

```bash
magpie update
magpie daemon restart
magpie library sync
magpie models opencode
opencode mcp list
```

`library sync` 负责把 Magpie 管的指令、MCP 和 Skill 同步到客户端配置；但配置写进去不等于服务真的连上。最后的 `mcp list` 是为了看连接状态。我的自定义 agent 配置也会顺手检查一下，免得同步后只顾看模型列表。

这不是让人照抄的通用安装教程，只是我现在修改这套环境后的验收习惯。OpenChamber 本身的更新、服务状态另看，不混在这几条里。

## 换完之后值不值

最明显的变化，不是模型突然聪明了，而是**手机上打开会话就能开始干活**。不用先发一句 `hi`，也不用在 GPT 主控和 Muse 之间切来切去。像先找代码、再拆修复、最后看评审这种活，主控能把几段任务分出去，我只需要在关键地方做决定。

当然也没到开箱即用的程度。光是模型别名、可见性和 MCP 新旧配置，就够折腾一轮。七个角色也不是越多越好，真发现哪个长期没必要，我会直接删。

如果主要在电脑上用 Codex，之前 Sol 起手加 V1 子代理的办法仍然能用，不一定值得专门换栈。但对我来说，少一步手工切模型，加上手机上能随时接着跑项目，比再多接十几个免费模型有用得多。
