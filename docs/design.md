# Design

This document is the source of truth for how tailnet-preview works and what it expects from a project.
Change it first when the design changes.

## 1. Goals and non-goals

**Goals**

- Every pull request gets its own running copy of the application, built from the PR's code.
- A long-lived **baseline** environment tracks the default branch. A PR environment starts with a copy of
  the baseline's data, so a PR is tested the way it will be deployed: existing data upgraded by the PR's
  migrations.
- Environments are reachable **only inside your tailnet** (Tailscale), over HTTPS, with no public ingress.
- One ordinary Linux machine (a home server, a VM) hosts the environments of many projects. The machine
  needs no per-project setup.
- Everything is driven by GitHub Actions; there is nothing to operate by hand in normal use.
- **A thin core.** The engine manages environments, not applications: it does not know which database a
  project uses. A project describes its services, database included, in an ordinary `compose.yaml`.

**Non-goals**

- Production hosting. Preview environments run mock providers and demo data, never real user data.
- Multi-host scheduling, autoscaling, or Kubernetes.
- Database-specific features (logical dumps, template databases). Data is copied as Docker volumes.
- Untrusted contributors. Deploying a PR runs its code on the host (see [security.md](security.md)).

## 2. Moving parts

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

| Part                                      | Where                    | What it does                                                                                                   |
| ----------------------------------------- | ------------------------ | -------------------------------------------------------------------------------------------------------------- |
| Engine `bin/tailnet-preview`              | this repository          | Creates, forks, upgrades, destroys, backs up and diagnoses environments on the host                            |
| Composite action `action.yml`             | this repository          | What workflows call: builds images, decides fork or fresh, deploys, prints diagnostics, updates the PR comment |
| Project configuration `.tailnet-preview/` | the project's repository | The project's services, images, which volumes hold data, comment text                                          |
| Preview host                              | your machine             | Docker, a self-hosted runner labelled `preview`, one machine-wide Tailscale OAuth secret                       |

## 3. Environments

| Environment | Name          | Data comes from                                                                                               | Lifetime                     |
| ----------- | ------------- | ------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| Baseline    | `main`        | First deploy: empty volumes → migrate → seed. Later pushes to the default branch upgrade it in place          | Until stopped by hand        |
| PR          | `pr-<number>` | A copy of the baseline's `DATA_VOLUMES`, then the PR's migrations. Later pushes to the PR upgrade it in place | Destroyed when the PR closes |

- **Forking copies volumes.** The engine creates the PR environment's containers and volumes without
  starting them, stops the baseline's services (not its Tailscale node), copies each volume in
  `DATA_VOLUMES` file by file (`cp -a`), and starts the baseline again whether or not the copy worked. The
  baseline is unavailable for the few seconds the copy takes; the copy is consistent because nothing writes
  to the volumes meanwhile. Any database works, and so do uploaded files or search indexes kept in volumes.
- **Fresh environments.** A PR environment is created like a baseline (empty volumes → migrate → seed)
  when there is no baseline to copy: the PR that adopts tailnet-preview (the default branch has no
  `.tailnet-preview/` yet), or a project without `DATA_VOLUMES`. Merging the adopting PR creates the
  baseline.
- **Migrations only move forward.** If a PR edits a migration that already ran in its environment, the
  environment no longer matches the code; reset it (it is copied from the baseline again).
- An environment counts as existing only after it was created successfully once (an `initialized` marker).
  A half-created environment is recreated from scratch on the next deploy: its containers and volumes are
  removed first, except the Tailscale node's state.
- Every environment runs its own copy of every service, database included. Budget memory accordingly.
  Limits: at most `MAX_ENVS` PR environments per project (default 8), and no new PR environment when the
  host has less than `MIN_FREE_MB` of available memory (default 1536). Hitting a limit is not a failure; the
  PR comment says so.

## 4. Host layout

Everything a project owns on the host is prefixed with the project name (the repository name in lower case,
non-alphanumerics replaced by `-`), so projects never collide:

