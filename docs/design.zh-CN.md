# 设计

[English](design.md)

本文档是 tailnet-preview 如何工作、对项目有什么要求的事实来源。设计变化时，先改本文档。

## 1. 目标与非目标

**目标**

- 每个 pull request 都有一套自己的、运行中的应用副本，用 PR 的代码构建。
- 一个常驻的**基线**环境跟随默认分支。PR 环境从基线数据的副本开始，所以 PR 的测试方式和上线时一样：已有数据经 PR 的迁移升级。
- 环境**只能在你的 tailnet 内**（Tailscale）通过 HTTPS 访问，没有公网入口。
- 一台普通的 Linux 机器（家里的服务器、一台虚拟机）承载多个项目的环境。主机不需要为某个项目单独设置。
- 一切由 GitHub Actions 驱动；正常使用时没有需要手工操作的东西。
- **核心很薄。** 引擎管理的是环境，不是应用：它不知道项目用哪种数据库。项目在普通的 `compose.yaml` 里描述自己的服务，数据库也在其中。

**非目标**

- 生产托管。试用环境运行模拟服务和演示数据，从不使用真实用户数据。
- 多主机调度、自动扩缩容或 Kubernetes。
- 特定数据库的功能（逻辑导出、模板数据库）。数据按 Docker 数据卷复制。
- 不受信任的贡献者。部署 PR 就是在主机上运行它的代码（见 [security.zh-CN.md](security.zh-CN.md)）。

## 2. 组成部分

本节和第 3 到第 7 节描述默认模式 `sidecar`：每个环境有自己的 Tailscale 节点。`shared` 模式用每台主机一个入口取代 sidecar，见第 10 节。

```
GitHub ──(workflow job, label: preview)──▶ self-hosted runner on the preview host
                                             │
                                             ▼
                                   tailnet-preview (bash engine)
                                             │ docker compose
                        ┌────────────────────┴─────────────────────┐
                        ▼                                          ▼
              <project>-main (baseline)                  <project>-pr-42 …
       ts sidecar + the project's services        ts sidecar + the project's services
       (database included, data in volumes)       volumes copied from the baseline
```

| 部分                         | 位置       | 作用                                                                                    |
| ---------------------------- | ---------- | --------------------------------------------------------------------------------------- |
| 引擎 `bin/tailnet-preview`   | 本仓库     | 在主机上创建、复制、升级、删除、备份和诊断环境                                          |
| 组合 action `action.yml`     | 本仓库     | 工作流调用的入口：构建镜像，决定复制基线还是全新创建，部署，打印诊断信息，更新 PR 评论  |
| 项目配置 `.tailnet-preview/` | 项目的仓库 | 环境由哪些 compose 文件和镜像组成、入口、哪些数据卷存放数据、评论文字                   |
| 试用主机                     | 你的机器   | Docker、标签为 `preview` 的 self-hosted runner、整台机器共用的一个 Tailscale OAuth 密钥 |

## 3. 环境

| 环境 | 名称        | 数据来源                                                                    | 生命周期                               |
| ---- | ----------- | --------------------------------------------------------------------------- | -------------------------------------- |
| 基线 | `main`      | 第一次部署：空数据卷 → 迁移 → 演示数据。之后每次推送默认分支时原地升级      | 直到手动停止                           |
| PR   | `pr-<编号>` | 复制基线的 `DATA_VOLUMES`，再执行 PR 的迁移。之后每次推送这个 PR 时原地升级 | PR 关闭时删除                          |
| 分支 | `br-<分支>` | 和 PR 环境一样，用于没有开 PR 的分支（可选，action 的 `branches` 输入）     | 分支删除、开了 PR 或不再匹配规则时删除 |

