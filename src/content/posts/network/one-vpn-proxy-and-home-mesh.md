---
title: "手机只用一个 VPN，同时搞定海外代理和家庭异地组网"
description: "把 sing-box 的代理分流和内嵌 Tailscale Endpoint 放进同一套手机配置：在家直连、出门走 Mesh，顺便聊聊 Headscale、NAS 子网路由与海外出口的架构取舍。"
pubDatetime: 2026-10-18T19:00:00+08:00
tags: ["网络", "sing-box", "Headscale", "Tailscale", "WireGuard"]
featured: false
draft: false
---

我想在手机上解决两个一直有点别扭的问题。

一个是海外网络：国内网站正常直连，需要代理的服务交给海外节点；其中部分 AI 服务还希望走一台单独的家宽出口。

另一个是回家：不管人在家里还是在外面，打开 NAS、开发机或者家庭服务，都尽量使用同一套 `家庭设备原来的局域网地址` 地址，不用记两种入口。

这两个需求单独做并不难。麻烦在于，**手机只想开一个 VPN**。

以前最直观的办法，是代理客户端和 Tailscale 客户端各装一个。可手机系统通常会让两套基于 VPN 接口的全局隧道争用同一个系统入口，尤其 iOS 的 Network Extension 和 Android 的 VpnService，不适合指望两个独立 VPN 同时稳定接管所有应用流量。经常是打开这个，另一个就断开，或者路由、DNS 不按预期工作。

我把这个问题拿来和 ChatGPT 反复讨论：能不能不在手机上强行同时运行两款 VPN，而是只保留一个入口，让代理和异地组网各走各的路径？

讨论过程中，我们把系统 VPN 限制、Tailscale 控制面和 sing-box 的路由能力分别梳理了一遍，最后确定了一个更符合我使用习惯的方案：**由 sing-box 接管手机上唯一的 VPN/TUN 入口，再通过内嵌的 Tailscale Endpoint 加入家庭 Mesh。**

这个想法不是我突然自己想出来的，而是我和 ChatGPT 一起讨论、推敲架构取舍后逐渐明确的。当然，讨论得通只是第一步，后续还得靠部署、排障和验收证明它可用。

这样，访问海外网站和访问家里的 NAS，不是切换两个 VPN，而是同一个客户端里的两种出口。它们解决的不是同一个问题，也就没有必要抢系统入口。

这里先说清验收边界：这是一套正在从联调转向正式订阅的个人实践。Android 作为 Tailnet 节点到家庭 TCP 服务的访问、NAS 子网路由及 IPv6 P2P 已经实际测通；iOS 已注册到 Tailnet，但尚未完成同等程度的业务和 SSID 切换验收。**不要把下文的设计流量图理解成所有移动端场景均已实测通过。**

## 先看手机究竟怎么选路

![一个 sing-box TUN 将手机请求分流到局域网直连、家庭 Mesh、国内直连与海外代理](/images/network/one-vpn-mobile-routing.svg)

从手机应用看来，它只是正常发起 DNS 查询、打开网页、连接某个 IP 和端口。接管网络入口的是 sing-box 的 TUN；真正决定去向的是它的 DNS 和路由规则。

我把流量按用途分成四类：

- **家庭服务**：目的地址属于家庭 LAN（这里以 `家庭网段` 为例）。连接已确认的家庭 Wi-Fi 时，优先从本地网络接口直达；在蜂窝网络或其他 Wi-Fi 下，走 Tailscale Endpoint，经 NAS 子网路由进入家里。
- **普通国内服务**：依据域名、解析结果与规则集选择直连，不先绕海外。
- **需要代理的海外服务**：交给 Edge 代理入口。
- **需要特定出口的 AI 服务**：手机仍只连接 Edge，由服务端按规则转发到独立的 Out 家宽出口，再访问目标服务。

所谓「统一」，不是说所有流量走同一条隧道。恰好相反：**入口统一，出口按目标分开**。

一个容易忽略的点是：`家庭网段` 只能说明目的地是哪个网段，不能单凭这个地址判断手机是不是在家。相同目的网段的规则，需要结合可信家庭 SSID、当前网络接口、Tailnet 可达路由与规则顺序来决策。

如果在外面连上一张恰好与家庭网段重叠的 Wi-Fi，仅按「私有地址直连」就可能错误地连到咖啡店设备。因此，局域网直连必须限定在明确识别的家庭网络，不能用「所有 RFC1918 地址直连」一把梭。

## 一个 VPN，为什么能装下代理和组网？

核心是把三个层次拆开看。

**第一层：TUN 是手机的流量入口。**

sing-box 图形客户端通过平台 VPN API 建立网络接口。应用产生的 IP 流量进入 TUN，由 sing-box 处理。系统无需再为 Tailscale 独立创建另一条全局 VPN。

