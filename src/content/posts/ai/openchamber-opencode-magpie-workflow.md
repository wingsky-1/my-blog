---
title: "把 Muse 扶上主控位：OpenChamber + opencode + magpie 三件套"
description: "上一篇的遗憾是 Muse 只能当执行层，这篇换一套栈把它扶上主控：OpenChamber 管控制面、opencode v2.0.32 管执行面、magpie 管供给面，七个 agent 各就各位，以及三处配置必须对齐的代价。"
pubDatetime: 2026-10-20T16:00:00+08:00
tags: ["AI", "OpenChamber", "opencode", "Magpie"]
featured: false
draft: false
---

上一篇的结尾留了个尾巴：Muse 的量那么大，却只能当执行层，主控还得是 GPT。原因当时也写清楚了——Codex 的 multi-agent 字段不向第三方模型开放，magpie 二进制里的设计就是「A GPT lead spawns subagents」。这条路在配置层面堵死，我最后选了换栈。

换完之后的组合是 OpenChamber + opencode + magpie，三层各管一件事，Muse 坐在主控位派活。下面写清楚哪些真跑通了，哪些还在将就。

## 三件套，各管一层

这三层不是一次定下来的，但边界划清之后很好解释：谁的事谁管，坏了好定位。

```text
OpenChamber   控制面   Web UI（固定端口）+ 托管一个 opencode 实例（端口启动时分配）
                        会话编排 · 定时任务 · 项目知识 · 结果呈现
                          │
opencode      执行面   v2.0.32
                        model · agents · permissions · mcp
                          │
magpie        供给面   本地网关，35 个模型条目
                        路由组 · 权重 · 配额 · 密钥 · Skill 内容
```

**控制面是 OpenChamber。** Web 服务跑在固定端口上，底下托管一个 opencode 实例，实例端口由它启动时分配。手机上打开页面就能新建会话、翻历史、看定时任务，也能往项目里塞长期备忘，长任务跑完会推通知。我经常不在电脑前，这一层解决的是「人在哪」的问题，不是「模型多强」的问题。

**执行面是 opencode。** 我天天真正打交道的其实是它：`model` 定默认模型，`agents` 定每个子代理是谁、带什么档位，`permissions` 定谁能改文件谁能跑命令，`mcp` 定挂哪些外部工具。派发纪律全写在 `agents` 段里，纯文本，改起来直观。

**供给面是 magpie。** 它是个本地网关，把各家的订阅、免费额度、按量密钥拼成一个个路由组，对上只暴露一个 OpenAI 兼容接口。网关现在挂着 35 个模型条目，露给 opencode 的只是一小部分——这个「露多少」后面会变成一个坑。

三层之间只有一条硬依赖：opencode 的 provider 指向 magpie 的本地地址。OpenChamber 日常不碰模型选择，magpie 也不知道会话长什么样。所以换掉其中任何一层，另外两层都不用重装；但要说清楚，magpie 停了 opencode 就只能看历史、干不了活，这个方向是单向的。

## 升级顺序有讲究

三层各自独立更新，但我固定按这个顺序走：

```bash
magpie update                  # 装新二进制
magpie daemon restart          # 让网关用新版本起来
magpie library sync            # 把新的指令/MCP/Skill 写进 opencode 配置
opencode mcp list              # 确认 MCP 真的拉起来了
```

四条都在本机 shell 里执行，前提是 magpie 和 opencode 都在 PATH 里。前两条更新供给面，第三条把指令、MCP 和 Skill 写进 opencode 配置，最后一条才是验收。

顺序反过来会难受：opencode 拿着一份半新半旧的配置去连旧网关，模型名可能对得上，行为对不上，排查时很容易怀疑错方向。`mcp list` 那一步也不是走过场——`library sync` 只保证配置写进去了，服务有没有起来是另一回事。输出里 `✓` 后面跟着 `connected` 才算连上，`○` 是没启用。

## 主控怎么派发

这套东西的核心在 `~/.config/opencode/opencode.jsonc` 的 `agents` 段：七个角色，主控是 `build`。它的 description 写的是 Dispatcher master，管拆分、派发、合并、验收；system prompt 第一句就要求：只做进度控制，不做批量执行，要证据，不接受含糊的返回。

| agent    | 干什么                       | 模型                                       |
| -------- | ---------------------------- | ------------------------------------------ |
| build    | 拆任务、派发、合并、验收     | 不写 model，继承顶层默认（Muse Spark 1.3） |
| explore  | 只读检索，找文件、读代码     | `auto/deepseek-v4.1-flash` #high           |
| worker   | 单个编码子任务，可以并行     | `auto/deepseek-v4.1-flash` #max            |
| general  | 检索和修改混在一起的整段杂活 | `auto/deepseek-v4.1-flash` #max            |
| reviewer | 只读评审，按严重度报问题     | `auto/glm-5.3-flash` #high                 |
| spec     | 先写中文规格再动工           | `auto/step-5-preview` #medium              |
| oracle   | 架构、硬调试、跨切面决策     | `group/hard` #max                          |