- **哪些 PR 和分支有环境**由项目的工作流决定，通过 action 的两个输入（第 8 节）：`drafts`（草稿 PR 也部署，这是默认；或者等它转为 Ready for review 再部署）和 `branches`（默认不部署分支；`*` 表示所有分支；或者按规则匹配，例如 `release/* feature/*`）。开了 PR 的分支只由 PR 环境提供。分支环境的名字是分支名转成小写、其他字符都换成 `-`（`feature/Login` → `br-feature-login`）；`<project>-br-<…>` 超过 63 个字符（DNS 标签的上限）时会截短，并加上分支名的哈希。只在这类字符上不同的两个分支会共用一个环境。
- **复制基线就是复制数据卷。** 引擎先创建 PR 环境的容器和数据卷但不启动，停止基线的服务（不停它的 Tailscale 节点），逐个文件复制 `DATA_VOLUMES` 中的每个数据卷（`cp -a`），然后不论复制是否成功都重新启动基线。复制要几秒，这期间基线不可用；因为这期间没有东西写数据卷，所以副本是一致的。任何数据库都行，放在数据卷里的上传文件或搜索索引也一样。
- **全新环境。** 没有基线可复制时，PR 环境像基线一样创建（空数据卷 → 迁移 → 演示数据）：接入 tailnet-preview 的那个 PR（默认分支还没有 `.tailnet-preview/`），或者没有 `DATA_VOLUMES` 的项目。合并接入的 PR 会创建基线。
- **迁移只能向前。** 如果 PR 修改了一个已在其环境中执行过的迁移，环境就和代码对不上了；重置它（会重新从基线复制）。
- 环境只有在成功创建过一次之后（有 `initialized` 标记）才算存在。创建到一半的环境会在下次部署时从头重建：先删除它的容器和数据卷，Tailscale 节点的状态除外。
- 每个环境都运行每个服务的独立副本，数据库也不例外。请据此预留内存。限制：每个项目最多 `MAX_ENVS` 个 PR 和分支环境（默认 8），主机可用内存低于 `MIN_FREE_MB`（默认 1536）时不创建新的环境。触到限制不算失败；PR 评论会说明。

## 4. 主机上的布局

项目在主机上的一切都以项目名为前缀（仓库名转小写，非字母数字字符替换为 `-`），所以项目之间不会冲突：

| 资源                    | 名称                                                                                          |
| ----------------------- | --------------------------------------------------------------------------------------------- |
| 状态目录                | `~/previews/<project>/`（生成的密钥、各环境的目录、备份、锁）                                 |
| 每个环境的 Compose 项目 | `<project>-<env>`；其数据卷为 `<project>-<env>_<volume>`                                      |
| 镜像                    | `<project>-<image>:<12 位 commit>`，带标签 `tailnet-preview.project=<project>`                |
| Tailscale 节点          | `<project>-<env>`；基线的是常驻节点，PR 的是临时节点                                          |
| 备份                    | `~/previews/<project>/backups/main-<timestamp>/<volume>.tar.gz`，保留最新的 `KEEP_BACKUPS` 份 |

整台机器的配置在 `~/.config/tailnet-preview/env`：`TS_OAUTH_SECRET`，可选的 `TS_TAGS`，以及共享入口的设置（第 10.5 节），共享入口的状态在 `~/previews/.ingress/`。如果设置了仓库密钥 `TS_OAUTH_SECRET`，它优先。

一个项目所有会改变状态的命令都通过 `~/previews/<project>/.lock` 上的 `flock` 串行执行。不用 GitHub 的 `concurrency` 分组，因为它会取消排队中的运行，而不是等待。

## 5. 项目配置

项目通过添加一个目录接入 tailnet-preview，默认是 `.tailnet-preview/`。分步骤的写法见 [configuring.zh-CN.md](configuring.zh-CN.md)。

```
.tailnet-preview/
  config.env      required   镜像、compose 文件、HTTP 上游、健康检查、数据、密钥、限制
  compose.yaml    usual      试用环境需要的内容：整个环境，或对项目自身文件的覆盖
  comment.md      optional   追加到"已就绪"的 PR 评论里（演示账号、提示）
```

项目自己的 compose 文件可以**原样**复用：`COMPOSE_FILES` 列出一个环境要合并的文件，例如 `../compose.yaml compose.yaml`（先是项目的文件，再是一个小的覆盖文件）。引擎会补上每个环境都需要的内容：