**第二层：路由、DNS 是决策器。**

域名请求需要走哪个解析器？`家庭网段` 要进 Mesh 还是本地直连？某个海外域名命中哪组规则？这些都由 sing-box 配置决定。DNS 不只是「能解析」，解析位置还会影响是否泄漏内网域名、是否错误走代理，以及域名规则与目标 IP 能否对应。

**第三层：Tailscale Endpoint 和代理 Outbound 是不同的网络出口。**

sing-box 从 1.12.0 起提供 Tailscale Endpoint，能通过 `control_url` 指向自建 Headscale，加入 Tailnet，并通过 `accept_routes` 接收子网路由。它负责与其他 Tailnet 节点用 WireGuard 通信；海外代理 Outbound 则负责连接代理服务器。两条路径可以由同一个路由引擎选择，而不需要再创建第二个系统 VPN。

官方还提供 `preferred_by` 匹配 Tailscale 节点允许的 IP 和 MagicDNS 域名。它适合帮助识别 Mesh 目的地，但实际配置仍需要验证规则匹配顺序、可接受的子网路由和 DNS 解析方式。参考 [sing-box Tailscale Endpoint](https://sing-box.sagernet.org/configuration/endpoint/tailscale/)、[路由规则](https://sing-box.sagernet.org/configuration/route/rule/) 与 [Tailscale DNS](https://sing-box.sagernet.org/configuration/dns/server/tailscale/)。

所以并不存在「sing-box 代替了 WireGuard」这件事。WireGuard 仍是组网传输层，sing-box 只是让它和代理在移动端共享了一套入口与路由控制。

## 家里的设备和远端服务为什么分工

![家庭 LAN、NAS 子网路由、Hub、Edge 代理和 Out 家宽出口的职责拓扑](/images/network/home-mesh-topology.svg)

网络看起来有些组件，但它们各有边界。

**Hub** 承担 Headscale 控制面（本次环境使用 0.29.5）、内置 DERP/STUN、Caddy 和订阅发布。Headscale 是 Tailscale 控制服务器的自托管实现：管理节点注册、路由与策略等协调信息，不是把网页流量解密再转发的普通 HTTP 代理。控制面告诉节点「可以跟谁连接」，真正传输时优先尝试点对点直连；失败才依赖中继。

**Edge** 运行 sing-box/s-ui，是海外代理入口。它承担常规代理连接和服务端策略分流；**Out** 则是独立的海外家宽落地出口，供部分对出口网络质量更敏感的服务使用。两台拆开，是为了把线路质量与最终访问身份分开维护，而不是让手机分别配置两套互相争夺流量的 VPN。

**极空间 Z2Pro NAS** 通过 Docker 运行 Tailscale，发布家庭 `家庭网段` 的子网路由。远端手机访问没有安装 Tailscale 的打印机、开发机或家庭服务时，由 NAS 把 Tailnet 和物理 LAN 接起来。NAS 长期开机、低功耗、物理上就在局域网里，适合固定承担这项职责。

**家庭开发机** 的 sing-box 主要负责本机代理，也向 LAN 提供代理服务。**家庭部署机** 管 Docker 应用、Caddy 和基础设施。它们不用再同时兼任整个家庭的路由网关。以后部署机维护重启，不应连带影响 NAS 的远程回家路径。

Caddy 则负责需要 HTTPS 的站点入口和 TLS；Cloudflare 托管 DNS。**公网域名访问业务应用**与**手机经 Tailnet 访问 `家庭设备原来的局域网地址`**是两条不同的路径。域名走 HTTPS 时不等于自动走 Mesh，反过来直连家中 IP 也不必经过 Cloudflare。

这套职责分离让我能比较容易地判断故障边界：节点注册不上看 Hub；远程 LAN 不通看 NAS 子网路由；海外站点异常看 Edge/Out；部署应用不可用看家庭部署机。

代价同样明显：多台主机、订阅生成、密钥生命周期、规则维护和监控都需要打理。只有一个 NAS、偶尔从外面访问照片的用户，使用普通 Tailscale 客户端加子网路由往往更省事。**单 VPN 一体化主要解决的是我同时需要长期代理、细分出口和家庭 Mesh 的移动端场景。**

## 在家直连、出门走 Mesh：不是简单切换一个开关

我更在意「使用习惯不变」：不管是在家 Wi-Fi 还是蜂窝网络，浏览器里写的都是同一个家庭 IP 和端口。

要做到这点，至少有三个条件。

第一，手机必须拿到可用的家庭子网路由；Headscale 对路由的批准和服务端发布只是前置条件，不能代替一次真实的 TCP 连接测试。

第二，家庭 SSID 规则要放在远端子网路由规则之前，同时不能错放泛私网直连规则。离家以后要能回落到 Mesh；回家以后要避免绕远路再从 NAS 转回来。

第三，DNS 需要和路由决策一致。访问家中 IP 可以暂时绕开域名解析复杂度；以后要加入内部域名，才继续做内网 DNS / MagicDNS 的分流，避免内网查询被发给公网 DNS。

这里还有一个容易误导人的参数：`route.auto_detect_interface`。sing-box 官方文档明确写明，该**路由级参数只支持 Linux、Windows 和 macOS**，主要帮助桌面/服务器 TUN 避免出口再次绕回 TUN。它不能被写成 Android/iOS 通用的「开启即可防回环」开关。移动端应以对应图形客户端的网络选择能力、VPN 系统行为和实际拨号日志验收为准。参见 [sing-box Route](https://sing-box.sagernet.org/configuration/route/) 与 [Dial Fields](https://sing-box.sagernet.org/configuration/shared/dial/)。

SSID 判断也有边界。sing-box 支持 `wifi_ssid` 匹配，但平台需要能够读取 Wi-Fi 信息；Android 的相关权限、iOS 的网络状态权限和平台限制，都可能影响是否命中。**这是当前设计目标，不是已经在所有手机上完成的自动切换验收报告。** 参考 [Wi-Fi State](https://sing-box.sagernet.org/configuration/shared/wifi-state/)。

## Hub 是控制点，不是所有流量的必经之路

这一点很容易画错。

手机和 NAS 加入 Tailnet 时，需要向 Hub 的 Headscale 获取节点与路由信息；发现对端候选地址时，会利用 STUN 等机制判断连接条件。如果可直连，它们之间就用 WireGuard UDP 直接传输数据。

```text
手机 ───── WireGuard P2P ───── NAS ───── 家庭 LAN
             （优先）
手机 ── DERP/中继 ── NAS ───── 家庭 LAN
           （回退）
```

DERP 不能被误当成海外代理出口，也不意味着访问家庭服务时数据都必须经由 Hub。DERP 只在相应连接无法直连或建立连接的特定阶段发挥作用；真正经过 DERP 中继的数据依然是 WireGuard 加密的。

我后来就遇到了「配置显示在线，但大量连接绕DERP，延迟几百毫秒甚至更高」的问题。最后不仅涉及 NAS 子网路由的实现方式，还涉及 IPv6 STUN 可达性。详细过程放在下一篇：[极空间 Z2Pro 子网路由：部署、验证与排障](/posts/network/z2pro-subnet-router-ipv6-p2p/)。

## 这套架构的配置怎么统一管理？

每个节点单独配置并不难，难的是让多台服务器与手机订阅始终保持同一套规则。为减少重复操作，我还做了一个给自己用的订阅与节点管理工具。

先留个入口：[my-sub-dist](https://github.com/wingsky-1/my-sub-dist)。目前还在做完整部署验收，README 也没有整理完。等真正验收稳定后，我会补充公开安装说明，或者再评估能否公开更多实现；这篇就先不展开它的安装命令和版本细节。

至于技术方案本身，我更想把验收边界说清楚：

- **已经测通**：Android 与 NAS 的 Tailnet 通信、通过 NAS 访问家庭 TCP 服务，以及多次 IPv6 P2P 直连。
- **仍待完整验收**：iOS 的实际业务访问、移动端订阅更新，以及家庭 SSID 识别后自动切换本地直连与 Mesh 的行为。

如果准备复现，建议先独立打通子网路由与真实业务访问，再接上手机的 DNS 和代理分流。否则全部组件一起启动后，排错反而更困难。NAS 的 Docker 部署、路由批准与具体排障过程见下一篇。

## 最后：我想省掉的是手机上的操作，不是网络原理

最后效果不是把两套网络硬塞进同一条线路，而是让手机少做一件事：**不再为了访问家里的 NAS，先关闭代理，再打开另一款 VPN。**

代价是，配置生成端要把 DNS、SSID、路由优先级、Mesh 与代理出口真正组织好，出问题也要知道是哪一层故障。

对我来说，这种复杂度放在服务器和配置管理上，比每天在手机上切 VPN 更容易接受。至于 NAS 内核为什么不听话、IPv6 P2P 为什么一开始总回退 DERP，就留给下一篇把过程讲明白。

参考资料：[Headscale](https://headscale.net/stable/)、[sing-box Tailscale Endpoint](https://sing-box.sagernet.org/configuration/endpoint/tailscale/)、[Tailscale 子网路由](https://tailscale.com/docs/features/subnet-routers)、[Tailscale 连接类型](https://tailscale.com/docs/reference/connection-types/)。
