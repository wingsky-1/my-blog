---
title: "极空间 Z2Pro 折腾记：子网路由不通与 IPv6 P2P 排障"
description: "Headscale 显示 Approved、Available、Serving，手机却进不了家里的 LAN；切换用户态 Netstack 后，又排查了 IPv6 STUN 与 DERP 回退。记录真实证据和仍未确认的原因。"
pubDatetime: 2026-10-18T19:05:00+08:00
tags: ["网络", "Linux", "Tailscale", "Headscale", "Docker"]
featured: false
draft: false
---

组网这件事，有时候最让人迷惑的不是报错，而是**所有状态看着都正常，实际就是连不上**。

我这次的场景是：极空间 Z2Pro NAS 通过 Docker 运行 Tailscale，在 Headscale 上发布家庭 `192.168.31.0/24` 子网路由，让外面的 Android 手机访问家里的服务。

NAS 在线，手机在线，路由状态也没问题。甚至 NAS 和手机之间的 Tailnet 地址可以通信。但从手机去访问家庭 LAN，始终不通。

好不容易解决转发，又碰到了另一个问题：明明两端具备 IPv6，连接却经常绕东京 DERP，中继延迟还时不时飙到几百毫秒甚至数秒。

这篇把它拆成两个独立故障：**先解决「进不了 LAN」，再解决「能进 LAN 但链路不理想」**。它们分别发生在数据转发层和对等连接层，混在一起排查反而容易走弯路。

如果想先了解为什么手机只需要一个 sing-box VPN，就能同时处理代理与家庭访问，可以从上一篇开始：[手机只用一个 VPN，同时搞定海外代理和家庭异地组网](/posts/network/one-vpn-proxy-and-home-mesh/)。

## 问题一：路由已经 Serving，为什么手机还是访问不到 LAN？

当时环境有这些确定的事实：

- NAS 以 Docker **host 网络模式**运行 Tailscale，并发布 `192.168.31.0/24`。
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
  TS_ROUTES: "192.168.31.0/24"
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
curl -I --connect-timeout 5 http://192.168.31.50:8080/

