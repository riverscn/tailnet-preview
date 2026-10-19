# tailnet-preview

**在你自己的主机上，为每个 PR 起一套试用环境，只能通过你的 tailnet 访问。**

[English](README.md)

开一个 PR，你自己的机器上就会起一套完整的应用：独立的容器、**从常驻基线复制来的数据**，以及一个形如
`https://myapp-pr-42.your-tailnet.ts.net` 的 HTTPS 地址，只有你 [Tailscale](https://tailscale.com) 网络里的设备能打开。
往 PR 推送会原地升级，关闭 PR 环境就删除。PR 上的评论会给出访问地址；部署失败时，会写明原因和处理步骤。

```
pull request ──▶ GitHub Actions（你机器上的 self-hosted runner）
                   │  构建镜像 · 复制基线数据库 · 执行迁移 · 启动服务
                   ▼
   https://myapp-pr-42.<tailnet>.ts.net      只在 tailnet 内可访问，没有公网入口
```

## 为什么

- **贴近真实的升级。** PR 环境从基线数据的副本开始，再执行这个 PR 的迁移，和上线时一样。只在已有数据上才会出现的问题，合并前就能发现。
- **天然私有。** 每个环境都是一个带 HTTPS 的 Tailscale 节点。没有公网端口，也不需要隧道或登录页。
- **便宜。** 任何装了 Docker 的 Linux 机器都行，比如家里的小主机或一台闲置虚拟机。一台机器可以服务多个项目，而且不用为某个项目单独设置主机。
- **工具朴素，不挑技术栈。** 只用 Bash 和 Docker Compose。数据库就是你自己 `compose.yaml` 里的一个服务，用什么数据库都行；数据按 Docker 数据卷复制。没有集群，也没有控制面。

## 原理

| 环境           | 数据                                                             | 生命周期       |
| -------------- | ---------------------------------------------------------------- | -------------- |
| `main`，即基线 | 第一次创建时执行迁移并灌演示数据，之后每次推送默认分支时原地升级 | 常驻           |
| `pr-<编号>`    | 复制基线的数据卷（数据库、上传文件等），再执行 PR 的迁移         | 到 PR 关闭为止 |

每个环境是一个 Docker Compose 项目，由你的服务（包括数据库）加一个 Tailscale sidecar 组成，sidecar 提供 HTTPS 并代理到你的服务。fork 时，引擎让基线暂停几秒，复制你在 `DATA_VOLUMES` 里列出的数据卷。详见 [docs/design.md](docs/design.md)（英文）。

## 快速开始

1. **一次性准备 tailnet 和主机：** 开启 HTTPS 证书，在访问策略里加上 `tag:preview`，创建 OAuth 客户端，装好 Docker 和标签为 `preview` 的 self-hosted runner。
   → [docs/host-setup.md](docs/host-setup.md)
2. **在项目里加上 `.tailnet-preview/`：** 项目原有的 compose 文件原样复用，只需补充：要构建的镜像、网站入口、应用自己的地址、模拟服务，以及迁移和演示数据任务。`tailnet-preview init` 生成初稿，`tailnet-preview validate` 检查配置。分步骤的配置指南（英文）按人和 AI agent 都能照做的方式写成：→ [docs/configuring.md](docs/configuring.md)
3. **加一个工作流** 调用这个 action：

   ```yaml
   - uses: actions/checkout@v4
   - uses: riverscn/tailnet-preview@v0.1.0
     with:
       command: deploy
       language: zh-CN # PR 评论用中文
   ```

   完整的工作流（部署、关闭时删除、每晚备份和清理、手动命令）见 [docs/project-setup.md](docs/project-setup.md#4-add-the-workflow)。

[example](example/) 是一个完整的最小项目：本仓库在每个 PR 上都部署它，作为端到端测试。

## 国内网络

主机需要能稳定访问 Docker Hub：基础镜像，以及 postgres、tailscale 等镜像都从那里拉取。国内到 Docker Hub 的连接经常被重置，引擎虽然会逐个拉取并重试，但链路本身不通时重试也没用。请给 Docker 守护进程配置代理（`systemctl edit docker` 加上 `HTTPS_PROXY`）或你信任的镜像加速（`/etc/docker/daemon.json` 的 `registry-mirrors`），然后用 `docker pull postgres:17-alpine` 验证，见 [docs/host-setup.md](docs/host-setup.md#2-the-machine-once)。拉下来的镜像会留在主机上。

## 常见问题

| 现象                                                         | 处理                                                                                                          |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| PR 评论说部署失败，原因 `https`；浏览器连上后 TLS 握手被重置 | 在 Tailscale 管理后台 DNS 页开启 MagicDNS 和 HTTPS 证书，然后执行 `tailnet-preview compose <环境> restart ts` |
| 评论说已就绪，但浏览器提示找不到网站                         | 你访问用的设备没开 Tailscale 的 DNS（Use Tailscale DNS）                                                      |
| 拉镜像时 `connection reset by peer`                          | 见上面"国内网络"                                                                                              |
| 第一个 PR 没有从基线复制                                     | 正常：默认分支还没接入。合并后，之后的 PR 都会复制基线                                                        |

完整的故障排查表见 [docs/troubleshooting.md](docs/troubleshooting.md)。

## 安全

部署 PR 等于在主机上运行 PR 的代码，而 runner 用户在 `docker` 组里，相当于主机的 root。所以只适合私有仓库、推送权限受控的情况。来自 fork 仓库的 PR 一律不部署。建议用一台专用虚拟机做试用主机，也不要把真实的生产数据放进试用环境。详见 [docs/security.md](docs/security.md)。

## 许可证

[MIT](LICENSE)

Tailscale 是 Tailscale Inc. 的商标。本项目与 Tailscale 没有关联，也未获其认可。
