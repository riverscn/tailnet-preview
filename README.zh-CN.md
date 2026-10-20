# tailnet-preview

**在你自己的主机上，为每个 PR 起一套试用环境，只能通过你的 tailnet 访问。**

[English](README.md)

开一个 PR，你自己的机器上就会起一套完整的应用，数据库从默认分支的常驻**基线**复制而来。你会得到一个私有的 HTTPS 地址，只有你 [Tailscale](https://tailscale.com) 网络里的设备能打开。往 PR 推送会更新它，关闭 PR 它就删除。PR 上的评论会给出地址；部署失败时，会写明原因和处理办法。

```
pull request ──▶ GitHub Actions（你机器上的 self-hosted runner）
                   │  构建镜像 · 复制基线数据 · 执行 PR 的迁移 · 启动
                   ▼
   https://myapp-pr-42.<你的 tailnet>.ts.net      只在 tailnet 内可访问，公网上什么都没有
```

- **贴近真实的升级。** 每个 PR 都从一份真实（演示）数据的副本开始，再执行它自己的迁移，和上线时一样。只在已有数据上才会出现的问题，合并前就能发现。
- **私有。** 没有公网端口、隧道或登录页：只有你的 tailnet 能访问这些环境。
- **便宜。** 任何装了 Docker 的 Linux 机器都行，比如家里的小主机或一台闲置虚拟机。一台机器可以服务多个项目。
- **不挑技术栈。** 只用 Bash 和 Docker Compose。数据库就是你 compose 文件里的一个服务。

## 需要准备什么

- 一台**装了 Docker、一直开着的 Linux 机器**，留出几 GB 空闲内存（每个环境都运行一套完整的服务）。
- 一个 **Tailscale 账号**，免费套餐就够用。
- 一个你能管理的 **GitHub 仓库**，最好是私有的；公开仓库要按[安全说明](docs/security.zh-CN.md)采取措施。能往仓库推送的人，都能在这台机器上运行代码。
- 一个**能在容器里运行**的应用，最好已经有 compose 文件，并且从环境变量读取自己的地址和数据库连接。

## 上手

**1. 准备机器和 tailnet**（只做一次，约 30 分钟）→ [host-setup.zh-CN.md](docs/host-setup.zh-CN.md)

在 Tailscale 里开启 HTTPS 证书、加一条 `tag:preview` 访问规则、创建 OAuth 客户端；在机器上装好 Docker 和标签为 `preview` 的 GitHub Actions runner。做完后，`tailnet-preview host-check` 不再报 `FAIL`。在国内，还要先给 Docker 配好代理或镜像加速，见下面的[国内网络](#国内网络)。

**2. 在 `.tailnet-preview/` 里描述你的应用**（每个项目一次）→ [configuring.zh-CN.md](docs/configuring.zh-CN.md)

内容是一个小小的 `config.env` 加一个 compose 覆盖文件：要构建哪些镜像、浏览器打开哪个服务、应用自己的地址、模拟服务、迁移和演示数据任务。项目原有的 compose 文件不用改。`tailnet-preview init` 生成初稿，`tailnet-preview validate` 检查配置。这份指南是一步步的操作手册，AI 编程助手也能照着做。

**3. 为仓库打开试用环境**（每个项目一次，几分钟）→ [repository-setup.zh-CN.md](docs/repository-setup.zh-CN.md)

把仓库变量 `PREVIEW_ENABLED` 设为 `true`，再从那一页复制工作流文件。

**4. 开一个 PR**

加入 `.tailnet-preview/` 的那个 PR 会得到一个全新灌入演示数据的环境，因为这时还没有基线。合并它就会创建基线。从此以后，每个 PR 都从基线的副本开始，评论里会给出地址：

> **试用环境已就绪**（从基线复制）
>
> | 服务 | 地址                                    |
> | ---- | --------------------------------------- |
> | 应用 | https://myapp-pr-42.your-tailnet.ts.net |

想先看一个完整的最小配置，可以看 [example](example/)：本仓库在每个 PR 上都部署它，作为端到端测试。

## 原理

| 环境                | 数据                                                             | 生命周期                 |
| ------------------- | ---------------------------------------------------------------- | ------------------------ |
| `main`，即基线      | 第一次创建时执行迁移并灌演示数据，之后每次推送默认分支时原地升级 | 常驻                     |
| `pr-<编号>`         | 复制基线的数据卷（数据库、上传文件等），再执行 PR 的迁移         | 到 PR 关闭为止           |
| `br-<分支>`（可选） | 同上，用于没有 PR 的分支，需要在工作流里开启                     | 到分支删除或开了 PR 为止 |

每个环境是一个 Docker Compose 项目，包含你的所有服务，数据库也在内。复制基线时，引擎让基线暂停几秒，复制它的数据卷。详见 [design.zh-CN.md](docs/design.zh-CN.md)。

## 可选项

**哪些 PR 和分支有环境。** 默认每个 PR 都有，草稿 PR 也一样；没有 PR 的分支没有。在工作流里，`drafts: false` 让 PR 等到 Ready for review 再部署，`branches: 'release/* feature/*'`（或 `'*'`）让匹配的分支也有自己的环境（[repository-setup.zh-CN.md](docs/repository-setup.zh-CN.md#2-添加工作流)）。

**环境怎么被访问。** 这是机器的设置（`TP_INGRESS`），机器上的所有项目一致：

|      | `sidecar`（默认）                           | `shared`（共享入口）                                   |
| ---- | ------------------------------------------- | ------------------------------------------------------ |
| 地址 | `https://<项目>-<环境>.<tailnet>.ts.net`    | `https://<项目>-<环境>.<你的域名>`                     |
| 方式 | 每个环境是一个 Tailscale 节点，各有一张证书 | 每台机器一个入口，一张通配符证书                       |
| 需要 | 只要 Tailscale                              | 一个 DNS 服务商有 API 的域名，tailnet 里一条 split DNS |
| 注意 | 新环境的证书常常要过几分钟、重试后才签下来  | 入口停了，机器上所有环境都访问不到                     |

先用 `sidecar`；希望环境一部署就能用时，换成 `shared`（[host-setup.zh-CN.md 第 4 节](docs/host-setup.zh-CN.md#4-共享入口可选每台主机一次)）。切换时数据不变，地址会变。

## 日常操作

一切都由 GitHub Actions 驱动。出问题时，可以在机器上用同一个引擎排查：

```console
$ tailnet-preview list
main       3f6fd43dd417  https://myapp-main.tail1234.ts.net
pr-42      d69d97d1ab55  https://myapp-pr-42.tail1234.ts.net
$ tailnet-preview doctor pr-42      # 容器、Tailscale、HTTPS、上游服务、日志
$ tailnet-preview reset pr-42       # 重新复制基线
```

部署失败时，PR 评论会写明原因和处理办法。所有原因见 [troubleshooting.zh-CN.md](docs/troubleshooting.zh-CN.md)，所有命令见 [design.zh-CN.md](docs/design.zh-CN.md#6-命令)。

## 国内网络

主机需要能稳定访问 Docker Hub：基础镜像，以及 postgres、tailscale 等镜像都从那里拉取。国内到 Docker Hub 的连接经常被重置，引擎虽然会逐个拉取并重试，但链路本身不通时重试也没用。请给 Docker 守护进程配置代理（`systemctl edit docker` 加上 `HTTPS_PROXY`）或你信任的镜像加速（`/etc/docker/daemon.json` 的 `registry-mirrors`），然后用 `docker pull postgres:17-alpine` 验证，见 [host-setup.zh-CN.md](docs/host-setup.zh-CN.md#2-主机一次)。拉下来的镜像会留在主机上。

## 常见问题

| 现象                                                         | 处理                                                                                                          |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| PR 评论说部署失败，原因 `https`；浏览器连上后 TLS 握手被重置 | 在 Tailscale 管理后台 DNS 页开启 MagicDNS 和 HTTPS 证书，然后执行 `tailnet-preview compose <环境> restart ts` |
| 评论说已就绪，但浏览器提示找不到网站                         | 你访问用的设备没开 Tailscale 的 DNS（Use Tailscale DNS）                                                      |
| 拉镜像时 `connection reset by peer`                          | 见上面的"国内网络"                                                                                            |
| 第一个 PR 没有从基线复制                                     | 正常：默认分支还没接入。合并后，之后的 PR 都会复制基线                                                        |

完整的故障排查表见 [troubleshooting.zh-CN.md](docs/troubleshooting.zh-CN.md)。

## 文档

按用到的先后顺序：

1. [主机准备](docs/host-setup.zh-CN.md)：tailnet、机器、runner，以及可选的共享入口
2. [配置项目](docs/configuring.zh-CN.md)：一步步写好 `.tailnet-preview/`
3. [仓库设置](docs/repository-setup.zh-CN.md)：仓库变量、工作流、第一个 PR
4. [故障排查](docs/troubleshooting.zh-CN.md)：现象、原因、处理
5. [安全模型](docs/security.zh-CN.md)：运行它意味着信任什么，以及公开仓库
6. [设计](docs/design.zh-CN.md)：工作原理、所有设置和命令、原因码

每份文档都有英文版，以英文版为准，两者在开头互相链接。

## 状态

1.0 之前（0.x）。它在脱胎的那个多租户 SaaS 项目里日常使用，跑在一台家用主机上。次版本仍可能改变配置或行为，所以请固定完整版本号（`@v0.3.0`），升级前先看 [CHANGELOG](CHANGELOG.md)。只支持 Linux 主机。来自 fork 的 PR 一律不部署；公开仓库还要为 runner 做额外设置（[安全模型](docs/security.zh-CN.md)）。

## 参与贡献

见 [CONTRIBUTING.zh-CN.md](CONTRIBUTING.zh-CN.md)。集成测试用真实的引擎和 Docker，只把 Tailscale 换成假的，所以大多数改动不需要 tailnet 就能测试。

## 许可证

[MIT](LICENSE)

Tailscale 是 Tailscale Inc. 的商标。本项目与 Tailscale 没有关联，也未获其认可。
