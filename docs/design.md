# Design

[简体中文](design.zh-CN.md)

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

This section and sections 3 to 7 describe the default mode, `sidecar`: every environment has its own
Tailscale node. The `shared` mode replaces the sidecars with one ingress per host; section 10 describes it.

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
| Project configuration `.tailnet-preview/` | the project's repository | Which compose files and images make an environment, its entry point, which volumes hold data, comment text     |
| Preview host                              | your machine             | Docker, a self-hosted runner labelled `preview`, one machine-wide Tailscale OAuth secret                       |

## 3. Environments

| Environment | Name          | Data comes from                                                                                               | Lifetime                                                             |
| ----------- | ------------- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Baseline    | `main`        | First deploy: empty volumes → migrate → seed. Later pushes to the default branch upgrade it in place          | Until stopped by hand                                                |
| PR          | `pr-<number>` | A copy of the baseline's `DATA_VOLUMES`, then the PR's migrations. Later pushes to the PR upgrade it in place | Destroyed when the PR closes                                         |
| Branch      | `br-<branch>` | Like a PR environment, for a branch without an open PR (optional, the action's `branches` input)              | Destroyed when the branch is deleted, gets a PR or no longer matches |

- **Which PRs and branches get one** is up to the project's workflow, through two action inputs (section
  8): `drafts` (draft PRs too, the default, or only once they are ready for review) and `branches` (none,
  the default; every branch, `*`; or branches matching patterns such as `release/* feature/*`). A branch
  with an open PR is served by the PR's environment only. A branch environment's name is the branch
  name in lower case with every other character replaced by `-` (`feature/Login` → `br-feature-login`),
  shortened with a hash of the branch name when `<project>-br-<…>` would exceed 63 characters, the limit
  of a DNS label; two branches that differ only in such characters share an environment.
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
  Limits: at most `MAX_ENVS` PR and branch environments per project (default 8), and no new environment when the
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

Machine-wide configuration lives in `~/.config/tailnet-preview/env`: `TS_OAUTH_SECRET`, optionally
`TS_TAGS`, and the shared ingress's settings (section 10.5), whose state lives in `~/previews/.ingress/`. A repository secret `TS_OAUTH_SECRET`, when set, takes
precedence.

All state-changing commands of a project are serialized with `flock` on `~/previews/<project>/.lock`.
GitHub's `concurrency` groups are not used because they cancel queued runs instead of waiting.

## 5. Project configuration

A project adopts tailnet-preview by adding a directory, `.tailnet-preview/` by default. How to write it,
step by step: [configuring.md](configuring.md).

```
.tailnet-preview/
  config.env      required   images, compose files, HTTP upstream, health check, data, secrets, limits
  compose.yaml    usual      what previews need: the whole environment, or an override of the project's file
  comment.md      optional   appended to the "ready" PR comment (demo accounts, hints)
```

The project's own compose files can be reused **unchanged**: `COMPOSE_FILES` lists the files merged for an
environment, for example `../compose.yaml compose.yaml` (the project's file, then a small override). The
engine adds what every environment needs:

- the Tailscale sidecar (`lib/compose.overlay.yaml`), first;
- an isolation override, last, that removes every service's published `ports` and fixed `container_name`,
  which would collide between environments running side by side. Compose already gives every
  environment its own container, network and volume names (`<project>-<env>-…`).

**Snapshot.** Every deploy copies the repository's working tree (tracked files and untracked files git does
not ignore) into the environment's state directory, with the configuration directory on top. Compose runs
from that copy, so relative paths (bind-mounted init scripts, config files) work and an environment can be
restarted after the checkout is gone. Relative paths in all compose files resolve against the directory of
the first `COMPOSE_FILES` entry (standard Compose behaviour for several `-f` files).

### 5.1 `config.env`

Plain `KEY=value` lines; `#` starts a comment. The file is parsed, not executed.