| Resource                        | Name                                                                                       |
| ------------------------------- | ------------------------------------------------------------------------------------------ |
| State directory                 | `~/previews/<project>/` (generated secrets, environment directories, backups, lock)        |
| Compose project per environment | `<project>-<env>`; its volumes are `<project>-<env>_<volume>`                              |
| Images                          | `<project>-<image>:<12-char commit>`, labelled `tailnet-preview.project=<project>`         |
| Tailscale node                  | `<project>-<env>`; the baseline's node is persistent, PR nodes are ephemeral               |
| Backups                         | `~/previews/<project>/backups/main-<timestamp>/<volume>.tar.gz`, the newest `KEEP_BACKUPS` |

Machine-wide configuration lives in `~/.config/tailnet-preview/env` and currently holds only
`TS_OAUTH_SECRET` (and optionally `TS_TAGS`). A repository secret `TS_OAUTH_SECRET`, when set, takes
precedence.

All state-changing commands of a project are serialized with `flock` on `~/previews/<project>/.lock`.
GitHub's `concurrency` groups are not used because they cancel queued runs instead of waiting.

## 5. Project configuration

A project adopts tailnet-preview by adding a directory, `.tailnet-preview/` by default:

```
.tailnet-preview/
  config.env      required   images, HTTP upstream, health check, data volumes, limits
  compose.yaml    required   the project's services, database included
  comment.md      optional   appended to the "ready" PR comment (demo accounts, hints)
  …               optional   anything compose.yaml refers to by relative path (init scripts, config files)
```

The whole directory is copied into the environment's state directory on every deploy and is the compose
project directory, so relative paths in `compose.yaml` resolve inside it, and an environment keeps working
(restart, stop/start) after the checkout it came from is gone.

### 5.1 `config.env`

Plain `KEY=value` lines; `#` starts a comment. The file is parsed, not executed.

| Key            | Default      | Meaning                                                                                                                                                               |
| -------------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `IMAGES`       | – (required) | Space-separated `name=path/to/Dockerfile`. Build context is the repository root. Image `name` is available to compose as `${TP_IMAGE_<NAME>}` (upper case, `-` → `_`) |
| `HTTP`         | – (required) | `service:port` that HTTPS port 443 proxies to, e.g. `web:80`                                                                                                          |
| `PORTS`        | empty        | Extra HTTPS ports, space-separated `port=service:port`, e.g. `8025=mailpit:8025`                                                                                      |
| `HEALTH_PATH`  | `/`          | Path requested through `HTTP` until it answers 2xx/3xx; deploys fail if it does not within two minutes                                                                |
| `DATA_VOLUMES` | empty        | Space-separated names of volumes in `compose.yaml` that hold data: copied from the baseline into new PR environments, backed up nightly. Empty: every PR starts fresh |
| `SECRETS`      | empty        | Space-separated variable names; each gets a random value generated once per project and kept on the host                                                              |
| `MAX_ENVS`     | `8`          | Maximum number of PR environments                                                                                                                                     |
| `MIN_FREE_MB`  | `1536`       | Minimum available host memory to create a PR environment                                                                                                              |
| `KEEP_BACKUPS` | `7`          | Number of daily baseline backups to keep                                                                                                                              |

### 5.2 `compose.yaml`

The project's services, merged with the engine's overlay (`lib/compose.overlay.yaml`), which adds the
service `ts`: the Tailscale sidecar. It serves `https://<project>-<env>.<tailnet>.ts.net` and proxies to
`HTTP` and `PORTS` by service name over the environment's compose network.

Rules:

- Do not define a service named `ts` or a volume named `ts-state`.
- Do not publish ports (`ports:`); only the sidecar should reach the services.
- Do not give data volumes a fixed `name:`; every environment needs its own.
- Secrets that services share, such as a database password, belong in `SECRETS`, so that a copied database
  and the services of the PR environment agree on them.

Variables available for interpolation:

| Variable               | Value                                                                  |
| ---------------------- | ---------------------------------------------------------------------- |
| `TP_PROJECT`, `TP_ENV` | Project and environment name                                           |
| `TP_URL`               | `https://<node>.<tailnet>.ts.net`, known before project services start |
| `TP_IMAGE_<NAME>`      | Image tag for each entry of `IMAGES`                                   |
| each name in `SECRETS` | Its generated value                                                    |

