# 主机准备

[English](host-setup.md)

试用主机是通用的：下面的步骤每个 tailnet 做一次，每台主机做一次。之后接入新项目不需要登录主机（见 [project-setup.zh-CN.md](project-setup.zh-CN.md)）。

## 1. tailnet（一次）

在 [Tailscale 管理后台 ](https://login.tailscale.com/admin)：

1. **DNS：** 开启 **MagicDNS**，然后在 **HTTPS Certificates** 下选 **Enable HTTPS**。不开的话，浏览器能连上，但 TLS 握手会被重置，部署失败，原因是 `https`。
2. **访问策略（Access controls）：** 定义标签，只允许你自己的设备访问试用节点，端口是环境提供服务的端口（443，加上各项目用到的 `PORTS`）。试用节点自己不获得任何访问权限：

   ```jsonc
   "tagOwners": { "tag:preview": ["autogroup:admin"] },
   "acls": [
     { "action": "accept", "src": ["autogroup:member"], "dst": ["tag:preview:443,8025"] }
   ]
   ```

   如果你的访问策略用的是 `grants` 而不是 `acls`，写一条等价的 grant。

3. **OAuth 客户端：** Settings → [Trust credentials](https://login.tailscale.com/admin/settings/trust-credentials) → Credential → OAuth。权限范围选 **Auth Keys: Write**，标签选 **`tag:preview`**。复制客户端密钥（`tskey-client-…`），它只显示一次。试用节点用它注册：基线的节点是常驻节点，PR 的节点是临时节点，删除后自动消失。

要用别的标签，在下面保存密钥的地方加一行 `TS_TAGS=tag:something`，并相应修改访问策略。

## 2. 主机（一次）

任何装了 Docker 的 x86_64 或 arm64 Linux 主机都行。建议用一台专用于试用环境的虚拟机（[security.zh-CN.md](security.zh-CN.md)）。一个典型 Web 应用的环境大约占 400 MB 内存；可用内存低于 `MIN_FREE_MB`（默认 1.5 GB）时，引擎拒绝创建新的 PR 环境。

1. 安装 Docker Engine 和 Compose 插件，以及 `git` 和 `flock`（util-linux）。主机上**不需要**安装 Tailscale：每个环境自带 sidecar。
2. 确保主机能稳定地从 Docker Hub 拉取镜像。如果到 Docker Hub 的连接会被重置（在中国大陆很常见），给 Docker 守护进程配置一次：
   - 代理：`systemctl edit docker`，加上
     ```ini
     [Service]
     Environment="HTTPS_PROXY=http://proxy.example:3128"
     Environment="NO_PROXY=localhost,127.0.0.1"
     ```
   - 或者你信任的镜像加速，写在 `/etc/docker/daemon.json`：`{ "registry-mirrors": ["https://mirror.example"] }`

   然后执行 `sudo systemctl restart docker`，用 `docker pull postgres:17-alpine` 验证。引擎会重试拉取，但链路不通时重试也没用。

3. 为运行 GitHub runner 的用户保存 OAuth 客户端密钥：

   ```bash
   mkdir -p ~/.config/tailnet-preview
   printf 'TS_OAUTH_SECRET=tskey-client-...\n' > ~/.config/tailnet-preview/env
   chmod 600 ~/.config/tailnet-preview/env
   ```

   也可以设置仓库（或组织）密钥 `TS_OAUTH_SECRET`，它的优先级更高。

4. 检查：

   ```bash
   git clone https://github.com/riverscn/tailnet-preview && tailnet-preview/bin/tailnet-preview host-check
   ```

## 3. runner（每个仓库一次，或每个组织一次）

工作流的任务运行在这台主机上的 [self-hosted runner](https://docs.github.com/actions/hosting-your-own-runners) 上，标签为 `preview`。

- **个人账号下的仓库**只能用仓库级 runner。每个仓库注册一个（Settings → Actions → Runners → New self-hosted runner，选 Linux），各自放在主机上单独的目录里；一台主机上跑多个 runner 没有问题。
- **组织下的仓库**可以共用一个组织级 runner，之后接入新项目完全不用再注册 runner。

配置时加上标签 `preview`，然后把它安装成服务：`sudo ./svc.sh install && sudo ./svc.sh start`。runner 的用户必须在 `docker` 组里，引擎使用的是这个用户的 `~/previews/` 和 `~/.config/tailnet-preview/`。

## 4. 共享入口（可选，每台主机一次）

默认情况下，每个环境是一个独立的 Tailscale 节点，有自己的证书，在部署时申请；这次申请经常失败（docs/design.md 第 7 节）。用共享入口时，主机只有一个 Tailscale 节点和一张你自己域名的通配符证书，环境地址形如 `https://<项目>-<环境>.<你的域名>`。设计见 [design.zh-CN.md 第 10 节 ](design.zh-CN.md#10-共享入口每台主机一个一张通配符证书)。需要一个域名，它的 DNS 托管在有 API 的服务商（Cloudflare、阿里云 DNS、DNSPod……任何 [lego 支持的服务商 ](https://go-acme.github.io/lego/dns/)）。下面以 Cloudflare 和 `preview.example.com` 为例：

1. **DNS token。** Cloudflare → My Profile → API Tokens → Create Token → 模板选 **Edit zone DNS**，区域只选 `example.com`。Let's Encrypt 的验证记录写在 `_acme-challenge.preview.example.com` 下；区域里别的记录都不会改，也没有任何公网记录指向这台主机。
2. **设置，** 写在 `~/.config/tailnet-preview/env` 里，和 `TS_OAUTH_SECRET` 放在一起：

   ```sh
   TP_INGRESS=shared
   TP_INGRESS_DOMAIN=preview.example.com
   TP_INGRESS_DNS_PROVIDER=cloudflare
   TP_INGRESS_DNS_ENV=CF_DNS_API_TOKEN
   CF_DNS_API_TOKEN=...
   TP_INGRESS_ACME_EMAIL=you@example.com
   ```

   用其他服务商时，填它在 lego 里的名字，以及它的 lego 页面列出的变量。主机需要 `/dev/net/tun`（`tailnet-preview host-check` 会检查）。

3. **启动入口**，记下它的地址：`tailnet-preview ingress up` 会打印出来（`100.x.y.z`）。通配符证书在后台申请；`tailnet-preview doctor <env>` 会显示它是否已签发。
4. **tailnet**（管理后台）：
   - **Split DNS：** DNS → Nameservers → Add nameserver → Custom：填入口的地址，并在 **Restrict to domain** 填 `preview.example.com`。这样，所有使用 Tailscale DNS 的设备都能在 tailnet 内解析这些域名，不需要公网记录（有些路由器会过滤这类记录）。
   - **访问策略：** 让你的设备也能访问入口的 53 端口：`"dst": ["tag:preview:53,443,8025"]`（还有各项目 `PORTS` 里的端口）。
5. **重新部署**每个环境（推送一次，基线则用 `tailnet-preview reset <env>`）。之后每个环境不再有自己的 Tailscale 节点，改由入口提供服务。

## 文件和资源的位置

| 路径或名称                      | 内容                                                     |
| ------------------------------- | -------------------------------------------------------- |
| `~/.config/tailnet-preview/env` | 所有项目共用的 `TS_OAUTH_SECRET`（以及可选的 `TS_TAGS`） |
| `~/previews/<project>/`         | 生成的密钥、各环境的目录、基线备份、锁                   |
| `<project>-<env>-*`             | 一个环境的容器                                           |
| `<project>-<env>_*`             | 一个环境的数据卷                                         |

彻底移除一个项目：先删除它的各个环境（`tailnet-preview destroy pr-N`、`tailnet-preview destroy main --force`），再删除 `~/previews/<project>/`。