| Key             | Default        | Meaning                                                                                                                                                                                               |
| --------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `IMAGES`        | – (required)   | Space-separated `name=path/to/Dockerfile`. Build context is the repository root. Image `name` is available to compose as `${TP_IMAGE_<NAME>}` (upper case, `-` → `_`)                                 |
| `HTTP`          | – (required)   | `service:port` that HTTPS port 443 proxies to, e.g. `web:80`: the container port, not a published one                                                                                                 |
| `COMPOSE_FILES` | `compose.yaml` | Space-separated compose files merged in order, relative to the configuration directory; they must lie inside the repository                                                                           |
| `PORTS`         | empty          | Extra HTTPS ports, space-separated `port=service:port`, e.g. `8025=mailpit:8025`                                                                                                                      |
| `HEALTH_PATH`   | `/`            | Path requested through `HTTP` until it answers 2xx/3xx; deploys fail if it does not within two minutes                                                                                                |
| `DATA_VOLUMES`  | `auto`         | Volumes copied from the baseline into new PR environments and backed up nightly: `auto` (every named volume), `none` (every PR starts with empty data and is seeded), or space-separated volume names |
| `SECRETS`       | empty          | Space-separated variable names; each gets a random value generated once per project, kept on the host and identical in every environment                                                              |
| `MAX_ENVS`      | `8`            | Maximum number of PR and branch environments                                                                                                                                                          |
| `MIN_FREE_MB`   | `1536`         | Minimum available host memory to create a PR environment                                                                                                                                              |
| `KEEP_BACKUPS`  | `7`            | Number of daily baseline backups to keep                                                                                                                                                              |

### 5.2 Compose files

Rules:

- Do not define a service named `ts` or a volume named `ts-state`.
- Do not give volumes a fixed `name:` and do not make data volumes `external`; every environment needs its
  own. (`validate` reports both.)
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
tailnet-preview prune [KEEP…]                     destroy PR and branch environments not listed (PR numbers,
                                                  br-<branch> names), remove unused images
tailnet-preview branch-env [--match PATTERNS] BRANCH
                                                  print a branch's environment name; with --match, exit 1
                                                  unless a pattern matches the branch
tailnet-preview doctor ENV                        read-only diagnostics
tailnet-preview validate                          check the configuration without deploying (needs the docker CLI only)
tailnet-preview init                              write a commented .tailnet-preview/ to start from
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
tailnet does not issue HTTPS certificates. The deploy fails so that the PR says so instead of "ready". The
check waits until the sidecar runs: a sidecar that is (re)starting reports no certificate domains yet.

A deploy that succeeds can still leave something the PR should mention: the engine writes
a line `<code><TAB><detail>` per notice to `TP_NOTICE_FILE` and the comment adds them to "ready". The
notices are `hostname` and `cert`.

`hostname`: the tailnet already has a device with the environment's name (`<project>-<env>`), usually a node
of an earlier environment that never logged out, so Tailscale named this one with a suffix (`-1`). The
environment works under that address, which the engine reads from the node on every deploy, but not
under the one people expect; `doctor` warns too.

