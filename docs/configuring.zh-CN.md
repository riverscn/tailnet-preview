# 配置项目

[English](configuring.md)

本指南把一个仓库改造成 tailnet-preview 能部署的样子。它写成一套流程，人或 AI 编码 agent 都能从头到尾照做：每一步都说明在项目里**看哪里**、**写什么**。最终得到一个 `.tailnet-preview/` 目录，能通过 `tailnet-preview validate` 和一次本地冒烟测试。

在用 AI agent？把这份指南交给它；[agent-guide.zh-CN.md](agent-guide.zh-CN.md) 说明了它在整个接入流程中的位置。

所有配置项和变量的说明见 [design.md 第 5 节](design.zh-CN.md#5-项目配置)。工作流和仓库设置在这之后进行，见 [repository-setup.md](repository-setup.zh-CN.md)。

> **给 AI agent。** 按顺序完成各步。仓库里找不到的值不要编造，留一个 `TODO` 并提问。配置里不要放真实凭据、生产环境的主机名或真实用户数据。不要改变项目在其他地方的运行方式：所有只和试用环境有关的内容都放进 `.tailnet-preview/`。[检查清单](#检查清单)全部完成即为结束。

## 0. 项目需要先具备的条件

- 每个要运行的服务都是**用仓库里的 Dockerfile 构建的容器镜像**，或者公开镜像（数据库、缓存、邮件捕获工具）。只能用 `npm run dev` 之类命令运行的服务，要先补一个 Dockerfile；这是对项目本身的改动，不属于试用环境配置。
- 应用从**环境变量**读取设置，至少包括它的公开地址和数据库连接。如果某项设置写死在代码里，把它改成可配置也是对项目本身的改动。
- 试用环境运行项目的**生产镜像、使用生产配置**，再加上让它可以放心共享的东西：模拟的短信或支付服务、演示数据、邮件捕获工具（第 6 步）。不要让试用环境连接真实的用户数据。

## 1. 从生成的初稿开始

`tailnet-preview` 命令就是本仓库 `bin/` 下的引擎。它在装了 Docker 的 Linux 上运行（不能在 macOS 上运行：它需要 GNU 工具）。如果你按 [host-setup.zh-CN.md 第 2.5 步](host-setup.zh-CN.md#2-主机一次)做过，试用主机上已经装好了它；在别的 Linux 机器上，用同样的方式安装：

```bash
git clone --depth 1 https://github.com/riverscn/tailnet-preview ~/tailnet-preview
echo 'export PATH="$HOME/tailnet-preview/bin:$PATH"' >> ~/.bashrc && . ~/.bashrc
```

CI 里由 action 自带一份，不需要在那里安装任何东西。在同一台机器上检出你项目的仓库，然后在它的根目录执行：

```bash
tailnet-preview init          # 在仓库根目录执行；生成 .tailnet-preview/config.env 和 compose.yaml
```

`init` 会把找到的 Dockerfile 列进 `IMAGES`。如果仓库根目录有 compose 文件（`compose.yaml`、`docker-compose.yml`……），它会设置 `COMPOSE_FILES=../<该文件> compose.yaml`，并把 `compose.yaml` 写成覆盖文件。所有猜测的值都标了 `TODO`。

## 2. 镜像：`IMAGES`

**查找：**项目要部署的服务的 Dockerfile（`Dockerfile`、`apps/*/Dockerfile`、`*.Dockerfile`）；CI 或部署脚本里执行 `docker build` 的地方。

**写入：**每个镜像一条 `name=path`，路径相对于仓库根目录，仓库根目录也是构建上下文。在 compose 里用 `${TP_IMAGE_<NAME>}` 引用镜像，其中名字转成大写、`-` 换成 `_`：`api` 对应 `${TP_IMAGE_API}`，`admin-web` 对应 `${TP_IMAGE_ADMIN_WEB}`。

```sh
IMAGES=api=apps/api/Dockerfile web=apps/web/Dockerfile
```

项目只拉取不构建的镜像（`postgres`、`redis`）不写在这里。

## 3. 环境里的服务：`COMPOSE_FILES` 和 `compose.yaml`

**查找：**能运行整个应用的 compose 文件（生产用的，或完整的本地开发栈）。只为本地开发运行依赖（数据库、缓存）的 compose 文件也有用：复用它，在覆盖文件里补上应用自己的服务。

**如果有这样的文件**，原样复用，只覆盖不同的部分。覆盖文件是第二个 compose 文件，Compose 会把它逐个键合并到第一个文件之上，所以它只包含改动的部分：

```sh
COMPOSE_FILES=../compose.yaml compose.yaml
```

在 `.tailnet-preview/compose.yaml` 里，给你的每个服务设置 `image: ${TP_IMAGE_<NAME>}`（为这个 PR 构建的镜像），以及第 5、6 步的环境变量。`ports:` 和 `container_name:` 不用删，tailnet-preview 会处理。所有文件里的相对路径都按**第一个**文件所在的目录解析。

**如果没有**，就在 `.tailnet-preview/compose.yaml` 里写出完整的环境（`COMPOSE_FILES` 默认就是它）：所有服务，包括数据库，参考 [example](../example/) 或 `init` 生成的模板。

`validate` 会检查这些规则：不能有名为 `ts` 的服务；数据卷不能设置固定的 `name:`；任务要放在 `tasks` profile 里。

## 4. 网站入口：`HTTP`、`HEALTH_PATH`、`PORTS`

**查找：**提供网页界面或供浏览器打开的 API 的那个服务，以及它的**容器**端口（`ports: "8080:3000"` 的右边，即 `3000`；或者它 Dockerfile 里的 `EXPOSE`；或者它的服务器监听的端口）。再找一个健康检查端点（`/health`、`/api/health`、`/healthz`）；没有的话，如果 `/` 不用登录就返回 2xx/3xx，就用 `/`。

```sh
HTTP=web:80
HEALTH_PATH=/api/health
PORTS=8025=mailpit:8025      # 可选：其他值得打开的界面，每个占一个单独的 HTTPS 端口
```

如果前端和 API 是两个服务，`HTTP` 填浏览器打开的那个；它必须代理另一个（比如 nginx 代理 `/api/`），和生产环境完全一样。

## 5. 应用自己的地址：`TP_URL`

每个环境有自己的地址，可以用 `${TP_URL}` 引用：`https://<project>-<env>.<tailnet>.ts.net`，在使用共享入口的主机上则是 `https://<project>-<env>.<domain>`。应用的登录跳转、cookie、CORS 和邮件里的链接都要用到它。

**查找：**所有包含公开地址或主机名的设置：`APP_URL`、`BASE_URL`、`PUBLIC_URL`、`NEXTAUTH_URL`、`BETTER_AUTH_URL`、`ALLOWED_ORIGINS`、`CORS_ORIGIN`、`TRUSTED_ORIGINS`，以及构建时写进前端的 `VITE_*`/`NEXT_PUBLIC_*` 变量。

**写入：**在覆盖文件里把它们都设成 `${TP_URL}`。构建时就把地址写死的前端，无法让每个环境指向不同的地址：前端要用相对地址（同源），试用环境也正是这样提供服务的。

应用运行在一个终结 TLS 的代理后面：如果它会检查协议（secure cookie、跳转到 https），要让它信任来自私有地址（`10.0.0.0/8`、`172.16.0.0/12`、`192.168.0.0/16`）的 `X-Forwarded-Proto`。

## 6. 外部服务：模拟服务

试用环境不能发真实的邮件或短信，不能扣款，也不能拿真实密钥调用生产 API。**查找：**保存外部服务凭据或地址的设置：SMTP、短信、支付、OAuth 服务商、对象存储、统计分析、错误上报、验证码。

**写入：**每个外部服务按项目支持的方式选一种：

- 应用自带的模拟模式或"console"模式；
- 用另一个服务做本地替身：邮件捕获工具（`axllent/mailpit`，它的界面放在一条 `PORTS` 上）、兼容 S3 的存储（`minio`）……；
- 关闭这项功能。

绝不要把生产凭据复制到 `.tailnet-preview/` 里。如果应用没有真实凭据就拒绝启动，又没有模拟方式，就停下来提问：这需要改项目本身。

## 7. 数据：`DATA_VOLUMES`、`SECRETS`

PR 环境从基线数据的副本开始。默认复制所有具名数据卷（`DATA_VOLUMES=auto`）；如果所有具名数据卷存的都是数据（数据库、上传文件、搜索索引），这样就对了。

```sh
DATA_VOLUMES=db-data uploads   # 只复制这些；缓存和构建产物从空开始
DATA_VOLUMES=none              # 每个 PR 都从空数据开始，并执行 seed 任务
```

数据库和应用共用的密码放进 `SECRETS`，在 compose 里按名字引用。你只需要写出它们的名字：引擎在第一次部署时生成随机值，保存在主机上（`~/previews/<project>/secrets.env`），所有环境都用同样的值，因为复制来的数据库要求这样：

```sh
SECRETS=DB_PASSWORD SESSION_SECRET
```

```yaml
services:
  db:
    environment:
      POSTGRES_PASSWORD: ${DB_PASSWORD}
  api:
    environment:
      DATABASE_URL: postgres://app:${DB_PASSWORD}@db:5432/app
```

## 8. 迁移和演示数据：任务

**查找：**迁移命令（`migrate`、`db:migrate`、`prisma migrate deploy`、`alembic upgrade head`……），以及灌演示数据或 fixtures 的命令。如果应用启动时会自己执行迁移，就不需要 `migrate` 任务。

**写入：**把它们写成 `tasks` profile 里的服务，用 `docker compose run --rm` 执行。它们通常需要和应用相同的环境变量；用 YAML 锚点（`&env` 定义，`*env` 引用）可以避免重复书写：

```yaml
x-env: &env # 应用的环境变量，它的服务和任务共用
  DATABASE_URL: postgres://app:${DB_PASSWORD}@db:5432/app

services:
  migrate:
    image: ${TP_IMAGE_API}
    profiles: [tasks]
    environment: *env
    depends_on:
      db:
        condition: service_healthy
    command: ['node', 'dist/migrate.js']
  seed:
    image: ${TP_IMAGE_API}
    profiles: [tasks]
    environment: *env
    depends_on:
      db:
        condition: service_healthy
    command: ['node', 'dist/seed.js']
```

`migrate` 在每次部署前执行；`seed` 只在环境从空数据开始时执行。演示数据必须是虚构的。把演示账号写进 `.tailnet-preview/comment.md`，这是一个 Markdown 文件，它的内容会加到每条 PR 评论里，这样评审的人就知道怎么登录。

## 9. 检查

```bash
tailnet-preview validate
```

它按部署时的方式合并 compose 文件，不构建也不启动任何东西，然后报告：镜像和 Dockerfile、合并了哪些文件以及相对路径解析到哪里、`HTTP` 和 `PORTS` 的服务、复制哪些数据卷、固定的数据卷名、任务，以及 `TP_URL`、镜像和密钥是否被用到。每个 `ERROR` 都要修好；每个 `WARN` 都要看一遍。

然后在一台装了 Docker 的机器上实际跑一次。不需要 tailnet，用测试套件里的假 Tailscale sidecar。下面的设置让它和真实主机的配置、环境互不干扰：

```bash
docker build -t tp-fake-tailscale ~/tailnet-preview/test/fake-tailscale
export TP_TS_IMAGE=tp-fake-tailscale TS_OAUTH_SECRET=fake TP_HOME=$(mktemp -d) TP_INGRESS=sidecar TP_HOST_CONFIG=/dev/null
tailnet-preview build && tailnet-preview deploy main          # 构建、迁移、灌演示数据，并等待 HEALTH_PATH 就绪
tailnet-preview doctor main                                   # 每个上游都应回答 "ok"
tailnet-preview compose main exec ts wget -qO- http://web:80/ # 换成你的 HTTP 上游
tailnet-preview destroy main --force
```

有服务起不来时，`deploy` 会失败并给出原因（`migrate`、`seed`、`health`……），同时打印各服务的日志。

## 检查清单

- [ ] `IMAGES` 列出了所有从仓库构建的镜像；每个都以 `${TP_IMAGE_<NAME>}` 的形式被引用。
- [ ] 项目有 compose 文件时，`COMPOSE_FILES` 复用了它；覆盖文件只改了试用环境需要的部分。
- [ ] `HTTP` 是浏览器打开的服务和它的**容器**端口；`HEALTH_PATH` 不用登录就能返回。
- [ ] 应用的每个地址或 origin 设置都是 `${TP_URL}`。
- [ ] 不会访问任何真实的外部服务：邮件、短信、支付、OAuth、存储都用模拟服务或已关闭。
- [ ] 共用的密码在 `SECRETS` 里；`.tailnet-preview/` 里任何地方都没有真实凭据。
- [ ] `DATA_VOLUMES` 复制的正好是存放数据的那些数据卷。
- [ ] `migrate`（除非应用自己执行迁移）和 `seed` 都以任务的形式存在；演示数据是虚构的；演示账号写在 `comment.md` 里。
- [ ] `tailnet-preview validate` 没有报错。
- [ ] 本地冒烟测试部署成功，`doctor` 显示每个上游都是 `ok`，之后已经删除。

## 常见错误

| 错误                                           | 后果                                    | 修正                                                       |
| ---------------------------------------------- | --------------------------------------- | ---------------------------------------------------------- |
| `HTTP` 用了发布端口（`8080:3000` 里的 `8080`） | 健康检查一直不通过（`health`）          | 用容器端口（`3000`）                                       |
| 应用里还留着 `localhost` 或生产环境的地址      | 登录跳转到错误的主机；cookie 被拒绝     | 把所有地址设置都设成 `${TP_URL}`（第 5 步）                |
| 密码按服务或按环境分别生成                     | 复制来的数据库拒绝 PR 环境的密码        | 放进 `SECRETS`                                             |
| `migrate` 或 `seed` 没有 `profiles: [tasks]`   | 它会作为服务一直运行；`validate` 会报告 | 加上 `profiles: [tasks]`                                   |
| 数据库还不接受连接时任务就启动了               | 第一次部署时 `migrate` 失败             | `depends_on: db: condition: service_healthy` + healthcheck |
| 数据卷设置了 `name:`                           | 所有环境共用同一个数据卷                | 删掉 `name:`                                               |
| 覆盖文件里有真实的 SMTP 或 API 凭据            | 试用环境发出真实消息，密钥进了 git      | 用模拟服务（第 6 步）；绝不提交凭据                        |
| 前端构建时用了绝对的 API 地址                  | 试用环境的界面连到了别的环境或生产环境  | 用同源的相对地址                                           |
