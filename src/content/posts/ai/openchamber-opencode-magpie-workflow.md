---
title: "Muse 当不了 Codex 主控，我换了 OpenCode"
description: "在 Codex 里折腾子代理，工具能出现，却没法把 Muse 主控这条链路真正跑通。换到 OpenCode 后，我用 OpenChamber 从手机接着干活，Magpie 继续管理模型和额度。"
pubDatetime: 2026-10-20T16:00:00+08:00
tags: ["AI", "OpenChamber", "opencode", "Magpie"]
featured: false
draft: false
---

上一篇[Plus 订阅回本记](/posts/ai/plus-subscription-worth-it/)刚写完，我就把折腾了好一阵子的 Codex 工作流换掉了。

之前想让 Muse 当主控，自己拆任务，再把具体的活交给其他模型。Codex 里我试过先用 Sol 发一句 `hi`，再切到 Muse；也试过 Magpie 的 V1 子代理兼容方式。一度能看到子代理工具，任务传递的问题也有缓解，我还以为快成了。

但继续跑完整的主控派发流程，还是不行。**工具出现在会话里，和 Muse 真能稳定调度子代理，是两回事。** V1 兼容解决的是部分任务怎么交给子代理，不是第三方模型能不能在 Codex 里当主控。这条路我最终确认走不通。

所以没再纠结 Codex 的配置，直接换了 OpenCode。现在的组合是 OpenChamber + OpenCode + Magpie。说不上一步到位，不过 Muse 终于能直接坐在主控位上了。

## 这三个工具，分别干什么

```text
手机 / 电脑
    │
    ▼
OpenChamber       打开项目、管理会话、查看通知
    │
    ▼
OpenCode          Muse 主控、子代理、工具和权限
    │
    ▼
Magpie            模型、账号、额度、路由
    │
    ▼
各个平台的模型
```

**OpenChamber 解决我怎么接着用的问题。** 我主要想在手机上打开一个 Web 页面，就能继续处理服务器上的项目，而不是每次都远程进终端。它负责会话和项目界面，也能看定时任务、接收长任务的通知。Web 入口用固定端口，底下的 OpenCode 实例由它管理，实例端口在启动时分配。

**OpenCode 才是真正负责派活和执行的。** 我这边是 v2.0.32。默认模型、agent、权限、MCP 都在它的配置里管理。比起继续在 Codex 里想办法让第三方模型拿到子代理工具，OpenCode 可以直接让 Muse 当主控。这是我换过来的主要原因。

**Magpie 没换。** 之前接进去的免费额度、订阅和路由组都还在。它对 OpenCode 提供模型接口，谁有额度、请求该走哪个模型、失败后怎么切，都让 Magpie 处理。我这里网关有 35 个模型条目，不过平时不需要把它们全摆出来。

我挺喜欢现在这个分工：OpenChamber 管我怎么操作，OpenCode 管任务怎么执行，Magpie 管模型从哪来。Magpie 网关挂了，依赖它的模型调用当然也会失败，但至少我知道该去查哪一层。

## Muse 当主控，但不让它包办一切

现在我配置了七个 agent，主控是 `build`，默认使用 Muse Spark 1.3。

- `build`：拆任务、分配、整合结果，最后验收，不负责埋头批量改代码。
- `explore`：只读找文件、读代码，使用 `auto/deepseek-v4.1-flash` 的 `#high` 档。
- `worker`：做边界明确的编码任务，使用同一个 DeepSeek 模型的 `#max` 档。
- `general`：处理要一边检索一边修改的杂活，也是 DeepSeek `#max`。
- `reviewer`：只读评审改动，用 `auto/glm-5.3-flash` 的 `#high` 档。
- `spec`：动手前整理中文规格，使用 `auto/step-5-preview` 的 `#medium` 档。
- `oracle`：遇到架构决策、难调试再出场，走 `group/hard` 的 `#max` 档。

七个角色听着有点多，其实思路很朴素：**让主控把活分好，不要让一个模型从需求分析一路写到自我验收。**

我在 `build` 的提示词里要求它把任务分出去，并且收回具体的结果。子代理说「完成了」还不够，要交代改了什么、跑了什么验证、哪里还没处理。遇到问题，再由主控决定是返工还是换人。