`cert`:
Tailscale requests a node's certificate on the first visit, where a failure only shows as a TLS error in
the browser, so the deploy requests it once the health check passes, waiting at most a minute
(`TP_CERT_TIMEOUT`). A new deploy supersedes the previous one: it first stops the previous retry loop and any
certificate request still running in the sidecar, which would hold it up. The documented workflow does the
same one level up: a newer push to a pull request cancels the deploy job still running for an older one. Let's Encrypt validates the DNS
record Tailscale publishes in the same second it is set, and rejects the order when the record has not
reached public DNS yet (`NXDOMAIN`, or `Incorrect TXT record` when only older values are visible). That is
a timing problem between the two services, not the PR's, so the deploy succeeds with the notice `cert`,
which carries Let's Encrypt's reason (the sidecar fetches it from the order's public authorization). A
loop inside the sidecar, which outlives the deploy job, requests the certificate again after 6, 26 and 71
minutes, then hourly for a day, within Let's Encrypt's five failed validations per name and hour; `doctor`
shows its progress. Requests are at least `TP_CERT_MIN_GAP` (6 minutes) apart after a failure, by the
deploy and by the loop: Let's Encrypt's resolvers remember the missing record for up to the negative TTL of
ts.net (5 minutes), so a request soon after a failure fails the same way. A certificate tailscaled already
has is fetched regardless, since it does not ask Let's Encrypt.

tailscaled itself also requests a certificate whenever its serve configuration has HTTPS and the
certificate is missing: when the configuration loads, hourly, and on every TLS handshake. Every browser
visit would then spend a failure. So the engine keeps serve.json in `/config`, where tailscaled does not
read it, and copies it to `TS_SERVE_CONFIG` in the state volume only once the certificate is there (the
deploy after a request, or the loop once it is issued); after a failed request it serves nothing, and
browsers get a refused connection instead. The copy is replaced by rename, since containerboot rereads the
directory on every change and exits on a half-written file. Once a name has failed five times, Let's Encrypt refuses it until a time it gives
("retry after ... UTC"), and every request meanwhile (a deploy, a retry, a browser visit) only adds to the
failures. The engine reads that time from the sidecar's log: a deploy does not request then, and the loop
first waits until it has passed. Tailscale itself can fail before Let's Encrypt is asked, when setting the
validation record times out (`SetDNS ... context deadline exceeded`); the loop treats it like any failure.
Per-node certificates remain the weak point of this design; the shared ingress (section 10) avoids them.

Pulls from the image registry are retried, one image at a time, because flaky links to Docker Hub reset
connections and a parallel pull aborts every image when one connection drops.

## 8. The action

`uses: riverscn/tailnet-preview@v0.3.0` with `command`:

| `command` | Typical trigger                                                          | Does                                                                                                                                 |
| --------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| `deploy`  | `pull_request` (opened, synchronize, reopened, ready_for_review), `push` | Builds images, initializes the baseline from the base branch if needed (or deploys fresh), deploys, prints `doctor`, comments        |
| `destroy` | `pull_request` closed, `delete` of a branch                              | Destroys `pr-<number>` (and updates the PR comment) or `br-<branch>`                                                                 |
| `nightly` | `schedule`                                                               | Backs up the baseline, prunes environments of closed PRs, of branches that are gone, have a PR or no longer match, and unused images |
| `run`     | `workflow_dispatch`                                                      | Runs an engine command given in `args`, e.g. `reset main`                                                                            |

A push to the default branch deploys the baseline. A push to another branch deploys its branch environment
if `branches` matches it and it has no open PR, and is skipped otherwise; a draft PR is skipped when
`drafts` is `false` (an environment it already has stays until the PR closes). A skipped deploy succeeds and
says why in the job summary. Pass the same `branches` to the `nightly` job, which prunes by it.

`run` uses the code of the ref the workflow checked out, normally the default branch, so it refuses
`deploy` and `reset` of `pr-<n>` and `br-<branch>`: they would put the default branch's code into that
environment. To
rebuild a PR environment, run `destroy pr-<n>` and re-run the PR's deploy job.

The diagnostics, the PR comment and the job result run after a failed deploy, but not after a cancelled
one: a newer push that cancels the job updates the comment itself.

The action locates its own scripts through `github.action_path`, so a workflow pinned to `@v0.3.0` runs
exactly that version of the engine.

## 9. Versioning

Semantic versioning. The interface is the project configuration, the variables, the commands and the action
inputs. Releases are tagged `vX.Y.Z` by the Release workflow (`.github/workflows/release.yml`), with the
notes of that version in `CHANGELOG.md`.

- **0.x** (now): the interface is still settling as the first projects adopt it. A minor version may break
  it, so projects pin the full version (`@v0.3.0`). There is no moving `v0` tag, and releases are marked as
  pre-releases.
- **From 1.0.0**: breaking changes require a new major version, and the moving tag `vX` points at the latest
  release of major version X, so projects can use `@v1`.

## 10. Shared ingress: one per host, one wildcard certificate

Status: source B (own domain) implemented as `TP_INGRESS=shared`, opt-in per host; source A (Tailscale's
own wildcard) waits for Tailscale (10.3). The per-environment sidecar (`TP_INGRESS=sidecar`) stays the
default until `shared` has run on a real host for a while.

### 10.1 Why

Every environment is its own Tailscale node with its own name, so every environment needs its own
certificate, issued while the deploy runs. That is the part that keeps failing, and it is not under our
control:

- **Validation races Tailscale's DNS.** Tailscale's `set-dns` returns after about 30 seconds and Let's
  Encrypt validates within a second; often the record has not reached every ts.net name server yet
  (`NXDOMAIN`, or `Incorrect TXT record` while older values are visible). Others see the same:
  [tailscale/tailscale#21759](https://github.com/tailscale/tailscale/issues/21759) (open), and a tailnet
  where issuance failed for ten hours and recovered by itself
  ([#20823](https://github.com/tailscale/tailscale/issues/20823)). On our host in October 2026, PR
  environments and the baseline often got their certificate only on the second or third attempt; section 7
  describes how the engine copes.
- **Limits per name and per tailnet.** Five failed validations per name and hour, then the name is refused
  for up to an hour. And because `ts.net` is on the Public Suffix List, Let's Encrypt's 50 new certificates
  per registered domain and week apply **per tailnet**: every new PR environment, every recreated one and
  every other node with HTTPS draws on them. Nodes that serve only plain HTTP draw on them too, until a fix planned for Tailscale 1.106 ([#21693](https://github.com/tailscale/tailscale/issues/21693)).
- **Every environment name is published** in the Certificate Transparency logs (`myapp-pr-42.<tailnet>.ts.net`),
  and a name reused by a new node can trip browsers' CT checks for a while
  ([#15702](https://github.com/tailscale/tailscale/issues/15702)).
- **Side effects of one node per environment:** name collisions (`-1` suffixes), a retry loop in every
  sidecar, and a device in the admin console per environment.

A certificate that is issued once per host and renewed every two months, outside any deploy, removes all
of these at once.

### 10.2 The design

One **ingress** per host instead of one sidecar per environment:

```
browser ──https://myapp-pr-42.preview.example.com──▶ ingress: Tailscale node, kernel mode (tag:preview)
            ▲                                           │  Traefik on <ingress IP>:443 (and PORTS)
            │ split DNS: preview.example.com            │  CoreDNS on <ingress IP>:53
            └── CoreDNS answers *.preview… → ingress IP │
                                                        ▼ route by host name, over each environment's network
                                         myapp-pr-42-web-1:80        myapp-main-web-1:80 …
```

- **Addresses** are `<project>-<env>.<TP_INGRESS_DOMAIN>`, known before anything starts; one wildcard
  certificate `*.<TP_INGRESS_DOMAIN>` covers every environment of every project on the host.
- **The ingress** is one compose project per host (`tailnet-preview-ingress`, files in
  `~/previews/.ingress`): a Tailscale node, persistent, in **kernel mode** (`/dev/net/tun`, `NET_ADMIN`), and
  Traefik and CoreDNS in its network namespace. Kernel mode, because the tailnet's split DNS needs UDP on
  port 53, which `tailscale serve` cannot forward; and tailscaled's own serve cannot route subdomains anyway
  (it asks Let's Encrypt for the exact SNI name and rejects names below the node's own,
  `resolveCertDomain`). Every deploy brings it up to date, so it follows the newest engine on the host.
- **Traefik** listens on the ingress's **tailnet address only**: environments are connected to the ingress
  but cannot use it to reach each other. Entry points: 443, plus every port in a project's `PORTS` (a new
  port restarts Traefik once). Routes come from one file per environment in `routes/`, which Traefik
  watches. The certificate comes from Let's Encrypt by DNS-01 through the DNS provider's API. Before
  Let's Encrypt is asked, lego waits until every authoritative name server has the record (it finds them
  through the host's resolver, or `TP_INGRESS_DNS_RESOLVERS`): the race that
  per-node certificates lose. Some networks (bot-dev's, at first) intercept every DNS query on port 53 and
  answer from a cache that remembers the record as missing, so nothing can be checked from the host: the
  ingress detects that (a query to 192.0.2.1, where no server runs, gets an answer) and waits a fixed time
  instead (`TP_INGRESS_DNS_DELAY`, default 60 seconds then); Let's Encrypt validates from its own
  resolvers.
- **CoreDNS** answers every name under the domain with the ingress's tailnet address, on that address
  only. The tailnet's split DNS sends the domain to it, so names resolve inside the tailnet, never through
  the local network's resolver. Public DNS has no record: resolvers and routers with DNS rebinding
  protection (OpenWrt's default, for one) drop public answers that point to private or CGNAT addresses.
- **Reaching the environments:** the deploy connects the ingress to the networks of the `HTTP` and `PORTS`
  services (`docker network connect`) and writes the routes; the upstream is the container's compose name,
  `<project>-<env>-<service>-1`. The health check goes through Traefik over HTTPS, so a deploy returns only
  once the address answers. Destroy removes the route and disconnects the ingress, so compose can remove
  the network.
- **The project configuration does not change.** `HTTP`, `PORTS` and `TP_URL` keep their meaning; only
  the value of `TP_URL` changes.

### 10.3 Where the wildcard certificate comes from

|                 | A. Tailscale wildcard                                                                                                                                                                                                        | B. Own domain (implemented)                              |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Name            | `*.preview.<tailnet>.ts.net`                                                                                                                                                                                                 | `*.preview.example.com`                                  |
| Issued by       | `tailscale cert '*.preview.<tailnet>.ts.net'` on the ingress node                                                                                                                                                            | Traefik, DNS-01 through the DNS provider's API           |
| Name resolution | MagicDNS answers subdomains of the node with the node attribute `dns-subdomain-resolve`                                                                                                                                      | CoreDNS on the ingress, through the tailnet's split DNS  |
| Needs           | `nodeAttrs` granting `dns-subdomain-resolve` to `tag:preview`                                                                                                                                                                | A domain, a DNS API token on the host, a split DNS entry |
| Available       | **Not yet.** Clients support it since 1.96 ([#1196](https://github.com/tailscale/tailscale/issues/1196)), but Tailscale's hosted control plane does not grant the attribute yet: our nodes' `CapMap` lacks it (October 2026) | Now                                                      |

A remains the goal: no domain, no token, nothing outside Tailscale. When Tailscale grants the attribute,
A replaces Traefik's DNS-01 and CoreDNS; the routing stays.

### 10.4 What gets better, what it costs

Better:

- No certificate work during a deploy: no notice `cert`, no retry loop, no rate limits. A new environment
  answers over HTTPS as soon as it is healthy.
- One certificate per host instead of one per environment: far below the weekly limit, and the
  Certificate Transparency logs show only `*.<TP_INGRESS_DOMAIN>`, not every environment's name.
- One Tailscale device per host: no ephemeral nodes, no `-1` suffixes.

Costs:

- **A host-level component.** If the ingress stops, every environment on the host is unreachable
  (environments keep running); `doctor` shows its state. Containers restart with Docker.
- **Coarser access control.** All environments sit behind one node, so the tailnet policy can no longer
  let a device into one environment but not another. Every environment carried `tag:preview` before too.
- **The ingress can reach every environment.** It is connected to all their networks; it runs images from
  the tailnet-preview release (Tailscale, Traefik, CoreDNS), never from a PR.
- **Addresses change once** when a host switches; links, OAuth callback URLs and the like registered for
  previews must be updated.
- **A DNS token on the host** can change that domain's records; scope it to the one zone and to DNS edits.

### 10.5 Settings and migration

Host settings, in `~/.config/tailnet-preview/env` (or the environment):

| Setting                    | Meaning                                                                                                                                                        |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TP_INGRESS`               | `sidecar` (default) or `shared`                                                                                                                                |
| `TP_INGRESS_DOMAIN`        | e.g. `preview.example.com`; environments are `<project>-<env>.<domain>`                                                                                        |
| `TP_INGRESS_DNS_PROVIDER`  | The DNS provider's name in Traefik/lego, e.g. `cloudflare`, `alidns`, `tencentcloud`. Without it Traefik serves a self-signed certificate (the tests use that) |
| `TP_INGRESS_DNS_ENV`       | Names of the variables holding the provider's credentials, e.g. `CF_DNS_API_TOKEN`; their values are set in the same file                                      |
| `TP_INGRESS_ACME_EMAIL`    | Let's Encrypt's contact address; required with a provider                                                                                                      |
| `TP_INGRESS_DNS_RESOLVERS` | Resolvers lego uses to find the authoritative servers, e.g. `223.5.5.5:53`; default the host's                                                                 |
| `TP_INGRESS_DNS_DELAY`     | Seconds to wait instead of checking; set automatically to 60 when the network intercepts DNS                                                                   |
| `TP_INGRESS_ACME_CA`       | Optional ACME directory, e.g. Let's Encrypt's staging                                                                                                          |
| `TP_INGRESS_HOSTNAME`      | The ingress's Tailscale name; default `tailnet-preview-<host>`                                                                                                 |

Switching a host: prepare the tailnet (split DNS, policy for port 53) and the settings
([host-setup.md](host-setup.md)), then redeploy each environment. A redeploy in shared mode logs the
environment's sidecar out and removes it and its state; switching back removes the route.

If `shared` proves itself, it becomes the default, and the sidecar with everything in section 7 about
certificates goes in a later minor version.

### 10.6 Open questions

- Whether to ask Tailscale for `dns-subdomain-resolve` on the hosted control plane, or wait for it.
- Several hosts in one tailnet each need their own domain (or subdomain) and split DNS entry.
