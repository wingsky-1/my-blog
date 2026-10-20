---
title: "把 Muse 扶上主控位：OpenChamber + opencode + magpie 三件套"
description: "上一篇的遗憾是 Muse 只能当执行层，这篇换一套栈把它扶上主控：OpenChamber 管控制面、opencode v2.0.32 管执行面、magpie 管供给面，七个 agent 各就各位，以及三处配置必须对齐的代价。"
pubDatetime: 2026-10-20T16:00:00+08:00
tags: ["AI", "OpenChamber", "opencode", "Magpie"]
featured: false
draft: false
---

上一篇写完，留了个尾巴：Muse 的量那么大，却只能当执行层，主控还得是 GPT。理由很硬——Codex 侧的 multi-agent 能力字段不向第三方模型开放，magpie 二进制里写死的设计也是"A GPT lead spawns subagents"。配置改不动，那就换栈。

这篇记录换完之后的样子：OpenChamber + opencode + magpie，三个组件各管一层，Muse 坐在主控位上派活。哪些真跑通了，哪些是坑，分开讲。

## 三件套，各管一层

原来的困惑是把所有事都塞给一个网关。现在按职责切开，谁的事谁管，坏了好定位：

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

**控制面是 OpenChamber。** 它是个跑在固定端口上的 Web 服务，底下托管一个 opencode 实例。手机上打开页面就能新建会话、翻历史、看定时任务、往项目里塞长期备忘，长任务跑完能收到通知。对我这种经常不在电脑前的人，这一层解决的是"人在哪"的问题，不是"模型多强"的问题。

**执行面是 opencode。** 它才是我真正天天用的东西：`model` 定默认模型，`agents` 定每个子代理是谁，`permissions` 定谁能动文件谁能跑命令，`mcp` 定挂哪些外部工具。派发纪律全写在 `agents` 段里，纯文本，改完立即生效，不用重启谁。

**供给面是 magpie。** 它是个本地网关，把各家的订阅、免费额度、按量密钥拼成一个个路由组，对上游只暴露一个 OpenAI 兼容接口。网关现在挂着 35 个模型条目，其中只有一小部分露给 opencode——这个"露多少"后面会变成一个坑。

三层之间只有一条依赖：opencode 的 provider 指向 magpie 的本地地址。OpenChamber 不碰模型选择，magpie 也不知道会话长什么样。任何一层单独挂掉，另外两层还能用。

## 升级顺序是有讲究的

三层各自独立更新，但顺序不能乱。我固定按这四步走：

```bash
magpie update                  # 装新二进制
magpie daemon restart          # 让网关用新版本起来
magpie library sync            # 把新的指令/MCP/Skill 写进 opencode 配置
opencode mcp list              # 确认 MCP 真的拉起来了
```

前两步是供给面，后两步才是执行面。反过来的话，opencode 会拿一份新旧混合的配置去连旧网关，症状是模型名对得上、能力对不上，查起来很费时间。最后一步 `mcp list` 不是走过场——`library sync` 写进去的是配置，服务起没起来是另一回事，这一步就是验收。

## 主控怎么派发

这是整套东西的核心。`~/.config/opencode/opencode.jsonc` 的 `agents` 段定义了七个角色，主控是 `build`，它的 system prompt 第一句就是"你是派发主控，你的活是进度控制，不是批量执行"。

拆开说每个角色的分工和选型理由：

| agent    | 干什么                   | 模型                                |
| -------- | ------------------------ | ----------------------------------- |
| build    | 拆任务、派发、合并、验收 | 继承默认，Muse Spark 1.3            |
| explore  | 只读检索，找文件读代码   | `auto/deepseek-v4.1-flash` #high    |
| worker   | 单个编码子任务，能并行   | `auto/deepseek-v4.1-flash` #max     |
| general  | 检索加修改都有的杂活     | `auto/minimax-m3.1-flash-free` #max |
| reviewer | 只读评审，按严重度报问题 | `auto/glm-5.3-flash` #high          |
| spec     | 写中文规格，先规格后动工 | `auto/step-5-preview` #medium       |
| oracle   | 架构、硬调试、跨切面决策 | `group/hard` #max                   |

几个选型上的判断：

**主控不挑最贵的，挑上下文大的。** Muse Spark 1.3 给到 1M 窗口，缓存命中率高，`build` 自己不动手，token 消耗主要在读子代理的返回值上。长窗口让它可以同时盯好几个子任务而不丢上下文。