**Tasks.** Services in the `tasks` profile are run with `docker compose run --rm`, not kept running. They
usually `depends_on` the database with `condition: service_healthy`:

- `migrate` (optional): runs on every deploy, before the services start.
- `seed` (optional): runs once, when an environment is created with empty volumes (baseline, fresh PR).

## 6. Commands

```
tailnet-preview build [--tag TAG]                 build the project's images (skips images that exist)
tailnet-preview has ENV                           exit 0 if the environment exists, 2 if it does not
tailnet-preview deploy ENV [--tag TAG] [--fresh]  create or upgrade; prints the URL on stdout
tailnet-preview reset ENV [--tag TAG]             recreate (baseline: back up first, keep the Tailscale node)
tailnet-preview destroy ENV [--force]             remove containers, volumes and the Tailscale node
tailnet-preview stop|start ENV                    stop or start, keeping data
tailnet-preview url ENV | info ENV | list         show URLs; info: url, tag and how it was created (mode)
tailnet-preview backup                            archive the baseline's DATA_VOLUMES, keep KEEP_BACKUPS
tailnet-preview prune [OPEN_PR_NUMBERS…]          destroy environments of closed PRs, remove unused images
tailnet-preview doctor ENV                        read-only diagnostics
tailnet-preview compose ENV ARGS…                 run docker compose for an environment
tailnet-preview host-check                        check the host's prerequisites
```

Engine settings come from the environment: `TP_SOURCE` (repository checkout, default the current
directory), `TP_CONFIG` (default `$TP_SOURCE/.tailnet-preview`), `TP_PROJECT`, `TP_HOME` (default
`~/previews`), `TP_HOST_CONFIG`, `TP_FAILURE_FILE`, `TS_OAUTH_SECRET`. The default `--tag` is the first 12
characters of `git rev-parse HEAD` in `TP_SOURCE`.

`mode` (from `info`) is `forked`, `fresh` or `upgraded`: how the environment's latest deploy got its data.

Exit codes: `0` success, `1` failure, `3` a limit was hit (no environment created), `4` the baseline does
not exist (deploy a PR environment with `--fresh`, or deploy `main` first).

Only `deploy`, `reset`, `url`, `info` and `list` write to stdout. Everything else, including the output of
compose and of the project's tasks, goes to stderr.

## 7. Failures

When the engine recognizes the cause of a failure it writes `<code><TAB><detail>` to `TP_FAILURE_FILE`
(the action sets it to `$RUNNER_TEMP/tailnet-preview-failure`). The PR comment turns the code into a cause
and the steps to fix it (`lib/comment.cjs`, `REASONS`), matching the table in
[troubleshooting.md](troubleshooting.md). Codes: `config`, `registry`, `build`, `ts_secret`, `ts_login`,
`https`, `fork`, `migrate`, `seed`, `health`.

`https` is special: the environment was created and is kept, but browsers cannot connect because the
tailnet does not issue HTTPS certificates. The deploy fails so that the PR says so instead of "ready".

Pulls from the image registry are retried, one image at a time, because flaky links to Docker Hub reset
connections and a parallel pull aborts every image when one connection drops.

## 8. The action

`uses: riverscn/tailnet-preview@v1` with `command`:

| `command` | Typical trigger                                                              | Does                                                                                                                          |
| --------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `deploy`  | `pull_request` (opened, synchronize, reopened), `push` to the default branch | Builds images, initializes the baseline from the base branch if needed (or deploys fresh), deploys, prints `doctor`, comments |
| `destroy` | `pull_request` closed                                                        | Destroys `pr-<number>`, updates the PR comment                                                                                |
| `nightly` | `schedule`                                                                   | Backs up the baseline, prunes environments of closed PRs and unused images                                                    |
| `run`     | `workflow_dispatch`                                                          | Runs an engine command given in `args`, e.g. `reset main`                                                                     |

The action locates its own scripts through `github.action_path`, so a workflow pinned to `@v1.2.3` runs
exactly that version of the engine.

## 9. Versioning

Semantic versioning. Releases are tagged `vX.Y.Z`; the moving tag `vX` points at the latest release of a
major version. Breaking changes to the project configuration, variables, commands or action inputs require a
new major version.
