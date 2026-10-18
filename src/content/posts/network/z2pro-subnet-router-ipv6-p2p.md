---
title: "极空间 Z2Pro 子网路由实践：部署、验证与排障"
description: "极空间 NAS 充当 Tailnet 与家庭 LAN 的子网路由：从实际 Docker Compose、.env 和 Headscale 路由批准，到连通性验证、Netstack 取舍与 P2P 检查。"
pubDatetime: 2026-10-18T19:05:00+08:00
tags: ["网络", "Linux", "Tailscale", "Headscale", "Docker"]
featured: false
draft: false
---

家里有 NAS、开发机、部署机，还有一些不方便装 Tailscale 的设备。我希望手机出门以后，依然能用原来的局域网地址访问它们，但不想把每台设备的管理端口都开放到公网。

和 ChatGPT 讨论家庭网络分工时，我们比较过让开发机、部署机兼职子网路由，以及交给独立低功耗设备这几种办法。最后选择了本来就在家庭 LAN 里、长期在线、支持 Docker 的**极空间 Z2Pro**。这样部署机更新或重启，也不用顺带中断远程回家的路径。

这篇主要讲 NAS 在拓扑中扮演什么角色、怎样用极空间的容器管理界面部署、怎样验证它确实能路由。至于复杂的内核和运营商排障，我只记录亲历的现象与判断方法，不写成一套需要照搬的修复脚本。

如果还没看过手机上的整体方案，可以先读上一篇：[手机只用一个 VPN，同时搞定海外代理和家庭异地组网](/posts/network/one-vpn-proxy-and-home-mesh/)。

## 先看身份：NAS 是子网路由，不是家庭主路由

![NAS 将 Tailnet 与未安装 Tailscale 的家庭设备连接起来，但不负责互联网默认出口](/images/network/nas-subnet-router-role.svg)

这几个角色很容易混淆：

- **Tailnet 节点**：NAS 运行 Tailscale 并注册到 Headscale，先获得自己的组网身份。加入 Tailnet 不代表远端手机能直接访问整个家庭 LAN。
- **子网路由（Subnet Router）**：NAS 额外发布一段家庭网段；经 Headscale 批准、手机接受路由后，远端才可以通过 NAS 访问该网段内没有安装 Tailscale 的设备。这才是本文的目标。
- **出口节点（Exit Node）**：接管其他设备的默认互联网流量。我并没有让 NAS 做这件事；海外代理仍走独立代理出口。

所以它不需要替代家庭路由器，也不需要让每台局域网设备修改默认网关。它负责的是**从 Tailnet 进入家庭 LAN 的那段连接**。Headscale 则管理节点注册、路由批准和访问策略，属于控制面。

这套分工还有一个好处：NAS、开发机、部署机各管一摊。即使某台部署机停机维护，NAS 仍能保持组网入口在线；反过来，NAS 的组网问题也不会被误认为是代理节点出了故障。

## 在极空间创建容器项目

![用户态 Netstack 和内核 TUN 子网转发路径的区别](/images/network/nas-kernel-vs-netstack.svg)

一开始我使用过内核态 TUN 转发，遇到 NAS 内核及防火墙规则兼容性问题。最终真正测通家庭 TCP 服务的是 **Tailscale 用户态 Netstack**，也就是 `TS_USERSPACE: "true"`。它不依赖此前那条内核 TUN、FORWARD 和 NAT 处理链，但主要处理 TCP/UDP 连接，不完全等同于透明的 L3 路由器。

下面的 Compose 保留了我实际使用过的服务名称、主机名、认证选项、网络模式、状态目录及设备权限。**只有家庭网段、Headscale 地址和认证密钥改成了变量**，避免把真实环境直接写到博客里。

在极空间的 Docker / 容器管理界面中新建 Compose 项目，准备 `compose.yaml`：

```yaml
services:
  tailscale:
    image: tailscale/tailscale:stable
    container_name: tailscale-subnet
    hostname: z2pro-router
    network_mode: host

    cap_add:
      - NET_ADMIN
      - NET_RAW

    devices:
      - /dev/net/tun:/dev/net/tun

    environment:
      TS_USERSPACE: "true"
      TS_STATE_DIR: /var/lib/tailscale
      TS_AUTH_ONCE: "true"
      TS_AUTHKEY: "${HEADSCALE_AUTH_KEY:-}"
      TS_HOSTNAME: z2pro-router
      TS_ROUTES: "${HOME_SUBNET:?请在 .env 中填写家庭网段}"
      TS_ACCEPT_DNS: "false"
      TS_EXTRA_ARGS: "--login-server=${HEADSCALE_URL:?请在 .env 中填写控制面地址}"

    volumes:
      - ./state:/var/lib/tailscale

    restart: unless-stopped
```

