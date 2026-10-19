# Project setup

Adopting tailnet-preview in a repository takes a configuration directory and one workflow. The
[example](../example/) is a complete minimal project; the reference for every setting is
[design.md section 5](design.md#5-project-configuration).

Prerequisite: a prepared host ([host-setup.md](host-setup.md)).

## 1. Prepare the application

Preview environments run the project's production images with production settings, plus whatever makes
them safe to share: mock SMS or payment providers, demo data, a mail catcher. The application must read
its public URL and its database connection from environment variables. Never point a preview environment
at real user data.

## 2. Write `.tailnet-preview/`

Follow [configuring.md](configuring.md): it goes step by step through images, compose files, the entry
point, the application's address, mocks, data and tasks, and ends with `tailnet-preview validate` and a
local smoke test. In short, for a project that already has a compose file:

```
.tailnet-preview/
  config.env       IMAGES, COMPOSE_FILES, HTTP, HEALTH_PATH, SECRETS (DATA_VOLUMES defaults to every named volume)
  compose.yaml     an override of the project's compose file: built images, TP_URL, mocks, migrate/seed tasks
  comment.md       optional: demo accounts and hints for the PR comment
```

```sh
IMAGES=api=apps/api/Dockerfile web=apps/web/Dockerfile
COMPOSE_FILES=../compose.yaml compose.yaml
HTTP=web:80
HEALTH_PATH=/api/health
SECRETS=DB_PASSWORD SESSION_SECRET
```

The [example](../example/) is a complete project in this shape: `example/compose.yaml` is its own compose
file, unchanged; `example/.tailnet-preview/` adds what previews need.

## 3. Enable it for the repository

- Settings → Secrets and variables → Actions → **Variables**: `PREVIEW_ENABLED` = `true`. Until then, the
  workflow's jobs are skipped instead of waiting for a runner.
- A self-hosted runner labelled `preview` must serve the repository ([host-setup.md](host-setup.md#3-the-runner-per-repository-or-once-per-organization)).
- If `riverscn/tailnet-preview` is private to you, allow access to it from your other repositories
  (in its Settings → Actions → General → Access).

## 4. Add the workflow

`.github/workflows/preview.yml`:

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
    # Pull requests from forks are never deployed: deploying runs the PR's code on the host.
    if: >-
      vars.PREVIEW_ENABLED == 'true' && (github.event_name == 'push' ||
      (github.event_name == 'pull_request' && github.event.action != 'closed' &&
       github.event.pull_request.head.repo.full_name == github.repository))
    # A newer push to the same pull request supersedes this deploy; pushes to the default branch always finish.
    concurrency:
      group: preview-deploy-${{ github.event.pull_request.number || github.ref }}
      cancel-in-progress: ${{ github.event_name == 'pull_request' }}
    runs-on: [self-hosted, preview]
    steps:
      - uses: actions/checkout@v4
      - uses: riverscn/tailnet-preview@v0.2.2
        with:
          command: deploy
        env:
          TS_OAUTH_SECRET: ${{ secrets.TS_OAUTH_SECRET }} # optional, see host-setup.md

  destroy:
    if: >-
      vars.PREVIEW_ENABLED == 'true' && github.event_name == 'pull_request' && github.event.action == 'closed' &&
      github.event.pull_request.head.repo.full_name == github.repository
    runs-on: [self-hosted, preview]
    steps:
      - uses: actions/checkout@v4
        with:
          ref: ${{ github.event.repository.default_branch }}
      - uses: riverscn/tailnet-preview@v0.2.2
        with:
          command: destroy

  nightly:
    if: vars.PREVIEW_ENABLED == 'true' && github.event_name == 'schedule'
    runs-on: [self-hosted, preview]
    steps:
      - uses: actions/checkout@v4
      - uses: riverscn/tailnet-preview@v0.2.2
        with:
          command: nightly
        env:
          TS_OAUTH_SECRET: ${{ secrets.TS_OAUTH_SECRET }}

  manual:
    if: vars.PREVIEW_ENABLED == 'true' && github.event_name == 'workflow_dispatch'
    runs-on: [self-hosted, preview]
    steps:
      - uses: actions/checkout@v4
      - uses: riverscn/tailnet-preview@v0.2.2
        with:
          command: run
          args: ${{ inputs.args }}
        env:
          TS_OAUTH_SECRET: ${{ secrets.TS_OAUTH_SECRET }}
```

To deploy only after your tests pass, put the `deploy` job in your CI workflow with
`needs: [your-test-jobs]` instead.

Action inputs: `command` (`deploy`, `destroy`, `nightly`, `run`), `config` (default `.tailnet-preview`),
`args` (for `run`), `language` (`en` or `zh-CN`, for the PR comment), `github-token`. Outputs:
`environment`, `url`, `mode` (`forked`, `upgraded` or `fresh`).

## 5. The first pull request

The PR that adds `.tailnet-preview/` cannot copy a baseline: the default branch does not use
tailnet-preview yet. Its environment is created with empty volumes (migrate, then seed), and the PR comment
says so. Merging it creates the baseline from the default branch; every later PR copies it.
