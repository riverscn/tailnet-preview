# 主机准备

[English](host-setup.md)

试用主机是通用的：下面的步骤每个 tailnet 做一次，每台主机做一次。之后接入新项目不需要登录主机（见 [repository-setup.zh-CN.md](repository-setup.zh-CN.md)）。

过程中你会拿到一个密钥：第 1.3 步的 **OAuth 客户端密钥**。从那以后它叫 `TS_OAUTH_SECRET`；在第 2.4 步用到它之前，把它保存在安全的地方。

## 1. tailnet（一次）

以 tailnet 管理员的身份登录 [Tailscale 管理后台](https://login.tailscale.com/admin)，然后：

1. **DNS 页面：** 开启 **MagicDNS**，然后在 **HTTPS Certificates** 下选 **Enable HTTPS**。不开的话，浏览器能连上，但 TLS 握手会被重置，部署失败，原因是 `https`。
2. **Access controls 页面**（访问策略文件的编辑器）：定义标签 `tag:preview`，并且只允许你自己的设备访问试用节点，端口是环境提供服务的端口（443，加上各项目用到的 `PORTS`；示例项目给邮件捕获工具用了 8025）。试用节点自己不获得任何访问权限。把下面两项加进访问策略；如果 `tagOwners` 或 `acls` 已经存在，就把这几行加到它们里面：

   ```jsonc
   "tagOwners": { "tag:preview": ["autogroup:admin"] },
   "acls": [
     { "action": "accept", "src": ["autogroup:member"], "dst": ["tag:preview:443,8025"] }
   ]
   ```

   `autogroup:member` 指你 tailnet 里的所有用户。如果你的访问策略用的是 `grants` 而不是 `acls`，写一条等价的 grant。进行下一步之前先保存访问策略：OAuth 客户端只能使用访问策略里定义过的标签。

3. **OAuth 客户端：** Settings → [Trust credentials](https://login.tailscale.com/admin/settings/trust-credentials) → Credential → OAuth。权限范围选 **Auth Keys: Write**，标签选 **`tag:preview`**，然后生成。复制**客户端密钥**，它以 `tskey-client-` 开头。它只显示一次；这就是你的 `TS_OAUTH_SECRET`。每个环境用它注册自己的 Tailscale 节点：基线的节点是常驻节点，PR 的节点是临时节点，删除后自动消失。

要用别的标签，在第 2.4 步保存密钥的地方加一行 `TS_TAGS=tag:something`，并相应修改访问策略。

## 2. 主机（一次）

任何装了 Docker 的 x86_64 或 arm64 Linux 主机都行。建议用一台专用于试用环境的虚拟机（[security.zh-CN.md](security.zh-CN.md)）。一个典型 Web 应用的环境按大约 400 MB 内存来规划；可用内存低于 `MIN_FREE_MB`（默认 1.5 GB）时，引擎不再创建新的环境。

下面的所有步骤都在这台主机上的终端里执行（例如通过 SSH）。

1. **选定运行 GitHub runner 的用户**：可以是你自己的账号，也可以是专用账号，例如 `preview`。剩下的步骤都以这个用户执行。各环境、它们的数据和配置都放在这个用户的主目录里。
2. **安装 Docker Engine 和 Compose 插件**（[Docker 的安装说明](https://docs.docker.com/engine/install/)），以及 `git` 和 `flock`（`flock` 在 `util-linux` 里，通常已经装好）。让这个用户不用 `sudo` 就能运行 Docker，然后退出登录再重新登录：

   ```bash
   sudo usermod -aG docker "$USER"
   ```

   检查：`docker compose version` 和 `docker ps` 不加 `sudo` 都能运行。主机上**不需要**安装 Tailscale：各环境自带。

3. **确保主机能从 Docker Hub 拉取镜像。** `docker pull postgres:17-alpine` 必须成功。如果到 Docker Hub 的连接会被重置（在中国大陆很常见），给 Docker 守护进程配置一次：
   - 代理：`sudo systemctl edit docker`，加上
     ```ini
     [Service]
     Environment="HTTPS_PROXY=http://proxy.example:3128"
     Environment="NO_PROXY=localhost,127.0.0.1"
     ```
   - 或者你信任的镜像加速，写在 `/etc/docker/daemon.json`：`{ "registry-mirrors": ["https://mirror.example"] }`

   然后执行 `sudo systemctl restart docker`，再拉取一次。引擎会重试拉取，但链路不通时重试也没用。

4. **保存 `TS_OAUTH_SECRET`**（第 1.3 步的客户端密钥）到主机配置文件里。把 `tskey-client-...` 换成你的密钥：

   ```bash
   mkdir -p ~/.config/tailnet-preview
   printf 'TS_OAUTH_SECRET=tskey-client-...\n' > ~/.config/tailnet-preview/env
   chmod 600 ~/.config/tailnet-preview/env
   ```

   这个文件保存这台主机上所有项目共用的设置（第 4 节还会往里加）。也可以不写在这里，而是设置名为 `TS_OAUTH_SECRET` 的仓库（或组织）密钥；它的优先级更高。

5. **获取 `tailnet-preview` 命令并检查主机。** 这个命令就是本仓库 `bin/` 下的引擎；GitHub action 自带一份，所以这一份是给你在主机上用的：

   ```bash
   git clone --depth 1 https://github.com/riverscn/tailnet-preview ~/tailnet-preview
   echo 'export PATH="$HOME/tailnet-preview/bin:$PATH"' >> ~/.bashrc && . ~/.bashrc
   tailnet-preview host-check
   ```

   每一行都必须以 `ok` 或 `info` 开头。`FAIL` 行会说明要修什么。以后要更新这个命令，执行 `git -C ~/tailnet-preview pull`。

## 3. runner（每个仓库一次，或每个组织一次）

工作流的任务运行在这台主机上的 [self-hosted runner](https://docs.github.com/actions/hosting-your-own-runners) 上，标签为 `preview`。你需要哪一种：

- **个人账号下的仓库**只能用仓库级 runner。每个仓库注册一个，各自放在主机上单独的目录里；一台主机上跑多个 runner 没有问题。
- **组织下的仓库**可以共用一个组织级 runner（在组织的 Settings → Actions → Runners 里）；之后接入新项目完全不用再注册 runner。

以第 2.1 步选定的用户注册 runner：

1. 在 GitHub 上打开仓库：Settings → Actions → Runners → **New self-hosted runner**，选 Linux 和主机的架构。GitHub 会显示两组命令，**Download** 和 **Configure**。
2. 在主机上执行这些命令，每个 runner 用一个新目录，例如 `~/actions-runner-<仓库名>`，而不是命令里建议的 `actions-runner`。`./config.sh` 会问几个问题：都按回车用默认值，只有 **additional labels** 要输入 `preview`。
3. 把它安装成服务并启动，这样重启后它也会运行：

   ```bash
   sudo ./svc.sh install && sudo ./svc.sh start
   ```

检查：仓库的 Settings → Actions → Runners 里列出了这个 runner，状态为 **Idle**，标签是 `self-hosted`、`Linux` 和 `preview`。

## 4. 共享入口（可选，每台主机一次）

默认情况下，每个环境是一个独立的 Tailscale 节点，有自己的证书，在部署时申请；这次申请经常失败（docs/design.md 第 7 节）。用共享入口时，主机只有一个 Tailscale 节点和一张你自己域名的通配符证书，环境地址形如 `https://<项目>-<环境>.<你的域名>`。设计见 [design.zh-CN.md 第 10 节](design.zh-CN.md#10-共享入口每台主机一个一张通配符证书)。需要一个域名，它的 DNS 托管在有 API 的服务商（Cloudflare、阿里云 DNS、DNSPod……任何 [lego 支持的服务商](https://go-acme.github.io/lego/dns/)）。下面以 Cloudflare 和 `preview.example.com` 为例：

1. **DNS token。** Cloudflare → My Profile → API Tokens → Create Token → 模板选 **Edit zone DNS**；在 Zone Resources 下只选你的区域（`example.com`）。复制这个 token，它就是下面 `CF_DNS_API_TOKEN` 的值。Let's Encrypt 的验证记录写在 `_acme-challenge.preview.example.com` 下；区域里别的记录都不会改，也没有任何公网记录指向这台主机。
2. **设置，** 加到 `~/.config/tailnet-preview/env`（第 2.4 步创建的文件）里，写在 `TS_OAUTH_SECRET` 那一行下面。把域名、token 和邮箱地址换成你自己的：

   ```sh
   TP_INGRESS=shared
   TP_INGRESS_DOMAIN=preview.example.com
   TP_INGRESS_DNS_PROVIDER=cloudflare
   TP_INGRESS_DNS_ENV=CF_DNS_API_TOKEN
   CF_DNS_API_TOKEN=...
   TP_INGRESS_ACME_EMAIL=you@example.com
   ```

   用其他服务商时，填它在 lego 里的名字，以及它的 lego 页面列出的变量。主机需要 `/dev/net/tun`（`tailnet-preview host-check` 会检查）。

3. **启动入口**，记下它的地址：`tailnet-preview ingress up` 会打印出来（`ingress up at 100.x.y.z`），下一步要用到它。它也会以名为 `tailnet-preview-<host>` 的主机出现在 Tailscale 管理后台里。通配符证书在后台申请；`tailnet-preview doctor <env>` 会显示它是否已签发。
4. **tailnet**（管理后台）：
   - **Split DNS：** DNS 页面 → Nameservers → Add nameserver → Custom：填第 3 步得到的入口地址，打开 **Restrict to domain**，填 `preview.example.com`。这样，所有使用 Tailscale DNS 的设备都能在 tailnet 内解析这些域名，不需要公网记录（有些路由器会过滤这类记录）。
   - **访问策略：** 在第 1.2 步的访问规则里加上 53 端口，让你的设备能向入口查询域名：`"dst": ["tag:preview:53,443,8025"]`。
5. **重新部署**每个已经存在的环境（向它的 PR 推送一次；基线则推送到默认分支，或者用工作流的 manual 任务执行 `reset main`）。之后每个环境不再有自己的 Tailscale 节点，改由入口提供服务。常驻节点（各基线的节点）之后会作为离线主机留在管理后台里，在那里删除它们。

## 文件和资源的位置

| 路径或名称                      | 内容                                                                    |
| ------------------------------- | ----------------------------------------------------------------------- |
| `~/.config/tailnet-preview/env` | 所有项目共用的 `TS_OAUTH_SECRET`，以及可选的 `TS_TAGS` 和共享入口的设置 |
| `~/previews/<project>/`         | 生成的密钥、各环境的目录、基线备份、锁                                  |
| `~/previews/.ingress/`          | 共享入口的文件（第 4 节）                                               |
| `~/tailnet-preview/`            | `tailnet-preview` 命令（第 2.5 步）                                     |
| `<project>-<env>-*`             | 一个环境的容器                                                          |
| `<project>-<env>_*`             | 一个环境的数据卷                                                        |

彻底移除一个项目：先删除它的各个环境（`tailnet-preview destroy pr-N`、`tailnet-preview destroy main --force`），再删除 `~/previews/<project>/`。