同一个项目再创建 `.env` 文件，并根据自己的环境替换占位内容：

```dotenv
HOME_SUBNET=<你的家庭网段 CIDR>
HEADSCALE_URL=https://headscale.example.com
HEADSCALE_AUTH_KEY=
```

极空间的容器管理界面可以管理项目文件；`.env` 应与 Compose 文件配套使用，注意实际项目的文件路径和变量加载方式。上面的尖括号和示例域名都是占位符，**不要原样拿去启动**。如果准备使用 Headscale 预授权密钥自动注册，再给 `HEADSCALE_AUTH_KEY` 填入有效密钥；不使用时可以留空，改走首次交互式注册。

这个 Compose 有几项值得说明：

- **`TS_ROUTES`**：声明自己能够到达哪个家庭网段，只负责发布，Headscale 仍需要批准。
- **`TS_AUTHKEY`、`TS_AUTH_ONCE`**：有有效密钥时支持首次自动认证；`TS_AUTH_ONCE: "true"` 配合持久化状态，避免容器每次重启都重复登录。密钥为空并不表示已经注册成功。
- **`TS_STATE_DIR` 与 `./state`**：保存节点身份。重建容器时保留此目录，别把它当作可随意删除的缓存。
- **`TS_HOSTNAME`**：明确 Tailnet 中展示的节点名称；Compose 里的 `hostname` 则是容器主机名，两者碰巧设为相同的值。
- **`network_mode: host`**：使用 NAS 的网络环境；不代表启用了内核包转发，也不是让 NAS 成为互联网出口。
- **`TS_ACCEPT_DNS: "false"`**：暂时不接收 Tailnet 下发的 DNS 设置，减少部署变量。

有一点需要特别交代：上面的 **`NET_ADMIN`、`NET_RAW` 和 `/dev/net/tun` 是最初测试内核态转发时留下的配置**。官方 Tailscale 文档说明，在当前 `TS_USERSPACE: "true"` 模式下，一般无需按内核模式挂载 TUN 和附加这些权限。为了忠实呈现实际验收过的 Compose，这里没有悄悄删除它们；但它们**不是推荐所有用户照搬的用户态必需项**。后续可以在备份状态目录、做好业务验证的前提下单独精简权限，本文不把未经复验的改动描述成已完成。

此外，`stable` 镜像标签会随时间更新。如果长期使用，值得把实际验收的镜像版本记录下来，方便回滚。`.env` 文件与 `./state` 目录可能包含敏感信息，**不要提交到公开仓库，也不要原样贴进 AI 对话**。

启动项目、查看运行状态及日志，直接使用极空间的容器管理界面即可。日常管理不必通过 NAS 宿主机执行 Docker 命令。

## 首次注册与批准路由

容器显示 Running，仅代表进程启动，不代表已经加入 Tailnet。

如果 `.env` 提供了有效的预授权密钥，先到 Headscale 检查节点是否注册成功；如果没有密钥或自动注册没有完成，进入极空间界面的 **`tailscale-subnet` 容器终端**，按需要手动登录：

```sh
tailscale login --login-server="<你的 Headscale HTTPS 地址>"
```

完成 Headscale 侧的节点注册后，继续在**容器终端**执行：

```sh
tailscale status
tailscale ip
```

