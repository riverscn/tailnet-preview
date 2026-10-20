# 项目接入

[English](project-setup.md)

在一个仓库里接入 tailnet-preview，需要一个配置目录和一个工作流。[example](../example/) 是一个完整的最小项目；每项设置的说明见 [design.zh-CN.md 第 5 节 ](design.zh-CN.md#5-项目配置)。

前提：一台准备好的主机（[host-setup.zh-CN.md](host-setup.zh-CN.md)）。

## 1. 准备应用

试用环境运行项目的生产镜像，使用生产配置，再加上让它可以放心共享的东西：模拟的短信或支付服务、演示数据、邮件捕获器。应用必须从环境变量读取自己的公开地址和数据库连接。不要让试用环境连接真实的用户数据。

## 2. 编写 `.tailnet-preview/`

按 [configuring.zh-CN.md](configuring.zh-CN.md) 操作：它一步步讲解镜像、compose 文件、网站入口、应用自己的地址、模拟服务、数据和任务，最后用 `tailnet-preview validate` 检查，并在本地做一次冒烟测试。简单来说，对已经有 compose 文件的项目：

```
.tailnet-preview/
  config.env       IMAGES、COMPOSE_FILES、HTTP、HEALTH_PATH、SECRETS（DATA_VOLUMES 默认为所有具名数据卷）
  compose.yaml     项目 compose 文件的覆盖：构建的镜像、TP_URL、模拟服务、migrate/seed 任务
  comment.md       可选：PR 评论里的演示账号和提示
```

```sh
IMAGES=api=apps/api/Dockerfile web=apps/web/Dockerfile
COMPOSE_FILES=../compose.yaml compose.yaml
HTTP=web:80
HEALTH_PATH=/api/health
SECRETS=DB_PASSWORD SESSION_SECRET
```

[example](../example/) 就是这种结构的完整项目：`example/compose.yaml` 是它自己的 compose 文件，没有改动；`example/.tailnet-preview/` 补上试用环境需要的内容。

## 3. 为仓库启用

- Settings → Secrets and variables → Actions → **Variables**：设置 `PREVIEW_ENABLED` = `true`。设置之前，工作流的任务会直接跳过，而不是一直等待 runner。
- 必须有一个标签为 `preview` 的 self-hosted runner 服务这个仓库（[host-setup.zh-CN.md](host-setup.zh-CN.md#3-runner每个仓库一次或每个组织一次)）。
- 如果 `riverscn/tailnet-preview` 是你的私有仓库，要允许你的其他仓库访问它（在它的 Settings → Actions → General → Access 里设置）。

## 4. 添加工作流

`.github/workflows/preview.yml`：

```yaml
name: Preview

on:
  pull_request:
    types: [opened, synchronize, reopened, closed]
  push:
    branches: [main]
  schedule:
    - cron: '30 18 * * *'
  workflow_dispatch:
    inputs:
      args:
        description: 'Engine command, e.g. "reset main", "stop main", "doctor pr-12"'
        required: true

permissions:
  contents: read
  issues: write
  pull-requests: write

jobs:
  deploy:
    # 来自 fork 的 PR 一律不部署：部署就是在主机上运行 PR 的代码。action 自己也会
    # 拒绝它们；公开仓库请先看 docs/security.md。
    if: >-
      vars.PREVIEW_ENABLED == 'true' && (github.event_name == 'push' ||
      (github.event_name == 'pull_request' && github.event.action != 'closed' &&
       github.event.pull_request.head.repo.full_name == github.repository))
    # 同一个 PR 有更新的推送时，取消这次部署；推送到默认分支的部署总会跑完。
    concurrency:
      group: preview-deploy-${{ github.event.pull_request.number || github.ref }}
      cancel-in-progress: ${{ github.event_name == 'pull_request' }}
    runs-on: [self-hosted, preview]
    steps:
      - uses: actions/checkout@v7
      - uses: riverscn/tailnet-preview@v0.3.0
        with:
          command: deploy
        env:
          TS_OAUTH_SECRET: ${{ secrets.TS_OAUTH_SECRET }} # 可选，见 host-setup.md

  destroy:
    if: >-
      vars.PREVIEW_ENABLED == 'true' && github.event_name == 'pull_request' && github.event.action == 'closed' &&
      github.event.pull_request.head.repo.full_name == github.repository
    runs-on: [self-hosted, preview]
    steps:
      - uses: actions/checkout@v7
        with:
          ref: ${{ github.event.repository.default_branch }}
      - uses: riverscn/tailnet-preview@v0.3.0
        with:
          command: destroy

  nightly:
    if: vars.PREVIEW_ENABLED == 'true' && github.event_name == 'schedule'
    runs-on: [self-hosted, preview]
    steps:
      - uses: actions/checkout@v7
      - uses: riverscn/tailnet-preview@v0.3.0
        with:
          command: nightly
        env:
          TS_OAUTH_SECRET: ${{ secrets.TS_OAUTH_SECRET }}

  manual:
    if: vars.PREVIEW_ENABLED == 'true' && github.event_name == 'workflow_dispatch'
    runs-on: [self-hosted, preview]
    steps:
      - uses: actions/checkout@v7
      - uses: riverscn/tailnet-preview@v0.3.0
        with:
          command: run
          args: ${{ inputs.args }}
        env:
          TS_OAUTH_SECRET: ${{ secrets.TS_OAUTH_SECRET }}
```

如果想等测试通过后再部署，改为把 `deploy` 任务放进你的 CI 工作流，并加上 `needs: [your-test-jobs]`。

action 的输入：`command`（`deploy`、`destroy`、`nightly`、`run`）、`config`（默认 `.tailnet-preview`）、`args`（用于 `run`）、`language`（`en` 或 `zh-CN`，用于 PR 评论）、`github-token`。输出：`environment`、`url`、`mode`（`forked`、`upgraded` 或 `fresh`）。

## 5. 第一个 PR

添加 `.tailnet-preview/` 的那个 PR 无法复制基线：默认分支还没有接入 tailnet-preview。它的环境用空的数据卷创建（先执行迁移，再灌演示数据），PR 评论里也会说明这一点。合并后，会从默认分支创建基线；之后的每个 PR 都会复制它。