- Tailscale sidecar（`lib/compose.overlay.yaml`），放在最前；
- 一个隔离用的覆盖文件，放在最后，去掉每个服务对外发布的 `ports` 和固定的 `container_name`，否则并排运行的环境之间会冲突。Compose 本身已经给每个环境独立的容器、网络和数据卷名称（`<project>-<env>-…`）。

**快照。** 每次部署都把仓库的工作区（已跟踪的文件，以及 git 未忽略的未跟踪文件）复制到环境的状态目录，再在上面叠加配置目录。Compose 从这份副本运行，所以相对路径（bind mount 的初始化脚本、配置文件）都能用，检出目录删掉后环境也能重启。所有 compose 文件中的相对路径都相对于 `COMPOSE_FILES` 第一项所在的目录解析（多个 `-f` 文件时 Compose 的标准行为）。

### 5.1 `config.env`

普通的 `KEY=value` 行；`#` 开始注释。文件是被解析的，不会被执行。

| 键              | 默认值         | 含义                                                                                                                                       |
| --------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `IMAGES`        | –（必填）      | 空格分隔的 `name=path/to/Dockerfile`。构建上下文是仓库根目录。镜像 `name` 在 compose 中可用 `${TP_IMAGE_<NAME>}` 引用（转大写，`-` → `_`） |
| `HTTP`          | –（必填）      | HTTPS 443 端口代理到的 `service:port`，例如 `web:80`：是容器端口，不是发布出来的端口                                                       |
| `COMPOSE_FILES` | `compose.yaml` | 按顺序合并的 compose 文件，空格分隔，相对于配置目录；必须位于仓库内                                                                        |
| `PORTS`         | 空             | 额外的 HTTPS 端口，空格分隔的 `port=service:port`，例如 `8025=mailpit:8025`                                                                |
| `HEALTH_PATH`   | `/`            | 通过 `HTTP` 反复请求的路径，直到返回 2xx/3xx；两分钟内不返回则部署失败                                                                     |
| `DATA_VOLUMES`  | `auto`         | 从基线复制到新 PR 环境、并每晚备份的数据卷：`auto`（所有具名数据卷）、`none`（每个 PR 都从空数据开始并灌演示数据），或空格分隔的数据卷名   |
| `SECRETS`       | 空             | 空格分隔的变量名；每个变量为每个项目生成一次随机值，保存在主机上，在所有环境中相同                                                         |
| `MAX_ENVS`      | `8`            | PR 和分支环境的最大数量                                                                                                                    |
| `MIN_FREE_MB`   | `1536`         | 创建 PR 环境所需的最小主机可用内存                                                                                                         |
| `KEEP_BACKUPS`  | `7`            | 保留的基线每日备份份数                                                                                                                     |

### 5.2 Compose 文件

规则：

- 不要定义名为 `ts` 的服务或名为 `ts-state` 的数据卷。
- 不要给数据卷固定的 `name:`，也不要把数据卷设为 `external`；每个环境都需要自己的一份。（`validate` 会报告这两种情况。）
- 服务之间共享的密钥，比如数据库密码，放在 `SECRETS` 里，这样复制来的数据库和 PR 环境的服务才会一致。

可用于插值的变量：

| 变量                   | 值                                                          |
| ---------------------- | ----------------------------------------------------------- |
| `TP_PROJECT`、`TP_ENV` | 项目名和环境名                                              |
| `TP_URL`               | `https://<node>.<tailnet>.ts.net`，在项目服务启动前就已确定 |
| `TP_IMAGE_<NAME>`      | `IMAGES` 中每一项的镜像 tag                                 |
| `SECRETS` 中的每个名字 | 它生成的值                                                  |

**任务。** `tasks` profile 中的服务用 `docker compose run --rm` 运行，不会常驻。它们通常以 `condition: service_healthy` 的方式 `depends_on` 数据库：

- `migrate`（可选）：每次部署都运行，在服务启动之前。
- `seed`（可选）：只运行一次，在环境以空数据卷创建时（基线、全新的 PR 环境）。

## 6. 命令