Muse Spark 1.3 的上下文在我当前配置里按 1M 设置。它得接住好几个子代理返回的内容，窗口大一些有用；但我不想让它因为窗口大，就把所有执行任务都揽下来。

`reviewer` 和 `worker` 分开也是同一个考虑。让刚写完代码的模型自己说没问题，我总觉得不太踏实。即使用的是便宜模型，只要职责分清，也比全塞给主控省心。

最需要克制的是 `oracle`。它走的 `group/hard` 优先用 `codex/gpt-6.1-sol`，再交给免费模型兜底。有一次我看额度，Sol 的五小时窗口已经用了 88%。查个文件、改段说明就把它叫出来，太浪费了。现在只在普通 agent 处理不了的时候才用。

还有一条：**fallback 只放 Magpie 里。** OpenCode 的 agent 不再写一层，OpenChamber 的相关路由开关也关着。不然模型自动换了两次，我连究竟是谁换的都搞不清楚。

## 换完之后，还踩了三个小坑

### 模型名抄错，白查半天

Magpie 里面的内部名，跟提供给 OpenCode 的模型名不完全一样。

比如内部写 `auto-minimax-m3-1-flash-free`，对外却是 `auto/minimax-m3.1-flash-free`。我直接把前者填进 OpenCode，结果提示模型不存在。排查半天，以为是网关或账号的问题，最后发现只是名字没写对。

后来我都直接从这里复制名字：

```bash
magpie models opencode
```

### 网关有 35 个模型，OpenCode 怎么只看到 8 个

这个也让我误会过。`magpie visible opencode` 当时列出来的是 7 个 family、8 个模型，跟网关里的 35 个条目根本对不上。

其实不是少同步了 27 个。**Magpie 网关里有多少模型，跟哪些模型对 OpenCode 可见，是两个设置。** 想把某个 family 加进列表，需要单独调整可见性，不是只改 OpenCode 的 agent 配置。

```bash
magpie visible opencode
magpie visible opencode <family>
```

后来想想也好。35 个全显示出来，每次选模型还得在列表里翻半天。

### MCP 改了配置，却没生效

我原来的配置混着两种 MCP 写法：一处用 `enabled`，另一处在 `mcp.servers` 里用 `disabled`。Tavily 就这么一边开着、一边关着。

最烦的是它也不报一个显眼的错。直到我跑了：

```bash
opencode mcp list
```

才发现那条连接显示 disabled。以后改完配置，我宁愿多查一次实际状态，也不想光看文件觉得自己已经改对了。

顺手还发现 `sequential-thinking` 仍然连着。以前装 MCP 是觉得多多益善，后来发现主控本来就要拆任务，再塞一套固定思考步骤，未必是帮忙。这项我打算清掉。

## 现在怎么更新、怎么检查

Magpie 的模型和路由我改得比较勤，更新完一般会顺手执行：

```bash
magpie update
magpie daemon restart
magpie library sync
magpie models opencode
opencode mcp list
```

前面更新和同步，后面查实际暴露的模型、MCP 有没有连上。`library sync` 跑完，只能说明配置同步过，不代表 MCP 服务一定正常。

这几条是我当前环境的操作记录，不是三个工具的完整安装教程。OpenChamber 本身有没有正常启动，还得单独看。

## 折腾这一圈，值不值

现在最舒服的地方，是我拿出手机打开 OpenChamber，就能直接用 Muse 新建会话、拆任务、安排子代理。查完代码再修、修完再审，这些步骤不用我一直盯着终端串起来。长任务跑着，我也能先做别的事。

代价当然有。三个工具的配置需要对齐，模型别名、可见性和 MCP 那几处，都实实在在浪费过我的时间。七个 agent 也不是定下来就不改了，用不上的我会继续删。

如果你在 Codex 里只需要 GPT 主控，没碰到我这种问题，可能根本没必要换。**我换栈不是因为 OpenCode 什么都更强，而是因为我就是想让 Muse 直接派活。** 在 Codex 那条路没走通，换过来总算做到了。