# 在手机端使用同一目标地址和真实服务端口
# 验证页面或接口返回，而不是只看 Tailnet 在线状态
```

这里的 `192.168.31.50:8080` 只是示例，不能据此推断我的实际服务地址。对于不响应 HEAD 请求的服务，也不能仅用 `curl -I` 返回的 HTTP 状态码判断连通性。

## 问题二：访问正常后，为什么还总回退 DERP？

![手机与 NAS 优先尝试 IPv4 IPv6 UDP 直连，STUN 用于发现候选路径，直连失败回退 DERP](/images/network/ipv6-p2p-derp-paths.svg)

完成子网转发后，NAS 到 Android 的状态曾偶尔显示 IPv4 直连：

```text
direct 106.x.x.x:port
```

但很多时候又回退 Tokyo DERP，延迟波动很大；有的测试还提示：

```text
direct connection not established
```

先搞清楚四个角色，才不会误用监控指标：

- **Headscale**：控制面，提供节点、网络策略和 DERP map 等协调信息，不承担普通家庭网页的代理转发。
- **STUN**：帮助节点了解自身在公网侧能被如何看到，用于连接探测和 NAT 穿透。STUN 成功不是对端业务连接成功。
- **P2P / WireGuard**：节点之间经 UDP 直接传输加密数据，是期望中的主要路径。
- **DERP**：直连不可用时的加密数据中继与连接辅助机制。数据仍为 WireGuard 加密内容，但路径会绕中继点，受其地理位置与线路影响。

在当前 Tailscale 体系里还存在可选的 Peer Relay，但我这套环境没有另外部署它；本文重点只讨论直连和自建 DERP。参考 [Tailscale 连接类型](https://tailscale.com/docs/reference/connection-types/)。

## 有公网 IPv6，却测出 `IPv6: no`

最有意思的是：Hub 和 NAS 都已经具备公网 IPv6。NAS 的默认 IPv6 路由和公网出站也没问题，可执行 Tailscale `netcheck` 时，结果却是：

```text
UDP: true
IPv4: yes
IPv6: no
```

这里的 `IPv6: no` 不能简单翻译成「这台 NAS 没有 IPv6 地址」，它描述的是 Tailscale 探测到的 IPv6 网络能力。当 STUN 探测目的地无法经 IPv6 正常解析或到达时，有公网地址也不一定能让它给出 `yes`。

继续查下去，发现 Headscale 的对外域名**当时只有 A，没有 AAAA 记录**。而 Hub 的内置 DERP/STUN 原本已经具备 IPv6 监听能力。

补充 Cloudflare 的 AAAA 记录，保持 **DNS only（灰云）**，重新运行 `netcheck` 后，IPv6 STUN 成功：

```text
UDP: true
IPv4: yes
IPv6: yes
```

这能支持「DNS / IPv6 STUN 可达性是当时链路探测的关键缺口」这个判断，但不等于所有 Tailscale IPv6 建连故障都可以靠加 AAAA 修复。

真正完成端到端直连的证据，是随后 Android 与 NAS 的实际连接状态出现了：

```text
active; direct [240e:...]:57390
```

之后连续多次测试能通过公网 IPv6 P2P 直连。相比之下，`netcheck IPv6: yes` 只是探测结果，**不能替代对等节点状态中的 `direct [IPv6]:port`**。

另外，公网 IPv6 也不自动等于入站可达。你可能有全球地址和正常的 IPv6 出站，但家庭路由器或主机防火墙仍阻止入站 UDP；某些运营商和移动网络路径也可能时好时坏。需要一起核对公网 AAAA、DNS 解析、真实 UDP 监听、双向可达、防火墙及运营商路径，而不是只看 `ip -6 addr`。

## AAAA、灰云与双栈 UDP 的几个细节

在这个案例里，给 Headscale / DERP 主机配置 AAAA 有意义，是因为客户端需要能通过公开域名找到 IPv6 侧可用的协调与探测入口。

但 **Cloudflare 橙云不是任意 TCP/UDP 的透明转发器**。普通 DNS 代理模式下不能假定 UDP/3478 STUN 会被 Cloudflare 代转。用于 Headscale/DERP/STUN 的记录保持灰云，让客户端直达主机；同时在云服务安全组、主机防火墙和实际服务监听里检查相应 TCP/UDP 端口。端口要求可参考 [Headscale 官方部署要求](https://headscale.net/stable/setup/requirements/)。

还有一个 Linux 上特别容易看错的细节：监听工具可能只显示 `udp6 :::3478`，未必意味着「只接受 IPv6」。在允许 IPv4-mapped IPv6 地址的双栈 socket 配置下，单个 IPv6 UDP socket 也可能接收 IPv4；反过来若启用了 `IPV6_V6ONLY`，它就不会接收 IPv4。要结合 `net.ipv6.bindv6only`、程序自身 socket 选项和 IPv4/IPv6 分别发包的实测结果判断，**不能光看 `ss` 的一行就宣判 IPv4 没监听**。

这一段还有两个不同的 IPv6 地址空间：Tailnet 内部的 `fd7a:115c:a1e0::/48` 是私网 ULA 范围；状态里的 `direct [240e:...]` 是公网传输地址。前者代表组网身份/路由，后者才说明本次传输尝试走了哪条公网路径。参考 [Tailscale IPv6 支持](https://tailscale.com/docs/concepts/ipv6)。

## IPv6 P2P 成功后，为什么延迟还会很高？

解决了「能否直连」，不等于解决了「直连质量」。

在最终样本里，IPv6 P2P 连续成功过，但少数延迟仍达到数百毫秒。可能影响结果的因素包括移动网络无线侧时延、两家运营商之间的互联路由、拥塞、终端省电和测量方式。用户态 Netstack 下的业务 TCP 耗时也不等同于 WireGuard 对等 UDP 的往返时延。

目前没有足够的跨运营商、跨时段双向数据，无法断言是哪一家运营商的问题，更不能保证 IPv6 P2P 永远比东京 DERP 快。**直连是路径属性，不是低延迟认证章。**

那么要不要再加一个国内 DERP？

如果长期监控发现某些移动网络确实经常无法直连，且东京中继绕路明显，再考虑在目标用户附近增加一个中继才有意义。但额外 DERP 需要公网可达、部署运维、访问控制、证书、监控和持续费用；如果大部分连接已经能 P2P，它通常不会让这些直连流量进一步变快。

而且只有一台自建 DERP 时，本身也有单点故障风险。中继节点不是越多越好，是否增加应该由真实回退比例与质量数据决定。参考 [Headscale DERP 文档](https://headscale.net/stable/ref/derp/) 与 [Tailscale DERP 文档](https://tailscale.com/docs/reference/derp-servers/)。

## 如果重新排查一次，我会按这个顺序

这次最大的教训是：把「控制面状态」「实际业务转发」「连接路径质量」分开验收。

1. **先查业务本身**：LAN 内用正确 IP、协议、端口访问目标服务，确认它确实在监听。
2. **再查控制面**：NAS 和手机已注册、路由发布且获批，ACL 允许访问；不要把 Serving 当成业务成功。
3. **测尾端**：手机与 NAS 的 Tailnet 地址通信是否正常，再从手机测 LAN 中真实开放的 TCP 端口。
4. **检查 NAS 转发层**：宿主机网络模式、路由、IP forwarding、iptables/nftables、NAT 计数与日志；如果能力允许，分接口双向抓包，避免过早锁定原因。
5. **确认运行模式**：内核 TUN 还是 `--tun=userspace-networking`。低并发的 NAS 可以尝试用户态作隔离验证，同时接受它的协议与性能代价。
6. **最后看 P2P**：`tailscale netcheck` 判断 UDP 与 IPv4/IPv6 探测能力；`tailscale status` 或 `tailscale ping` 观察实际对端是 `direct` 还是 `relay`，再按时段记录波动。
7. **针对性检查 IPv6 / DERP**：公开 DNS 的 A/AAAA、STUN UDP、双栈 socket、云安全组与本地防火墙；别用浏览器打开 HTTPS 成功来代替 UDP STUN 测试。

对于这台 Z2Pro，我现在选择：**继续使用用户态子网路由，优先 IPv6 P2P，自建 Tokyo DERP 保底**。既然家庭 TCP 访问已经成功、连续直连也测到过，就没有足够的收益支撑继续修改 NAS 内核环境或者增加第二台中继。

后面更值得做的是记录不同 Wi-Fi、蜂窝网络和运营商下的成功率、直连比例和延迟分布。如果数据真的显示持续瓶颈，再有针对性地优化。这样至少比对着一次 `IPv6: no` 或一次高延迟反复改配置踏实。

参考资料：[Tailscale 内核与用户态子网路由](https://tailscale.com/kb/1177/kernel-vs-userspace-routers)、[Tailscale 子网路由](https://tailscale.com/docs/features/subnet-routers/)、[Tailscale CLI / netcheck](https://tailscale.com/kb/1080/cli)、[Headscale DERP](https://headscale.net/stable/ref/derp/)。