```
tailnet-preview build [--tag TAG]                 构建项目的镜像（跳过已存在的镜像）
tailnet-preview has ENV                           环境存在时退出码为 0，不存在时为 2
tailnet-preview deploy ENV [--tag TAG] [--fresh]  创建或升级；在 stdout 打印地址
tailnet-preview reset ENV [--tag TAG]             重建（基线：先备份，保留 Tailscale 节点）
tailnet-preview destroy ENV [--force]             删除容器、数据卷和 Tailscale 节点
tailnet-preview stop|start ENV                    停止或启动，保留数据
tailnet-preview url ENV | info ENV | list         显示地址；info：地址、tag 和创建方式（mode）
tailnet-preview backup                            归档基线的 DATA_VOLUMES，保留 KEEP_BACKUPS 份
tailnet-preview prune [KEEP…]                     删除未列出的 PR 和分支环境（列出的是 PR 编号和
                                                  br-<分支> 名），删除不再使用的镜像
tailnet-preview branch-env [--match PATTERNS] BRANCH
                                                  输出分支的环境名；带 --match 时，没有规则匹配就以 1 退出
tailnet-preview doctor ENV                        只读诊断
tailnet-preview validate                          不部署，只检查配置（只需要 docker CLI）
tailnet-preview init                              生成一份带注释的 .tailnet-preview/ 作为起点
tailnet-preview compose ENV ARGS…                 对某个环境运行 docker compose
tailnet-preview host-check                        检查主机的前提条件
```

引擎的设置来自环境变量：`TP_SOURCE`（仓库检出目录，默认当前目录）、`TP_CONFIG`（默认 `$TP_SOURCE/.tailnet-preview`）、`TP_PROJECT`、`TP_HOME`（默认 `~/previews`）、`TP_HOST_CONFIG`、`TP_FAILURE_FILE`、`TS_OAUTH_SECRET`。默认的 `--tag` 是 `TP_SOURCE` 中 `git rev-parse HEAD` 的前 12 个字符。

`mode`（来自 `info`）是 `forked`、`fresh` 或 `upgraded`：环境最近一次部署的数据是怎么来的。

退出码：`0` 成功，`1` 失败，`3` 触到限制（未创建环境），`4` 基线不存在（用 `--fresh` 部署 PR 环境，或先部署 `main`）。

只有 `deploy`、`reset`、`url`、`info` 和 `list` 会写 stdout。其他一切，包括 compose 和项目任务的输出，都写到 stderr。

## 7. 失败

引擎识别出失败原因时，会把 `<code><TAB><detail>` 写入 `TP_FAILURE_FILE`（action 把它设为 `$RUNNER_TEMP/tailnet-preview-failure`）。PR 评论把原因码转成原因和处理步骤（`lib/comment.cjs`，`REASONS`），与 [troubleshooting.zh-CN.md](troubleshooting.zh-CN.md) 中的表格对应。原因码：`config`、`registry`、`build`、`ts_secret`、`ts_login`、`https`、`fork`、`migrate`、`seed`、`health`。

`https` 比较特殊：环境已经创建并会保留，但浏览器连不上，因为 tailnet 不签发 HTTPS 证书。部署被判为失败，这样 PR 上显示的是这个原因，而不是"已就绪"。这项检查会等到 sidecar 运行起来：正在（重新）启动的 sidecar 还报告不出证书域名。

部署成功也可能留下 PR 应该提到的事：引擎为每条提示往 `TP_NOTICE_FILE` 写一行 `<code><TAB><detail>`，评论把它们加到"已就绪"里。提示有 `hostname` 和 `cert` 两种。

`hostname`：tailnet 里已经有一台与环境同名（`<project>-<env>`）的设备，通常是之前某个环境的节点没有登出，于是 Tailscale 给这个节点的名字加了后缀（`-1`）。环境在那个地址下能用（引擎每次部署都从节点读取这个地址），但不是大家预期的地址；`doctor` 也会警告。

