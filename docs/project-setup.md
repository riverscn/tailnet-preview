# Project setup

Adopting tailnet-preview in a repository takes a configuration directory and one workflow. The
[example](../example/) is a complete minimal project; the reference for every setting is
[design.md section 5](design.md#5-project-configuration).

Prerequisite: a prepared host ([host-setup.md](host-setup.md)).

## 1. Make your application configurable for previews

Preview environments run your production images with production settings, plus whatever makes them safe
to share: mock SMS or payment providers, a demo data seed, a local mail catcher. Typical needs:

- the public URL comes from the environment (`TP_URL`), not from a hard-coded domain;
- database connection settings come from the environment (the database is a service of the environment);
- a seed command that loads demo data and refuses to run in real production unless explicitly allowed.

Never point a preview environment at real user data.

## 2. Add `.tailnet-preview/`

```
.tailnet-preview/
  config.env       images, HTTP upstream, health check, data volumes
  compose.yaml     your services, database included
  comment.md       optional: text for the PR comment (demo accounts…)
  db/init.sql      optional: anything compose.yaml mounts by relative path
```

`config.env`:

```sh
# name=Dockerfile, build context is the repository root
IMAGES=api=apps/api/Dockerfile web=apps/web/Dockerfile
# https://<node>.<tailnet>.ts.net proxies to this service:port
HTTP=web:80
# extra HTTPS ports, e.g. a mail catcher's UI
PORTS=8025=mailpit:8025
HEALTH_PATH=/api/health
# volumes that hold data: a new PR environment starts with a copy of the baseline's
DATA_VOLUMES=db-data
# generated once per project on the host, the same in every environment, available to compose by name
SECRETS=DB_PASSWORD SESSION_SECRET
```

`compose.yaml` describes the environment the way your local `docker compose` setup does, using the
variables the engine provides (`TP_URL`, `TP_ENV`, `TP_IMAGE_<NAME>`, your `SECRETS`):

```yaml
x-env: &env
  NODE_ENV: production
  APP_URL: ${TP_URL}
  DATABASE_URL: postgres://app:${DB_PASSWORD}@db:5432/app
  SESSION_SECRET: ${SESSION_SECRET}
  SMTP_URL: smtp://mailpit:1025

x-needs-db: &needs-db
  db:
    condition: service_healthy

services:
  db:
    image: postgres:17-alpine
    environment:
      POSTGRES_USER: app
      POSTGRES_PASSWORD: ${DB_PASSWORD}
      POSTGRES_DB: app
    volumes:
      - db-data:/var/lib/postgresql/data
      # runs once, when the volume is empty: roles, extensions
      - ./db/init.sql:/docker-entrypoint-initdb.d/init.sql:ro
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -h 127.0.0.1 -U app -d app']
      interval: 2s
      retries: 30
    restart: unless-stopped
  web:
    image: ${TP_IMAGE_WEB}
    restart: unless-stopped
  api:
    image: ${TP_IMAGE_API}
    environment: *env
    depends_on: *needs-db
    restart: unless-stopped
  mailpit:
    image: axllent/mailpit:v1.31
    restart: unless-stopped

  # tasks, run with `docker compose run --rm`
  migrate:
    image: ${TP_IMAGE_API}
    profiles: [tasks]
    environment: *env
    depends_on: *needs-db
    command: ['node', 'dist/migrate.js']
  seed:
    image: ${TP_IMAGE_API}
    profiles: [tasks]
    environment: *env
    depends_on: *needs-db
    command: ['node', 'dist/seed.js']

volumes:
  db-data:
```

Rules ([design.md 5.2](design.md#52-composeyaml)):

- Do not publish ports (`ports:`): the sidecar reaches services over the compose network, and nothing else
  should. Do not define a service named `ts`.
- Do not give data volumes a fixed `name:`; every environment needs its own.
- Passwords shared by the database and the services go in `SECRETS`. A PR environment's database is a copy
  of the baseline's, so it keeps the baseline's passwords; a secret generated per environment would not
  match.
- Anything else can be a volume too: list uploaded files or a search index in `DATA_VOLUMES` to copy them
  with the database.

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
    runs-on: [self-hosted, preview]
    steps:
      - uses: actions/checkout@v4
      - uses: riverscn/tailnet-preview@v1
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
      - uses: riverscn/tailnet-preview@v1
        with:
          command: destroy

  nightly:
    if: vars.PREVIEW_ENABLED == 'true' && github.event_name == 'schedule'
    runs-on: [self-hosted, preview]
    steps:
      - uses: actions/checkout@v4
      - uses: riverscn/tailnet-preview@v1
        with:
          command: nightly
        env:
          TS_OAUTH_SECRET: ${{ secrets.TS_OAUTH_SECRET }}

  manual:
    if: vars.PREVIEW_ENABLED == 'true' && github.event_name == 'workflow_dispatch'
    runs-on: [self-hosted, preview]
    steps:
      - uses: actions/checkout@v4
      - uses: riverscn/tailnet-preview@v1
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
