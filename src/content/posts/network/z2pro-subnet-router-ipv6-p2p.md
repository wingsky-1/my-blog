---
title: "极空间 Z2Pro 子网路由实践：部署、验证与排障"
description: "用 Docker 将极空间 NAS 纳入 Tailnet，让它承担家庭子网路由：从角色分工、Compose 部署、路由批准和连通性验收，到用户态 Netstack 排障与 IPv6 P2P 优化。"
pubDatetime: 2026-10-18T19:05:00+08:00
tags: ["网络", "Linux", "Tailscale", "Headscale", "Docker"]
featured: false
draft: false
---

家庭里有 NAS、开发机、部署机，也有不方便安装 Tailscale 的设备。我希望手机在外面时，仍然能够使用原来的局域网地址访问它们；又不想为了远程管理，把所有应用端口都暴露在公网。

和 ChatGPT 讨论家庭网络分工时，我们比较过让开发机、部署机兼任子网路由，以及交给独立低功耗设备这几种方案。最后决定利用本来就长期在线的**极空间 Z2Pro NAS**。

它适合承担这件事，不是因为 NAS 天生就是路由器，而是因为它常开、位于家庭 LAN 内、可以运行 Docker。更重要的是，部署机维护重启时，远程回家的基础链路不会跟着中断。

这篇先讲清楚 **NAS 在拓扑中的角色和怎么部署**，再按实际经历复盘验证与排障。P2P 和 IPv6 优化放在最后，篇幅不多但保留关键证据。如果更关心为什么手机只需一个 sing-box VPN 就能同时处理代理和回家，可以先看上一篇：[手机只用一个 VPN，同时搞定海外代理和家庭异地组网](/posts/network/one-vpn-proxy-and-home-mesh/)。

## NAS 在这套网络里究竟是什么身份？

![NAS 作为 Tailnet 与家庭 LAN 之间的子网路由，连接没有安装 Tailscale 的家庭设备](/images/network/nas-subnet-router-role.svg)

**它首先是一个普通 Tailnet 节点。** 安装 Tailscale 并注册到 Headscale 后，远端设备能够识别 NAS 的 Tailnet 身份。但此时手机最多只能访问 NAS 本身，还不能因此访问整个家庭 LAN。

**它进一步是子网路由（Subnet Router）。** NAS 在 Tailnet 中声明：「这一段家庭局域网，我能到达。」控制面批准后，远端设备才有机会将发往家庭网段的流量交给它。NAS 再连接到没有安装 Tailscale 的开发机、家庭服务或其他设备。家中这些设备不需要因此改变默认网关，也不必每台都装 Tailscale。

**它不是出口节点（Exit Node）。** 出口节点用于接管其他设备的互联网默认流量；子网路由只公布指定的私有网段。我的海外代理仍由另一组节点处理，NAS 不参与互联网出口分流。

这也解释了为什么我要把子网路由独立出来：Headscale 管**身份、策略和路由批准**；NAS 管**从 Tailnet 进入家庭 LAN 的业务连接**；开发机和部署机继续做自己的事。远程访问这条路径不必经过海外代理入口。

容易混淆的是：「NAS 加入 Tailnet」「NAS 发布子网」「Headscale 批准路由」「手机真实访问到家庭服务」是四个不同状态，不能只完成前两个就宣布成功。

## 为什么最终采用 Docker + 用户态 Netstack？

Z2Pro 的 Docker 足以承载一个常驻组网容器，配置和运行状态也容易集中管理。最初我尝试的是常见的内核态 TUN 路径，后来遇到了 NAS 内核与防火墙规则的兼容性问题，才保留了用户态 Netstack。

在用户态下，`tailscaled` 依然使用 WireGuard 连接 Tailnet 对端，但收到连接以后，它在进程内通过 Netstack 重建 TCP/UDP 连接，再由 NAS 连接家庭服务。这种方式不需要依赖同一套内核 TUN 转发与 NAT 规则。对主要访问家庭 Web 服务的低并发场景，性能损失比兼容性折腾更容易接受。