`cert`：Tailscale 在第一次访问时才申请节点的证书，失败时只会在浏览器里表现为 TLS 错误，所以部署在健康检查通过后就去申请，最多等一分钟（`TP_CERT_TIMEOUT`）。新的部署会取代上一次：它先停掉上一次的重试循环，以及 sidecar 里仍在进行的证书申请，否则会被它们卡住。文档给出的工作流在上一层做了同样的事：向 PR 推送新的提交，会取消旧提交仍在运行的部署 job。Let's Encrypt 在 Tailscale 设置验证用 DNS 记录的同一秒就去验证，记录还没传到公网 DNS 时就拒绝这次申请（`NXDOMAIN`，或只看得到旧值时的 `Incorrect TXT record`）。这是两个服务之间的时序问题，不是 PR 的问题，所以部署仍然成功，并带上提示 `cert`，其中附有 Let's Encrypt 给出的原因（sidecar 从这次申请的公开 authorization 中取得）。sidecar 里有一个循环，比部署 job 活得久，会在 6、26、71 分钟后再次申请证书，之后一天内每小时一次，不超出 Let's Encrypt 每个名字每小时五次验证失败的限制；`doctor` 会显示它的进度。失败之后，无论是部署还是循环，两次申请至少间隔 `TP_CERT_MIN_GAP`（6 分钟）：Let's Encrypt 的解析器会把"记录不存在"缓存最长 ts.net 的 negative TTL（5 分钟），失败后很快再申请，会以同样方式失败。tailscaled 已有的证书则不受此限，照样取，因为这不需要找 Let's Encrypt。

tailscaled 自己也会在 serve 配置包含 HTTPS 而证书缺失时申请证书：加载配置时、每小时一次，以及每次 TLS 握手时。这样每次浏览器访问都会消耗一次失败次数。所以引擎把 serve.json 放在 `/config`，tailscaled 不读那里，只在证书到位后（申请后的那次部署，或循环拿到证书时）才把它复制到状态数据卷中的 `TS_SERVE_CONFIG`；申请失败后它不提供任何服务，浏览器得到的是连接被拒绝。复制用 rename 替换，因为 containerboot 在目录每次变化时都会重新读取，读到写了一半的文件就会退出。一个名字失败五次后，Let's Encrypt 会拒绝它，直到它给出的某个时间（"retry after ... UTC"），在此期间的每次申请（部署、重试、浏览器访问）都只会增加失败次数。引擎从 sidecar 的日志中读出这个时间：在那之前部署不去申请，循环也先等到时间过去。Tailscale 自己也可能在找 Let's Encrypt 之前就失败，即设置验证记录超时（`SetDNS ... context deadline exceeded`）；循环把它当作一般的失败处理。单节点证书仍然是这个设计的弱点；共享入口（第 10 节）避开了它。

从镜像仓库拉取镜像时会逐个拉取并重试，因为到 Docker Hub 的链路不稳定，会重置连接，而并行拉取时只要断一条连接，所有镜像都会中止。

## 8. action

`uses: riverscn/tailnet-preview@v0.3.0`，配合 `command`：

| `command` | 典型触发                                                                  | 作用                                                                                                 |
| --------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `deploy`  | `pull_request`（opened、synchronize、reopened、ready_for_review），`push` | 构建镜像，必要时从 base 分支初始化基线（或全新部署），部署，打印 `doctor`，评论                      |
| `destroy` | `pull_request` closed，`delete` 分支                                      | 删除 `pr-<编号>`（并更新 PR 评论）或 `br-<分支>`                                                     |
| `nightly` | `schedule`                                                                | 备份基线；清理已关闭 PR 的环境，以及分支已删除、已开 PR 或不再匹配规则的分支环境；清理不再使用的镜像 |
| `run`     | `workflow_dispatch`                                                       | 运行 `args` 中给出的引擎命令，例如 `reset main`                                                      |

推送到默认分支会部署基线。推送到其他分支时，如果 `branches` 匹配它、且它没有开着的 PR，就部署它的分支环境，否则跳过；`drafts` 为 `false` 时跳过草稿 PR（它已有的环境保留到 PR 关闭）。跳过的部署算成功，并在 job summary 里说明原因。`nightly` job 要传同样的 `branches`，清理时按它判断。