容器命令不用写成 `docker exec`，因为此时已经在 Tailscale 容器内部。具体的首次注册方式可参考 [Headscale 官方入门文档](https://headscale.net/stable/usage/getting-started/)。

下一步是**路由批准**。Tailscale 通过 `TS_ROUTES` 发布网段，Headscale 再批准该网段；这是两个独立动作。在 **Headscale 控制面所在的主机或其容器终端**检查：

```sh
headscale nodes list-routes
headscale nodes approve-routes \
  --identifier "<NAS 节点 ID>" \
  --routes "<家庭网段 CIDR>"
headscale nodes list-routes
```

批准前先核对节点身份和网段，不能因为路由是新发布的就无条件放行。若已配置 Headscale 的自动审批策略，可能无需手动执行批准操作。详情见 [Headscale 子网路由文档](https://headscale.net/stable/ref/routes/)。

在控制面看到 **Approved、Available、Serving** 后，仍要确认手机已接受相应路由，且访问策略允许；这三个状态只说明路由发布与审批情况，不能证明后端业务已经连通。

## 验证的顺序，比排障命令更重要

我把验收分为四步，避免一开始就陷入防火墙或 NAT 细节。

1. **NAS 能访问家庭服务吗？** 先用 LAN 内一台可信设备确认家庭服务的实际地址、端口和协议，再检查 NAS 到该服务的可达性。
2. **手机能识别 NAS 吗？** 手机加入同一个 Tailnet 后，检查节点可达性。此时只验证组网，不代表整个家庭 LAN 已打通。
3. **手机从外面能打开家庭服务吗？** 断开家庭 Wi-Fi，用设备原有的局域网地址打开一个确定正在监听的 TCP 服务。这一步才是真正的子网路由验收。
4. **连接走 P2P 还是 DERP？** 先确保业务可用，再评估是否直连、延迟如何。中继能正常访问也不应被当作业务故障。

在 NAS 的 **Tailscale 容器终端**可以直接运行：

```sh
tailscale status
tailscale netcheck
```

`netcheck` 只反映网络探测能力；要判断对端是否真正直连，还需结合 `status` 或实际 `tailscale ping` 输出。最可靠的连通性证据仍是手机打开真实家庭服务，而不是一个绿色的在线标识。

## 这次遇到的两个坑

第一个是**路由已批准，但家庭服务访问失败**。

我最初的内核态方案在 NAS 上遇到 `iptables-legacy` 的 `mangle` 表、`connmark` 规则安装异常。路由在 Headscale 里已经显示 Serving，业务却仍然不通。换成用户态 Netstack 以后，家庭 TCP 服务最终成功访问。

这说明当时的内核转发路径确实有兼容性信号，但**不足以证明某一条规则就是唯一根因**。我没有完成完整抓包，因此也不把这个现象包装成对所有极空间设备都适用的结论。

第二个更简单：换成 Netstack 后，我一度看到 `connection refused`，还以为用户态也失败了。结果是自己测错了端口，目标主机压根没监听那个服务。改成真实开放的端口就通了。

所以我现在更倾向于先确认服务、再确认组网路由，最后才去查内核和防火墙。复杂问题可以和 AI 一起分析，但最好先把问题范围缩小，别一遇到不通就重装容器。

例如整理好**已脱敏**的 Compose、容器日志、路由审批状态和一次真实业务访问结果，再让 AI 按「控制面、客户端路由、NAS 到 LAN、P2P/DERP」四层给出排查顺序。**不要提交预授权密钥、节点私钥、真实公网地址或包含敏感信息的完整日志**；AI 给出的命令也要确认适用于 NAS 的系统环境后再执行。

## P2P 的一点后续优化

![IPv4/IPv6 P2P、STUN 探测与 DERP 回退的区别](/images/network/ipv6-p2p-derp-paths.svg)

实际业务访问恢复后，我才继续看链路质量。最初经常回退自建 DERP，尽管设备已经有 IPv6 出站，`netcheck` 仍曾显示 `IPv6: no`。

后来发现，提供相关服务的公开域名缺少 AAAA 记录，而服务本身已有 IPv6 监听能力。补上 AAAA 并保持 **DNS only（灰云）** 后，IPv6 STUN 探测变成可用；之后的实际对等连接状态也多次出现 **`direct [IPv6]:port`**。

这两个证据不等价：`netcheck IPv6: yes` 说明探测成功，`direct` 才说明观察到了节点之间的直连。能直连也不保证每次都低延迟，公网 UDP、防火墙、运营商互联和移动网络都会影响实际效果。

目前没有足够的长期数据支持增加更多 DERP 中继，所以先保持 P2P 优先、现有 DERP 兜底，不为一次高延迟继续增加维护成本。

## 最后

对这台 Z2Pro，最重要的不是某条 iptables 命令，而是明确它只负责一件事：**把 Tailnet 与家庭局域网连接起来**。

最终选用用户态 Netstack，是这次个人设备条件下实际测通的一种取舍，不是所有 NAS 的性能最优解。把 Docker 配置与 `.env` 保存好，检查节点身份和路由批准，再用手机访问一个真实的家庭 TCP 服务，已经足够构成一条清晰的部署验收路径。

后续如果再遇到异常，先按层次收集证据，再与 AI 协作缩小范围，比照搬别人的防火墙修复脚本更可靠。

参考资料：[Tailscale Docker 参数](https://tailscale.com/docs/features/containers/docker/docker-params)、[Tailscale 子网路由](https://tailscale.com/docs/features/subnet-routers)、[Headscale Routes](https://headscale.net/stable/ref/routes/)、[Tailscale 用户态模式](https://tailscale.com/docs/reference/kernel-vs-userspace-routers)。
