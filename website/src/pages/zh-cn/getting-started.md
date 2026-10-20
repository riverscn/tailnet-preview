---
layout: ../../layouts/Doc.astro
lang: zh-cn
title: 快速开始
description: 用 tailnet-preview 四步为每个 PR 搭好试用环境。
---

# 快速开始

四步就能让每个 PR 都有一套私有试用环境。第一步每台机器做一次，其余每个项目做一次。每一步都链接到仓库里的完整指南，以那里为准。

> **在用 AI 编程助手？** 在你的项目里打开它，粘贴这段提示词。它会按 [docs/agent-guide.zh-CN.md](https://github.com/riverscn/tailnet-preview/blob/main/docs/agent-guide.zh-CN.md) 来做，并告诉你哪些步骤只能由你亲自完成。
>
> ```text
> 为这个项目接入 tailnet-preview（https://github.com/riverscn/tailnet-preview），让每个 PR 都在我的主机上
> 有自己的试用环境。按它的 docs/agent-guide.zh-CN.md 来做。需要我亲自做的步骤一次性告诉我，永远不要在聊天里
> 向我索要密钥。
> ```
>
> 想让助手以后也记得这些（接入下一个项目、排查部署失败），安装 skill：`npx skills add riverscn/tailnet-preview`。

## 需要准备什么

- 一台**装了 Docker、一直开着的 Linux 机器**，留出几 GB 空闲内存（每个环境都运行一套完整的服务，典型 Web 应用约 400 MB）。
- 一个 **Tailscale 账号**，免费套餐就够用。
- 一个你能管理的 **GitHub 仓库**，最好是私有的；公开仓库要按[安全说明](https://github.com/riverscn/tailnet-preview/blob/main/docs/security.zh-CN.md)采取措施。能往仓库推送的人，都能在这台机器上运行代码。
- 一个**能在容器里运行**的应用，最好已经有 compose 文件，并且从环境变量读取自己的地址和数据库连接。

## 1. 准备机器和 tailnet

只做一次，约 30 分钟。完整指南：[host-setup.zh-CN.md](https://github.com/riverscn/tailnet-preview/blob/main/docs/host-setup.zh-CN.md)。

在 Tailscale 里开启 HTTPS 证书、加一条 `tag:preview` 访问规则、创建 OAuth 客户端。在机器上安装带 Compose 插件的 Docker Engine，保存 OAuth 客户端密钥，再装好 `tailnet-preview` 命令：

```bash
mkdir -p ~/.config/tailnet-preview
printf 'TS_OAUTH_SECRET=tskey-client-...\n' > ~/.config/tailnet-preview/env
chmod 600 ~/.config/tailnet-preview/env

git clone --depth 1 https://github.com/riverscn/tailnet-preview ~/tailnet-preview
echo 'export PATH="$HOME/tailnet-preview/bin:$PATH"' >> ~/.bashrc && . ~/.bashrc
tailnet-preview host-check
```

然后在这台机器上注册一个 GitHub Actions [self-hosted runner](https://docs.github.com/actions/hosting-your-own-runners)，额外标签填 `preview`。做完后，`tailnet-preview host-check` 不再报 `FAIL`，仓库的 Settings → Actions → Runners 里能看到这个 runner 处于 **Idle**。

在国内，还要先给 Docker 配好代理或镜像加速，让 `docker pull postgres:17-alpine` 能成功，见 [README 的国内网络一节](https://github.com/riverscn/tailnet-preview/blob/main/README.zh-CN.md#国内网络)。

## 2. 在 `.tailnet-preview/` 里描述你的应用

每个项目一次。完整指南：[configuring.zh-CN.md](https://github.com/riverscn/tailnet-preview/blob/main/docs/configuring.zh-CN.md)。

内容是一个小小的 `config.env` 加一个 compose 覆盖文件：要构建哪些镜像、浏览器打开哪个服务、应用自己的地址、模拟服务、迁移和演示数据任务。项目原有的 compose 文件不用改。在项目根目录执行：

```bash
tailnet-preview init       # 生成 .tailnet-preview/config.env 和 compose.yaml，猜测的地方标了 TODO
tailnet-preview validate   # 检查配置，不构建也不启动任何东西
```

修掉每一个 `ERROR`，读一读每一个 `WARN`。[example](https://github.com/riverscn/tailnet-preview/blob/main/example/) 是一个完整的最小项目：本仓库在每个 PR 上都部署它，作为端到端测试。

## 3. 为仓库打开试用环境

几分钟。完整指南：[repository-setup.zh-CN.md](https://github.com/riverscn/tailnet-preview/blob/main/docs/repository-setup.zh-CN.md)。

- 在仓库的 Settings → Secrets and variables → Actions → **Variables** 里，新建变量 `PREVIEW_ENABLED`，值为 `true`。
- 从 [repository-setup.zh-CN.md](https://github.com/riverscn/tailnet-preview/blob/main/docs/repository-setup.zh-CN.md#2-添加工作流) 复制工作流到 `.github/workflows/preview.yml`。其中的任务这样使用这个 action：

```yaml
runs-on: [self-hosted, preview]
steps:
  - uses: actions/checkout@v7
  - uses: riverscn/tailnet-preview@v0.4.0
    with:
      command: deploy
      language: zh-CN # PR 评论用中文
```

请锁定完整版本号，升级前先读[更新日志](https://github.com/riverscn/tailnet-preview/blob/main/CHANGELOG.md)：1.0 之前，次版本仍可能改变配置或行为。

## 4. 开一个 PR

加入 `.tailnet-preview/` 和工作流的那个 PR 会得到一个全新灌入演示数据的环境，因为这时还没有基线。合并它就会创建基线。从此以后，每个 PR 都从基线的副本开始，评论里会给出地址：

> **试用环境已就绪**（从基线复制）
>
> | 服务 | 地址                                    |
> | ---- | --------------------------------------- |
> | 应用 | https://myapp-pr-42.your-tailnet.ts.net |

从 tailnet 里的设备打开这个地址。部署失败时，评论会写明原因和处理办法；所有原因见 [troubleshooting.zh-CN.md](https://github.com/riverscn/tailnet-preview/blob/main/docs/troubleshooting.zh-CN.md)。

## 可选项

- **哪些 PR 和分支有环境。** 默认每个 PR 都有，草稿 PR 也一样。在工作流里，`drafts: false` 让 PR 等到 Ready for review 再部署，`branches: 'release/* feature/*'`（或 `'*'`）让匹配的分支也有自己的环境。
- **怎么访问环境。** `TP_INGRESS=sidecar`（默认）让每个环境成为独立的 Tailscale 节点。`shared` 每台机器只用一个入口，在你自己的域名上用通配符证书，环境部署完立刻能打开（[host-setup.zh-CN.md 第 4 节](https://github.com/riverscn/tailnet-preview/blob/main/docs/host-setup.zh-CN.md)）。

## 延伸阅读

1. [主机准备](https://github.com/riverscn/tailnet-preview/blob/main/docs/host-setup.zh-CN.md)：tailnet、机器、runner，以及可选的共享入口
2. [配置项目](https://github.com/riverscn/tailnet-preview/blob/main/docs/configuring.zh-CN.md)：一步步写好 `.tailnet-preview/`
3. [仓库设置](https://github.com/riverscn/tailnet-preview/blob/main/docs/repository-setup.zh-CN.md)：仓库变量、工作流、第一个 PR
4. [排障](https://github.com/riverscn/tailnet-preview/blob/main/docs/troubleshooting.zh-CN.md)：现象、原因、处理办法
5. [安全](https://github.com/riverscn/tailnet-preview/blob/main/docs/security.zh-CN.md)：运行它意味着信任什么，以及公开仓库
6. [设计](https://github.com/riverscn/tailnet-preview/blob/main/docs/design.zh-CN.md)：工作原理、所有设置和命令、失败代码