`run` 使用工作流检出的那个 ref 的代码，通常是默认分支，所以它拒绝对 `pr-<n>` 和 `br-<分支>` 执行 `deploy` 和 `reset`：它们会把默认分支的代码放进那个环境。要重建 PR 环境，运行 `destroy pr-<n>`，再重新运行该 PR 的部署 job。

部署失败后，诊断、PR 评论和 job 结果这几步仍会运行，但部署被取消时不会：取消这个 job 的新推送会自己更新评论。

action 通过 `github.action_path` 找到自己的脚本，所以固定在 `@v0.3.0` 的工作流运行的就是那个版本的引擎。

## 9. 版本

语义化版本。接口包括项目配置、变量、命令和 action 的输入。发布由 Release 工作流（`.github/workflows/release.yml`）打上 `vX.Y.Z` tag，附带 `CHANGELOG.md` 中该版本的说明。

- **0.x**（当前）：第一批项目正在接入，接口还在定型。次版本可能破坏接口，所以项目要固定完整版本号（`@v0.3.0`）。没有随版本移动的 `v0` tag，发布都标记为预发布。
- **从 1.0.0 起**：破坏性变更需要新的主版本，随版本移动的 tag `vX` 指向主版本 X 的最新发布，所以项目可以用 `@v1`。

## 10. 共享入口：每台主机一个，一张通配符证书

状态：来源 B（自己的域名）已实现为 `TP_INGRESS=shared`，按主机选择启用；来源 A（Tailscale 自己的通配符证书）在等 Tailscale（10.3）。每个环境一个 sidecar（`TP_INGRESS=sidecar`）仍是默认，直到 `shared` 在真实主机上运行一段时间。

### 10.1 为什么

每个环境都是一个有自己名字的 Tailscale 节点，所以每个环境都需要自己的证书，在部署过程中签发。这正是反复出问题的部分，而且不在我们的控制之内：