**worker 要的是输出长度，不是聪明程度。** `auto/deepseek-v4.1-flash` 的 output 上限是 384K，一个子任务从头写到尾不用中途续。给 #max 档是因为重复劳动里推理深度换不来质量，但写长了会截断。

**general 走免费池兜底。** `auto/minimax-m3.1-flash-free` 走的是 magpie 的智能路由，在两个免费来源之间挑，实测零扣费。杂活不配用付费额度。

**oracle 是唯一可能碰到付费模型的口子。** `group/hard` 是条顺序链：`codex/gpt-6.1-sol` 打头，后面挂着免费组兜底。Sol 的额度我盯着呢——5 小时窗口实测打满过 100%，7 天窗口摸到过 74%，现在刚重置到 12%。所以 oracle 的 description 写得很死：架构决策、硬调试、便宜组摆不平的事才许叫它，日常一律不许。付费模型的余量是留给真难题的，不是留给手滑的。

**兜底在 magpie 层，不在 opencode 层。** 这是特意这么设计的。opencode 的 `agents` 段没有任何 fallback 数组，模型选错了就是选错了，立刻报错，不静默降级。降级、熔断、按配额绕行全交给 magpie 的路由组——它有每个池子的实时用量和重置时间，比 opencode 更清楚该往哪跳。OpenChamber 自己也有个 fallback 配置项，我留着但关着，同一个理由：兜底应该只有一层。

## 踩过的坑

**最大的坑：magpie 的别名和网关真名不是一回事。** magpie 内部用短横线命名，`auto-minimax-m3-1-flash-free`；网关对外暴露的是 `auto/minimax-m3.1-flash-free`，斜杠加圆点。这两套名字长得像，指的东西也对得上，但不能混着用。我把内部名直接粘到 opencode 的 model 字段里，网关回一句模型不存在，排查了半天才发现是命名空间串了。**凡是写进 opencode 配置的，一律以 `magpie models opencode` 的输出为准，不从命令行输出里抄。**

**第二个坑：visible 是显示层，不是网关全量。** `magpie visible opencode` 现在显示"8 个可见，27 个不可见"，而网关实打实挂着 35 个条目。也就是说，opencode 的模型列表只反映 magpie 愿不愿意给你看，不代表网关没有。想要一个被藏起来的模型，得显式 `magpie visible opencode <family>` 加回来，改 opencode 配置是没用的。这个区分一开始没搞清，白折腾了一圈。

**第三个坑：MCP 有两处声明位置，开关字段还不一样。** opencode 的配置里，顶层 `mcp` 用 `enabled` 开关，`mcp.servers` 用 `disabled` 开关，同一个 tavily 在两处各有一份，一份开一份关。改错地方不报错，只是不生效。另外 `sequential-thinking` 这类"替模型规定思考步骤"的 MCP，对主控是负资产——Muse 自己的规划已经够用，硬塞一套固定步骤反而打乱派发节奏。我在主控侧是关掉它的，但配置里这条目前还挂着 `enabled: true`，属于待清理的残留，不是最终状态。

## 得与失

拿到的东西很直接：**手机上新建一个会话，主控就是 Muse。** 通勤路上想到什么直接开个会话派活，回家看结果，不用开电脑。子代理并行让"调研三个方案再动手"这种事从半小时压缩到几分钟。长任务跑完手机收通知，不用盯着屏幕。

代价是三处配置必须对齐，缺一处就出怪毛病：

1. **模型名**——opencode 里写的必须是网关真名，不能用 magpie 内部别名。
2. **档位**——`#high` `#max` 这些 variant 是 opencode 层的概念，模型不在 opencode 里声明这个档位，写了不生效。
3. **可见性**——magpie 的 visible 决定 opencode 的模型列表里有什么，和网关全量是两回事。

三处分散在两个工具、一个配置文件加一个网关里，没有单一事实来源。这是这套架构目前最不舒服的地方，也是我下次改配置时第一个要回头查的地方。

要不要抄，看你在哪办公。主力在电脑前、偶尔用一下 AI 的，Codex 那套照样够用，没必要折腾三层。但如果你经常在手机上续上没干完的活，或者手里一堆免费额度不知道怎么调度，这套换过去是值得的。
