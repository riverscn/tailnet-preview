# 仓库设置

[English](repository-setup.md)

接入 tailnet-preview 的最后一步：为仓库打开试用环境，并加上部署它们的工作流。在这之前，主机已经准备好（[host-setup.zh-CN.md](host-setup.zh-CN.md)），项目里也有了能通过 `tailnet-preview validate` 的 `.tailnet-preview/` 目录（[configuring.zh-CN.md](configuring.zh-CN.md)）。[example](../example/) 是一个完整的最小项目；每项设置的说明见 [design.zh-CN.md 第 5 节](design.zh-CN.md#5-项目配置)。

## 1. 为仓库启用

- **开关：** 在 GitHub 上打开仓库，Settings → Secrets and variables → Actions → **Variables** 标签页 → New repository variable，名称 `PREVIEW_ENABLED`，值 `true`。设置之前，工作流的任务会直接跳过，而不是一直等待 runner，所以主机准备好之前就可以合并工作流。
- **runner：** Settings → Actions → Runners 里列出了一个标签为 `preview`、状态为 Idle 的 runner（[host-setup.zh-CN.md 第 3 节](host-setup.zh-CN.md#3-runner每个仓库一次或每个组织一次)）。
- **Tailscale 密钥，** 只在你没有把 `TS_OAUTH_SECRET` 保存在主机上时需要（[host-setup.zh-CN.md 第 2.4 步](host-setup.zh-CN.md#2-主机一次)）：Settings → Secrets and variables → Actions → **Secrets** 标签页 → New repository secret，名称 `TS_OAUTH_SECRET`，值为客户端密钥。
- 只在你使用 tailnet-preview 的私有副本时需要：允许你的其他仓库访问它（在它的 Settings → Actions → General → Access 里设置）。

## 2. 添加工作流

在你的仓库里创建文件 `.github/workflows/preview.yml`，内容如下，和 `.tailnet-preview/` 一起提交。按原样，它会部署每个 pull request；要改变这一点，用 `deploy` 和 `nightly` 任务的输入（见文件下方的说明）：

```yaml
name: Preview

on:
  pull_request:
    types: [opened, synchronize, reopened, ready_for_review, closed]
  push:
    branches: [main] # 分支环境：删掉这一行，或者把分支规则也加进来
  delete: # 分支删除时，它的环境也随之删除
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
    # 同一个 PR 或分支有更新的推送时，取消这次部署；推送到默认分支的部署总会跑完。
    concurrency:
      group: preview-deploy-${{ github.event.pull_request.number || github.ref }}
      cancel-in-progress: ${{ github.ref != format('refs/heads/{0}', github.event.repository.default_branch) }}
    runs-on: [self-hosted, preview]
    steps:
      - uses: actions/checkout@v7
      - uses: riverscn/tailnet-preview@v0.3.0
        with:
          command: deploy
          drafts: true # false：只部署已转为 Ready for review 的 PR
          branches: '' # 例如 '*' 或 'release/* feature/*'（nightly 里写同样的值）
        env:
          TS_OAUTH_SECRET: ${{ secrets.TS_OAUTH_SECRET }} # 可选，见 host-setup.md

  destroy:
    if: >-
      vars.PREVIEW_ENABLED == 'true' && (github.event_name == 'delete' ||
      (github.event_name == 'pull_request' && github.event.action == 'closed' &&
       github.event.pull_request.head.repo.full_name == github.repository))
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
          branches: '' # 和 deploy 一样：不再匹配的分支环境会被删除
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

action 的输入：`command`（`deploy`、`destroy`、`nightly`、`run`）、`config`（默认 `.tailnet-preview`）、`args`（用于 `run`）、`language`（`en` 或 `zh-CN`，用于 PR 评论）、`drafts`（默认 `true`；`false` 时草稿 PR 要等转为 Ready for review 才部署）、`branches`（给没有 PR 的分支建环境：默认为空，`*` 表示所有分支，也可以写 `release/* feature/*` 这样的规则）、`github-token`。输出：`environment`（部署被跳过时为空）、`url`、`mode`（`forked`、`upgraded` 或 `fresh`）。

**分支环境**（`br-<分支>`）要求工作流在这些分支有推送时运行（删掉 `push` 下的 `branches: [main]`，或者把规则也写进去），并且在 `delete` 事件时运行；分支环境没有 PR 评论，地址在 job summary 里。哪些 PR 和分支会有环境，见 design.md 第 3 节。

## 3. 第一个 PR

开一个包含 `.tailnet-preview/` 和工作流的 pull request。它的 **deploy** 任务在主机上运行（PR 的 Checks 标签页里能看到）；完成后，PR 上会有一条评论，给出地址和演示账号。从你 tailnet 里一台使用 Tailscale DNS 的设备打开这个地址。如果任务失败，评论会写明原因和修正方法（[troubleshooting.zh-CN.md](troubleshooting.zh-CN.md)）。

这第一个 PR 无法复制基线：默认分支还没有接入 tailnet-preview。它的环境用空的数据卷创建（先执行迁移，再灌演示数据），PR 评论里也会说明这一点。合并后，会从默认分支创建基线；之后的每个 PR 都会复制它。