- **验证抢在 Tailscale 的 DNS 生效之前。** Tailscale 的 `set-dns` 大约 30 秒后返回，Let's Encrypt 在一秒内验证；这时记录常常还没传到所有 ts.net 名称服务器（`NXDOMAIN`，或看得到旧值时的 `Incorrect TXT record`）。其他人也报告过同样的问题：[tailscale/tailscale#21759](https://github.com/tailscale/tailscale/issues/21759)（未关闭），还有一个 tailnet 签发失败了十个小时，然后自己恢复了（[#20823](https://github.com/tailscale/tailscale/issues/20823)）。2026 年 10 月在我们的主机上，PR 环境和基线经常要第二或第三次才拿到证书；第 7 节说明引擎如何应对。
- **按名字和按 tailnet 的限额。** 每个名字每小时五次验证失败，之后这个名字最长被拒一小时。而且因为 `ts.net` 在 Public Suffix List 上，Let's Encrypt 每个注册域名每周 50 张新证书的限制是**按 tailnet** 算的：每个新 PR 环境、每个重建的环境、以及每个其他启用 HTTPS 的节点都在消耗它。只提供普通 HTTP 的节点也在消耗，直到计划在 Tailscale 1.106 中修复（[#21693](https://github.com/tailscale/tailscale/issues/21693)）。
- **每个环境的名字都会公开**在证书透明度（Certificate Transparency）日志中（`myapp-pr-42.<tailnet>.ts.net`），被新节点复用的名字还可能在一段时间内触发浏览器的 CT 检查（[#15702](https://github.com/tailscale/tailscale/issues/15702)）。
- **每个环境一个节点的副作用：**名字冲突（`-1` 后缀）、每个 sidecar 里都有一个重试循环、管理后台里每个环境一台设备。

每台主机只签发一次、每两个月续期一次、与任何部署无关的证书，能一次性消除所有这些问题。

### 10.2 设计

每台主机一个**入口**，取代每个环境一个 sidecar：

```
browser ──https://myapp-pr-42.preview.example.com──▶ ingress: Tailscale node, kernel mode (tag:preview)
            ▲                                           │  Traefik on <ingress IP>:443 (and PORTS)
            │ split DNS: preview.example.com            │  CoreDNS on <ingress IP>:53
            └── CoreDNS answers *.preview… → ingress IP │
                                                        ▼ route by host name, over each environment's network
                                         myapp-pr-42-web-1:80        myapp-main-web-1:80 …
```

- **地址**是 `<project>-<env>.<TP_INGRESS_DOMAIN>`，在任何东西启动前就已确定；一张通配符证书 `*.<TP_INGRESS_DOMAIN>` 覆盖主机上所有项目的所有环境。
- **入口**是每台主机一个的 compose 项目（`tailnet-preview-ingress`，文件在 `~/previews/.ingress`）：一个常驻的 Tailscale 节点，运行在**内核模式**（`/dev/net/tun`、`NET_ADMIN`），Traefik 和 CoreDNS 在它的网络命名空间里。用内核模式，是因为 tailnet 的 split DNS 需要 53 端口的 UDP，而 `tailscale serve` 转发不了；况且 tailscaled 自己的 serve 本来也无法按子域名路由（它按 SNI 的确切名字向 Let's Encrypt 申请证书，并拒绝节点自身名字之下的名字，`resolveCertDomain`）。每次部署都会把入口更新到最新，所以它总是跟随主机上最新的引擎。
- **Traefik** 只监听入口的 **tailnet 地址**：环境都连到入口上，但不能借它互相访问。入口点：443，加上各项目 `PORTS` 中的每个端口（新端口会让 Traefik 重启一次）。路由来自 `routes/` 中每个环境一个的文件，Traefik 会监视这个目录。证书由 Let's Encrypt 通过 DNS 服务商的 API 以 DNS-01 方式签发。在找 Let's Encrypt 之前，lego 会等到每个权威名称服务器都有了这条记录（它通过主机的解析器或 `TP_INGRESS_DNS_RESOLVERS` 找到这些服务器）：单节点证书正是在这一步的时序上出问题。有些网络（比如最初 bot-dev 的网络）会拦截 53 端口的所有 DNS 查询，并从一个把记录缓存为不存在的缓存中作答，这样从主机上什么都查不准：入口会检测到这种情况（向 192.0.2.1 发查询，那里没有服务器，却得到了回答），转而等待固定时间（`TP_INGRESS_DNS_DELAY`，此时默认 60 秒）；Let's Encrypt 则从它自己的解析器验证。
- **CoreDNS** 用入口的 tailnet 地址回答该域名下的所有名字，并且只在这个地址上监听。tailnet 的 split DNS 把这个域名交给它，所以名字在 tailnet 内解析，从不经过本地网络的解析器。公网 DNS 中没有记录：带 DNS rebinding 防护的解析器和路由器（比如 OpenWrt 的默认设置）会丢弃指向私有地址或 CGNAT 地址的公网应答。
- **连到各个环境：**部署时把入口连到 `HTTP` 和 `PORTS` 服务所在的网络（`docker network connect`），并写入路由；上游是容器的 compose 名称 `<project>-<env>-<service>-1`。健康检查经 Traefik 走 HTTPS，所以部署只有在地址能访问时才返回。删除环境时会移除路由并断开入口，这样 compose 才能删除网络。
- **项目配置不变。** `HTTP`、`PORTS` 和 `TP_URL` 的含义不变；只是 `TP_URL` 的值变了。

### 10.3 通配符证书从哪里来

|          | A. Tailscale 通配符证书                                                                                                                                                                      | B. 自己的域名（已实现）                          |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| 名字     | `*.preview.<tailnet>.ts.net`                                                                                                                                                                 | `*.preview.example.com`                          |
| 签发方   | 在入口节点上运行 `tailscale cert '*.preview.<tailnet>.ts.net'`                                                                                                                               | Traefik，通过 DNS 服务商的 API 走 DNS-01         |
| 名字解析 | MagicDNS 为带节点属性 `dns-subdomain-resolve` 的节点回答其子域名                                                                                                                             | 入口上的 CoreDNS，经 tailnet 的 split DNS        |
| 需要     | 把 `dns-subdomain-resolve` 授予 `tag:preview` 的 `nodeAttrs`                                                                                                                                 | 一个域名、主机上的 DNS API token、一条 split DNS |
| 可用性   | **还不能用。** 客户端从 1.96 起支持（[#1196](https://github.com/tailscale/tailscale/issues/1196)），但 Tailscale 托管的控制面还不授予这个属性：我们节点的 `CapMap` 里没有它（2026 年 10 月） | 现在可用                                         |

A 仍然是目标：不要域名，不要 token，不依赖 Tailscale 之外的任何东西。等 Tailscale 授予这个属性，A 将取代 Traefik 的 DNS-01 和 CoreDNS；路由部分保留。

### 10.4 好处和代价

好处：

- 部署期间不涉及证书：没有提示 `cert`，没有重试循环，没有限流。新环境一健康就能用 HTTPS 访问。
- 每台主机一张证书，而不是每个环境一张：远低于每周的限制，证书透明度日志里也只出现 `*.<TP_INGRESS_DOMAIN>`，而不是每个环境的名字。
- 每台主机一台 Tailscale 设备：没有临时节点，没有 `-1` 后缀。

代价：

- **主机级组件。** 入口停了，主机上所有环境都访问不到（环境本身仍在运行）；`doctor` 会显示它的状态。容器随 Docker 重启。
- **访问控制更粗。** 所有环境都在同一个节点后面，所以访问策略不能再允许某台设备访问一个环境而不能访问另一个。以前每个环境也都带着 `tag:preview`。
- **入口能访问所有环境。** 它连着所有环境的网络；它运行的镜像来自 tailnet-preview 的发布（Tailscale、Traefik、CoreDNS），从不来自 PR。
- **主机切换时地址会变一次**；为试用环境登记的链接、OAuth 回调地址之类都要更新。
- **主机上的 DNS token** 能修改那个域名的记录；把它的权限限定在这一个 zone 和 DNS 编辑上。

### 10.5 设置与迁移

主机设置，在 `~/.config/tailnet-preview/env`（或环境变量）中：

| 设置                       | 含义                                                                                                                           |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `TP_INGRESS`               | `sidecar`（默认）或 `shared`                                                                                                   |
| `TP_INGRESS_DOMAIN`        | 例如 `preview.example.com`；环境地址为 `<project>-<env>.<domain>`                                                              |
| `TP_INGRESS_DNS_PROVIDER`  | DNS 服务商在 Traefik/lego 中的名字，例如 `cloudflare`、`alidns`、`tencentcloud`。不设置时 Traefik 提供自签名证书（测试就用它） |
| `TP_INGRESS_DNS_ENV`       | 存放服务商凭据的变量名，例如 `CF_DNS_API_TOKEN`；它们的值写在同一个文件里                                                      |
| `TP_INGRESS_ACME_EMAIL`    | Let's Encrypt 的联系地址；设置了服务商时必填                                                                                   |
| `TP_INGRESS_DNS_RESOLVERS` | lego 用来查找权威服务器的解析器，例如 `223.5.5.5:53`；默认用主机的                                                             |
| `TP_INGRESS_DNS_DELAY`     | 不做检查、改为等待的秒数；网络拦截 DNS 时自动设为 60                                                                           |
| `TP_INGRESS_ACME_CA`       | 可选的 ACME 目录，例如 Let's Encrypt 的 staging                                                                                |
| `TP_INGRESS_HOSTNAME`      | 入口在 Tailscale 中的名字；默认 `tailnet-preview-<host>`                                                                       |

切换主机：准备好 tailnet（split DNS、开放 53 端口的访问策略）和这些设置（[host-setup.zh-CN.md](host-setup.zh-CN.md)），然后重新部署每个环境。在 shared 模式下重新部署，会让环境的 sidecar 登出，并删除它和它的状态；切换回去会移除路由。

如果 `shared` 证明可靠，它会成为默认，sidecar 以及第 7 节中所有关于证书的内容会在之后的某个次版本中移除。

### 10.6 待定问题

- 是向 Tailscale 申请在托管控制面上开放 `dns-subdomain-resolve`，还是等它自己开放。
- 一个 tailnet 里的多台主机各自需要自己的域名（或子域名）和 split DNS 条目。