下面的 Compose 是按这次最终运行方式和 [Tailscale 官方 Docker 参数](https://tailscale.com/docs/features/containers/docker/docker-params) 整理的**脱敏示例**，不是我生产环境的原样配置。准备好 NAS 的 Docker/Compose、可达的 Headscale 控制面，以及家庭网段 CIDR 后，在 NAS 的 Docker 项目目录创建 `compose.yaml`：

```yaml
services:
  tailscale-subnet:
    image: tailscale/tailscale:stable
    container_name: tailscale-subnet
    hostname: nas-subnet-router
    network_mode: host
    restart: unless-stopped
    environment:
      TS_STATE_DIR: /var/lib/tailscale
      TS_USERSPACE: "true"
      TS_ROUTES: "${HOME_SUBNET:?set HOME_SUBNET}"
      TS_EXTRA_ARGS: "--login-server=${HEADSCALE_URL:?set HEADSCALE_URL}"
      TS_ACCEPT_DNS: "false"
    volumes:
      - ./tailscale-state:/var/lib/tailscale
```

在同目录的 `.env` 中配置 `HOME_SUBNET`（你的家庭网段 CIDR）及 `HEADSCALE_URL`（你自己的 Headscale HTTPS 地址），这里不展示真实值。几个参数各有用途：

- `TS_USERSPACE` 使用用户态网络；`network_mode: host` 让容器共享 NAS 的网络环境，但它**不等于启用内核转发**。
- `TS_ROUTES` 用来公布家庭网段；这只完成了路由的「申请」，还需要在 Headscale 审批。
- `TS_STATE_DIR` 配合目录挂载保存节点身份，避免每次容器重建都变成一个新设备。状态目录含有敏感身份数据，不要公开上传。
- `TS_EXTRA_ARGS` 让容器登录自建控制面；`TS_ACCEPT_DNS: "false"` 是为了不在这一步引入额外的 DNS 变量。

选用用户态时，不必照搬内核 TUN 教程给容器挂载 `/dev/net/tun`、添加 `NET_ADMIN` 或直接启用特权模式；那是另一条运行路径的权限需求。本文的 `stable` 是会变化的镜像标签，正式维护时应固定自己验收过的镜像版本。

启动并看日志：

```bash
docker compose config
docker compose up -d
docker compose logs --tail=80 tailscale-subnet
```

## 注册到 Headscale，然后批准子网路由

第一次运行时，容器处于 Running 不代表已经注册成功。需要根据日志与 Headscale 的注册机制完成设备认证；如果需要交互式登录，可以执行：

```bash
docker exec -it tailscale-subnet tailscale login \
  --login-server="<你的 Headscale HTTPS 地址>"
```

交互式注册可能还需要在 Headscale 管理侧确认设备，具体按 [官方注册流程](https://headscale.net/stable/usage/getting-started/) 处理。这里不放 PreAuthKey、认证链接或任何生产控制面地址。

注册成功后，先检查容器是否具有 Tailnet 身份：

```bash
docker exec tailscale-subnet tailscale status
docker exec tailscale-subnet tailscale ip
docker compose logs --tail=80 tailscale-subnet
```

**下一步容易遗漏：节点发布了路由，控制面还要批准。** 在 Headscale 所在环境执行：

```bash
headscale nodes list-routes
# 识别出 NAS 节点后，再使用实际节点 ID 和家庭网段：
headscale nodes approve-routes \
  --identifier "${NODE_ID}" --routes "${HOME_SUBNET}"
headscale nodes list-routes
```

注意：后两处变量需事先在执行命令的 Shell 中赋值；如果 Headscale 运行在容器内，应通过对应容器执行这些命令。官方也支持按策略自动审批，但个人首次搭建时手动检查发布的网段，有助于避免误放通。参见 [Headscale 路由文档](https://headscale.net/stable/ref/routes/)。

**Approved、Available、Serving** 这三个状态表示控制面认为路由获批、有可用发布者、正在提供服务；它们不是 TCP 业务测试结果。手机端也必须接收并路由相应网段，且 ACL / Grants 允许访问。

## 四步验证：不能只看节点在线

我现在会按照真实数据路径依次验证，而不是先去改防火墙。

1. **先验证 NAS → 家庭 LAN。** 在 NAS 上访问家中已经确认开放的服务端口。服务要真实存在，且 NAS 本身能访问。
2. **再验证手机 → NAS。** 从外部网络测试 Tailnet 节点之间的通信，确认手机与 NAS 都已经在同一个受控网络中。
3. **然后验证手机 → 家庭服务。** 使用原来的家庭设备地址和实际服务端口，验证 HTTP、SSH 或其他明确开放的 TCP 业务。这一步才真正跨越了子网路由。
4. **最后验证路径质量。** 业务成功后，再看 P2P 还是 DERP；「经中继可访问」也是连通，不应误判成路由失败。

在 NAS 的 Docker 终端可检查：

```bash
docker exec tailscale-subnet tailscale status
docker exec tailscale-subnet tailscale netcheck
```

其中 `netcheck` 判断网络探测能力，`status` 帮助观察对等连接；它们不能代替手机真实访问家庭服务。尤其是用户态 Netstack 下，ICMP ping 的行为与完整 L3 包转发并不相同。

## 实际排障：路由已经 Serving，为什么手机还是进不了 LAN？

当时环境有这些确定的事实：

- NAS 以 Docker **host 网络模式**运行 Tailscale，并发布 家庭网段。
- Headscale 显示该路由 **Approved、Available、Serving**。
- NAS 和 Android 之间的 Tailnet 通信正常；NAS 自身也能访问家庭 LAN。
- Linux 的 `net.ipv4.ip_forward=1`；检查过的路由决策符合预期。
- NAS 使用的 `iptables-legacy` 环境缺少 `mangle` 表，Tailscale 安装 `connmark` 相关规则出现错误。
- 排查时看到 `ts-forward` 计数增加，但 `ts-postrouting` 的 MASQUERADE 计数为零；对应 Android 到 LAN 的连接跟踪记录也没有查到。

这些信息合在一起，比单看一个绿色的路由状态有用得多。

**Approved** 说明控制面批准发布，**Available / Serving** 说明控制面认为这条路由当前可以服务。它们不负责证明 NAS 的内核包转发、NAT 和目标服务全都能正确工作。

我最初怀疑是 NAS 的内核/防火墙兼容问题，尤其是 `mangle` 表缺失导致 Tailscale 的规则没有完整装好。

但这里不能写成「已经找到唯一根因」。

`ts-forward` 有计数，不等于数据包已经顺利进入预期的 POSTROUTING；MASQUERADE 为零也不单独证明一定是哪条规则阻断。连接跟踪没有对应记录，还可能是数据包在更早的链路被处理、匹配条件不对，或者观测方法没有覆盖到实际路径。当时没有做完整的双向抓包和内核跟踪，无法把所有可能性排除。

更稳妥的结论是：**内核态转发路径存在可观测的异常，且当前 NAS 环境里有明确的 iptables 兼容性信号。** 足以支持尝试另一种实现，而不够支持宣告「缺 mangle 就是唯一根因」。

## 换一条路：从内核 TUN 到用户态 Netstack

![内核态 TUN 的 L3 转发路径与用户态 Netstack 的 TCP UDP 连接重建路径](/images/network/nas-kernel-vs-netstack.svg)

Tailscale 的子网路由在 Linux 上主要有两种工作方式。

**内核态模式**：Tailscale 处理 WireGuard 加解密，解密后的 IP 数据包进入 Linux 网络栈，由内核执行路由、转发、过滤与必要的 SNAT。TCP 连接的端到端语义得以保留，能处理更多 IP 协议，通常更适合流量高、连接多的专用 Linux 路由器。

**用户态模式**：使用 gVisor Netstack，在进程内处理来自 Tailnet 的流量。对于 TCP/UDP，Tailscale 终止原连接，再由 NAS 建立到目标 LAN 设备的新连接，将两端数据关联转发。它不用依赖同样的内核 TUN、FORWARD 与 NAT 路径来完成这些连接。

这是 **L3 IP 转发**与**L4 TCP/UDP 连接代理**的区别。用户态并不是「所有协议原样过一遍」的等价替换。官方文档指出，用户态模式不支持任意 IP 协议（例如 SCTP）；ping 是特殊的重建式行为，不能拿用户态 ping 的结果精确判断端到端 ICMP 延迟。

参考：[Tailscale 官方：Kernel vs. netstack subnet routing](https://tailscale.com/kb/1177/kernel-vs-userspace-routers)。

在我的 Z2Pro Docker 环境里，最终保留了这组关键设置：

```yaml
environment:
  TS_USERSPACE: "true"
  TS_ROUTES: "家庭网段"
```

注意这只是相关的 Compose 环境片段，**不是可直接复制部署的完整 Compose 文件**。实际还需要镜像、状态持久化、控制面注册、网络与访问权限等配置；密钥不应出现在文章或公开仓库里。

启动后确认进程参数：

```text
tailscaled --tun=userspace-networking
```

这次访问家庭 TCP 服务成功了。结合之前内核路径的异常，我选择暂时保留用户态，而不是为了在 NAS 的定制内核上恢复某组 iptables 规则继续折腾。

这并不说明用户态模式必然比内核态好。它有连接重建、协议范围和潜在 CPU 开销的限制；对高并发、高带宽、需要端到端 IP 语义的场景，优先选择可靠的内核态路由器仍然有充分理由。

但我的日常流量主要是手机偶尔打开家中 Web 服务、NAS 页面或者维护入口。在这种低并发、小规模场景下，**简单可用比把理论吞吐推到极致更重要**。

## 一个误导了排查方向的 `connection refused`

切完用户态后，日志里一度出现了：

```text
netstack: could not connect to local backend server
connect: connection refused
```

第一眼很像 Netstack 没成功。

后来才发现，测试时访问了一个**目标设备根本没有监听的端口**。

改成真实开放的 TCP 服务端口，连接就通了。

`connection refused` 在这里说明 Netstack 尝试连接后端时收到拒绝，不应该自动被解读成「Tailnet 隧道坏了」。排障时最好先在 LAN 内确认目标主机、目标端口与服务监听，再从远端发起完全一致的访问。

这也改变了我的验收习惯：比起只执行 `ping` 或者看 `tailscale status`，更重视实际业务协议的**端到端连接成功**。

可以按下面的顺序核对：

```bash
# 在 NAS 上检查本地目标服务是否可达（示例地址和端口）
curl -I --connect-timeout 5 http://家庭服务地址/

# 在手机端使用同一目标地址和真实服务端口
# 验证页面或接口返回，而不是只看 Tailnet 在线状态
```

这里的 `家庭服务地址` 只是示例，不能据此推断我的实际服务地址。对于不响应 HEAD 请求的服务，也不能仅用 `curl -I` 返回的 HTTP 状态码判断连通性。

## P2P 小优化：有 IPv6，为什么仍然走 DERP？

![手机与 NAS 的 IPv4 IPv6 直连、STUN 发现与 DERP 回退关系](/images/network/ipv6-p2p-derp-paths.svg)

这部分只谈链路质量，不再把它和子网转发混在一起。用户态 Netstack 影响 NAS 进入家庭 LAN 的路径，**并不阻止 Tailscale 使用 WireGuard UDP P2P**。

最初 Android 和 NAS 偶尔可以 IPv4 直连，但多次回退自建 DERP，延迟波动较大。两端都已有公网 IPv6，NAS 出站也正常，`tailscale netcheck` 却显示 `IPv6: no`。

排查后发现，服务所用的公开域名原先只有 A 记录，缺少 AAAA，而控制面内置的 STUN/DERP 已具备 IPv6 监听能力。补充 Cloudflare AAAA 并保持 **DNS only（灰云）**，重新测试，`netcheck` 的 IPv6 探测变成 `yes`。

但 **STUN 能检测 IPv6，不等于端到端 P2P 已经直连**。后来在真实的对等状态中多次看到 `direct [IPv6 peer]:port`，这才是直连证据。公网 IPv6 仍可能受运营商路由、移动网络、防火墙影响；有些直连样本依然延迟较高，尚不足以定位唯一原因。

普通 Cloudflare 代理记录不会替你中转任意 UDP STUN；只添加 AAAA 而没有检查主机监听、防火墙，也可能无效。现阶段我不打算为偶发高延迟继续改 NAS 内核或增加第二个 DERP，中继节点越多也意味着更多证书、网络和监控维护。

参考：[Tailscale 连接类型](https://tailscale.com/docs/reference/connection-types/)、[Headscale DERP](https://headscale.net/stable/ref/derp/)。

## 最后：NAS 子网路由，先验角色，再验业务

这次折腾最后留下来的思路很简单：**先确认 NAS 是 Tailnet 与家庭 LAN 之间的子网路由，而不是出口节点；再把控制面、业务转发、链路质量分开验收。**

最开始的内核态路径确实出现了 `mangle` / `connmark` 等异常，但当时没有完整抓包，不能武断认定唯一根因。我最后选择了已经实际测通家庭 TCP 服务的用户态 Netstack，并保留 WireGuard P2P 优先、DERP 兜底。

对于低并发的个人远程维护，这比继续调整 NAS 的定制内核更省心。需要持续做的是测试不同网络下的实际服务访问与稳定性，而不是因为一次慢连接就再加一台中继。

官方资料：[Tailscale 子网路由](https://tailscale.com/docs/features/subnet-routers)、[Tailscale Docker 参数](https://tailscale.com/docs/features/containers/docker/docker-params)、[Headscale Routes](https://headscale.net/stable/ref/routes/)、[Kernel vs. Netstack](https://tailscale.com/kb/1177/kernel-vs-userspace-routers)。
