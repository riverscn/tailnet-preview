# 用 AI agent 接入

[English](agent-guide.md)

你可以把本仓库的地址交给一个 AI 编程助手，让它为你的项目设置试用环境。这份指南就是给这个 Agent 的操作手册：它把设置分成几个阶段，说明每一步由谁来做，并为每一步给出 Agent 自己能运行的检查。具体操作仍写在其他指南里；这一份说明怎么用它们、按什么顺序。

分工：

| 标记      | 含义                                                                                                         |
| --------- | ------------------------------------------------------------------------------------------------------------ |
| **人**    | 只有人能做：在浏览器里登录 Tailscale、GitHub 或 DNS 服务商，创建或粘贴密钥，以及 Agent 没有权限时的 `sudo`。 |
| **Agent** | Agent 自己做：它有这台主机上的 shell、以这个人身份登录的 `gh` CLI，以及签出的项目仓库。                      |
| **先问**  | Agent 来做，但要等对方同意：这些步骤会改动对方的仓库或账号（仓库变量、runner、PR）。                         |

## 给 Agent 的规则

1. **绝不在对话里索要密钥，也绝不打印密钥。** 密钥（Tailscale 的 OAuth 客户端密钥、DNS 的 API token）由人自己写进步骤指定的文件或 GitHub 设置里。检查密钥是否就位时不要显示它，例如 `grep -c '^TS_OAUTH_SECRET=tskey-client-' ~/.config/tailnet-preview/env` 输出 `1`。
2. **把人要做的步骤合在一起。** 在需要人参与的阶段开始前，把这个阶段里对方要做的所有事列成一个带编号的清单，写明具体页面和要填的值。等对方说做完了，再运行检查。不要一次只问一个问题。
3. **改动对方的东西之前先问。** 标为**先问**的步骤会改动对方的仓库或账号；说明要做什么改动，等对方同意。
4. **不要改变项目在其他地方的运行方式。** 所有试用环境专用的内容都放进 `.tailnet-preview/` 和工作流文件（[configuring.zh-CN.md](configuring.zh-CN.md)）。
5. **绝不让试用环境接触真实用户数据**，也绝不把生产环境的凭据复制进配置。
6. **破坏性命令要先得到同意：**`destroy`、`reset main`、列表为空的 `prune`、删除数据卷或 `~/previews/`。

## 第 0 阶段：先弄清楚的事

在一条消息里问对方：