几个选型上的判断：

**主控不挑最贵的，挑窗口大的。** Muse Spark 1.3 的上下文是 1M，`build` 自己不动手，token 大头在读子代理的返回值上，窗口够大才装得下几个并行任务的全部结论。

**worker 要的是输出长度，不是聪明程度。** deepseek 的 output 上限是 384K，一个子任务从头写到尾不用中途续写。给 #max 是因为重复劳动里推理深度换不来质量，但写长了会截断，余量得留够。

**general 和 worker 用同一个模型，区别在工具面和任务形状。** worker 接的是边界清楚的编码块，general 接的是检索加修改混在一起的整段活。为后者单挑一个更弱的模型省不下多少，反而多一套要维护的脾气。

**reviewer 和 spec 都放在中等成本档。** 一个只读挑错，一个只写规格，产出都短，不需要长输出，也用不上顶配推理。

**oracle 是唯一可能碰到付费模型的口子。** `group/hard` 是条顺序链：`codex/gpt-6.1-sol` 打头，后面挂着 `auto/minimax-m3.1-flash-free` 兜底。Sol 的额度我用 `magpie accounts codex` 盯着，写这篇时它显示 5 小时窗口已经用到 88%，7 天窗口 14%，两个窗口都会被打满。所以 oracle 的 description 写得很死：架构决策、硬调试、便宜组摆不平的事才许叫它，日常一律不许。付费模型的余量是留给真难题的，不是留给手滑的。

**兜底只有一层。** opencode 的 `agents` 段里我没写任何 fallback，模型选错了就是选错了，立刻报错，不静默降级。降级、熔断、按配额绕行全交给 magpie 的路由组，它有每个池子的实时用量和重置时间，比 opencode 更清楚该往哪跳。OpenChamber 里也有一份 fallback 配置，路由那个总开关我关着，理由一样：兜底叠两层，出问题时你分不清是谁接的手。

## 踩过的坑

**别名和网关真名不是一回事。** magpie 内部用短横线命名，`group/hard` 里那条兜底写作 `auto-minimax-m3-1-flash-free`；网关对外暴露的名字是 `auto/minimax-m3.1-flash-free`，斜杠加圆点。两套名字指同一个东西，但不能混着用。我把内部名直接粘进 opencode 的 model 字段，网关回一句模型不存在，排查了半天才发现是命名空间串了。现在写进 opencode 配置的名字，一律从 `magpie models opencode` 的输出里复制，不从别处抄。

**visible 是显示层，不是网关全量。** `magpie visible opencode` 会先列出 opencode 能看到哪些 family，我这边是 7 个 family、8 个模型；而网关实打实挂着 35 个条目，剩下 27 个没露面。这 27 个的构成命令里也写了：25 个「kept from opencode」，被 magpie 留着但不属于任何已选中的 family；另外 2 个是从 opencode 的列表里拿掉的。想要一个被藏起来的模型，得显式 `magpie visible opencode <family>` 加回来，改 opencode 配置是没用的。这个区分一开始没搞清，白折腾了一圈。

**MCP 有两处声明位置，开关字段还不一样。** opencode 的配置里，顶层 `mcp` 用 `enabled` 开关，`mcp.servers` 用 `disabled` 开关，同一个 tavily 在两处各有一份，一份开一份关。改错地方不报错，只是不生效——`opencode mcp list` 里它就是一行 disabled。另外 `sequential-thinking` 这类「替模型规定思考步骤」的 MCP，对主控是负资产：Muse 自己的规划已经够用，硬塞一套固定步骤反而打乱派发节奏。这条现在还是 `enabled: true`，`mcp list` 里也是 connected，属于待清理的残留，不是最终状态。

## 得与失

拿到的东西很直接：**手机上新建一个会话，主控就是 Muse。** 通勤路上想到什么直接开个会话派活，回家看结果，不用先开电脑。子代理并行之后，「调研三个方案再动手」这类活不用自己一项项串行做，等的时间基本就是最长的那条分支。长任务结束手机收通知，不用守着屏幕。

代价是三处配置必须对齐，缺一处就出怪毛病：

1. **模型名**——opencode 里写的必须是网关真名，不能用 magpie 内部别名。
2. **档位**——`#high` `#max` 这些 variant 由 opencode 的 provider 模型声明，网关那边不认这个写法。
3. **可见性**——magpie 的 visible 决定 opencode 的模型列表里有什么，和网关全量是两回事。

三处分散在两个工具、一个配置文件加一个网关里，没有单一事实来源。下次改配置，我会先从网关的模型列表查起，再对另外两处。

要不要抄，看你在哪办公。主力在电脑前、只是偶尔用一下 AI 的，Codex 那套照样够用，没必要为多一层控制面折腾三个组件。但如果你经常在手机上续没干完的活，或者手里攒了一堆免费额度不知道怎么调度，这套换过去是值得的——至少主控终于是我想用的那个模型。