- 哪个仓库（`owner/name`）要有试用环境，它是私有的吗？公开仓库要先按 [security.zh-CN.md](security.zh-CN.md) 设置。
- 由哪台 Linux 主机运行，Agent 在那里有没有 shell（Agent 就运行在它上面，还是能 `ssh` 过去）？Agent 的用户有没有 `sudo`？
- 这台主机的 tailnet 是否已经为 tailnet-preview 设置好（已经有别的项目在用）？如果是，跳过第 1 到 3 阶段，改为检查它们。
- 模式：`sidecar`（默认，除了 Tailscale 什么都不需要）还是 `shared`（需要对方自己的一个域名；见 [README](../README.zh-CN.md#可选项)）。除非对方有理由，先用 `sidecar`。

在主机上检查已有的东西：`docker compose version`、`docker ps`，如果有 `tailnet-preview` 命令就运行 `tailnet-preview host-check`，并在 `gh` 所在的地方运行 `gh auth status`。

## 第 1 阶段：tailnet（人）

把 [host-setup.zh-CN.md 第 1 节](host-setup.zh-CN.md#1-tailnet一次)里的这些步骤交给对方，访问策略替对方填好。端口用 443，加上项目 `PORTS` 里的每个端口（如果 `.tailnet-preview/config.env` 已经存在，就读它；示例项目用的是 8025）：

1. Tailscale 管理后台 → DNS：开启 MagicDNS 和 HTTPS 证书。
2. Access controls：把 `tag:preview` 加进 `tagOwners`，再为这些端口加一条访问规则，同 host-setup 第 1.2 步。把要加的 JSON 行原样交给对方。
3. Settings → Trust credentials → Credential → OAuth：权限范围 Auth Keys (Write)，标签 `tag:preview`。客户端密钥（`tskey-client-…`）留到第 3 阶段用；不要发给 Agent。

检查：Agent 看不到 tailnet 的设置；第 6 阶段的部署会证明它们没问题。请对方确认这三项都做完了。

## 第 2 阶段：主机（Agent；`sudo` 步骤可能要人来做）

按 [host-setup.zh-CN.md 第 2 节](host-setup.zh-CN.md#2-主机一次)的第 2.1 到 2.3 步和第 2.5 步做，以将来运行 runner 的用户执行：

| 步骤                   | 谁来做                      | 检查                                                            |
| ---------------------- | --------------------------- | --------------------------------------------------------------- |
| 带 Compose 的 Docker   | Agent，没有 sudo 时由人来做 | `docker compose version`                                        |
| 用户加入 `docker` 组   | Agent，没有 sudo 时由人来做 | `docker ps` 不加 `sudo` 能运行（在新的登录 shell 里）           |
| 能访问 Docker Hub      | Agent                       | `docker pull postgres:17-alpine`；失败时见 host-setup 第 2.3 步 |
| `tailnet-preview` 命令 | Agent                       | `tailnet-preview version`                                       |

## 第 3 阶段：Tailscale 密钥（人）

请对方在主机上、以 runner 的用户运行下面的命令，把占位符换成第 1 阶段得到的客户端密钥（host-setup 第 2.4 步）：

```bash
mkdir -p ~/.config/tailnet-preview
printf 'TS_OAUTH_SECRET=tskey-client-...\n' > ~/.config/tailnet-preview/env
chmod 600 ~/.config/tailnet-preview/env
```

检查（Agent）：`grep -c '^TS_OAUTH_SECRET=tskey-client-' ~/.config/tailnet-preview/env` 输出 `1`，并且 `tailnet-preview host-check` 没有报 `FAIL`。

## 第 4 阶段：runner（先问）

runner 用一个一次性 token 注册；对方是仓库管理员时，`gh` 能获取这个 token。在主机上以 runner 的用户注册，放在它自己的目录里（[host-setup.zh-CN.md 第 3 节](host-setup.zh-CN.md#3-runner每个仓库一次或每个组织一次)）：

```bash
REPO=owner/name                                        # 对方的仓库
VERSION=$(gh api repos/actions/runner/releases/latest --jq '.tag_name | ltrimstr("v")')
ARCH=$(uname -m | sed 's/x86_64/x64/; s/aarch64/arm64/')
mkdir -p ~/actions-runner-${REPO#*/} && cd ~/actions-runner-${REPO#*/}
curl -fsSL "https://github.com/actions/runner/releases/download/v$VERSION/actions-runner-linux-$ARCH-$VERSION.tar.gz" | tar xz
TOKEN=$(gh api -X POST "repos/$REPO/actions/runners/registration-token" --jq .token)
./config.sh --unattended --url "https://github.com/$REPO" --token "$TOKEN" --labels preview --name "$(hostname)-${REPO#*/}"
sudo ./svc.sh install && sudo ./svc.sh start          # Agent 没有 sudo 时由人来做
```

如果 `gh` 在别处运行（不在这台主机上），就在那里获取 token 再传过来；它一小时后失效。检查：`gh api repos/$REPO/actions/runners --jq '.runners[] | [.name, .status, (.labels | map(.name) | join(","))]'` 列出这个 runner，状态为 `online`，标签有 `preview`。

## 第 5 阶段：项目配置（Agent）

在项目仓库的一个分支上，按 [configuring.zh-CN.md](configuring.zh-CN.md) 从头到尾做一遍。它是为 Agent 写的：每一步都说明去哪里找、写什么，最后有一份检查清单。

检查：`tailnet-preview validate` 报告 `0 error(s)`，并且 configuring.zh-CN.md 第 9 步的本地冒烟测试通过。把警告和你没能解决的 `TODO` 告诉对方。

## 第 6 阶段：仓库和第一个 PR（先问）

1. 在同一个分支上，按 [repository-setup.zh-CN.md 第 2 节](repository-setup.zh-CN.md#2-添加工作流)添加 `.github/workflows/preview.yml`。只有对方要求时才设置 `drafts` 和 `branches`。
2. 打开开关：`gh variable set PREVIEW_ENABLED --body true --repo "$REPO"`。
3. 提交、推送并开 PR：`gh pr create`。

检查：用 `gh pr checks --watch` 等到部署任务结束，再用 `gh pr view --comments` 读评论。评论会显示**试用环境已就绪**和地址，或者显示失败的原因和处理办法（[troubleshooting.zh-CN.md](troubleshooting.zh-CN.md)）。在主机上，`tailnet-preview doctor pr-<number>` 会显示详细情况。

第一个 PR 会得到全新灌入的演示数据；它合并时才会创建基线（[repository-setup.zh-CN.md 第 3 节](repository-setup.zh-CN.md#3-第一个-pr)）。请对方从 tailnet 里的一台设备打开这个地址：Agent 通常做不到。

## 可选：共享入口

只在对方选了 `shared` 时做（[host-setup.zh-CN.md 第 4 节](host-setup.zh-CN.md#4-共享入口可选每台主机一次)）：

1. **人：** 创建 DNS 服务商的 API token（Cloudflare：Edit zone DNS，只针对那一个区域），按那一步的说明加到 `~/.config/tailnet-preview/env` 里。不含密钥的那几行（`TP_INGRESS=shared`、`TP_INGRESS_DOMAIN=…`、`TP_INGRESS_DNS_PROVIDER=…`、`TP_INGRESS_DNS_ENV=…`、`TP_INGRESS_ACME_EMAIL=…`）可以由 Agent 在征得同意后写入。
2. **Agent：** 运行 `tailnet-preview ingress up`，记下它打印的地址。
3. **人：** 在 Tailscale 管理后台里，为这个域名加一条指向该地址的 split DNS，并在访问规则里加上 53 端口。
4. **Agent，检查：** `tailnet-preview doctor <env>` 显示证书为 `issued`；如果 Agent 有一台 tailnet 里的设备，在那里运行 `dig +short anything.<domain> @<address>` 会输出这个地址。然后重新部署各个环境。

## 日常维护

对方请 Agent 照看试用环境时，Agent 能做的事：

| 任务                 | 命令或位置                                                                                                                                           |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| 部署为什么失败？     | `gh pr view <n> --comments`；`gh run view <run> --log-failed`；`tailnet-preview doctor pr-<n>`；[troubleshooting.zh-CN.md](troubleshooting.zh-CN.md) |
| 主机上有哪些环境？   | `tailnet-preview list`                                                                                                                               |
| 重建一个 PR 的环境   | （先问）`tailnet-preview destroy pr-<n>`，然后重新运行这个 PR 的部署任务：`gh run rerun <run>`                                                       |
| 重新创建基线         | （先问）用工作流的 manual 任务执行 `reset main`：`gh workflow run preview.yml -f args='reset main'`                                                  |
| 更新 tailnet-preview | （先问）读过 [CHANGELOG.md](../CHANGELOG.md) 之后，修改工作流里固定的版本号                                                                          |

所有命令见 [design.zh-CN.md 第 6 节](design.zh-CN.md#6-命令)。
