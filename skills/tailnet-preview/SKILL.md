---
name: tailnet-preview
description: >-
  Set up, extend and troubleshoot tailnet-preview, per-pull-request preview environments on the person's own
  Linux machine, reachable only through their Tailscale tailnet. Use when someone wants previews for a
  repository, needs to prepare a preview host, tailnet or GitHub runner, add another project to an existing
  host, switch to the shared ingress, or asks why a preview deploy failed or a preview address does not open.
---

# tailnet-preview

tailnet-preview gives every pull request a complete copy of an application on a machine the person owns,
with data copied from a long-lived baseline of the default branch, at a private HTTPS address only their
tailnet can open. A GitHub Actions job on a self-hosted runner labelled `preview` runs the engine,
`tailnet-preview` (Bash and Docker Compose), and comments on the PR with the address or the cause of a
failure.

This skill is an interactive guide. You ask a few questions, find out what already exists, then lead the
person through the remaining steps, doing the ones you can and handing them the ones only they can do.

## The documentation is the source of truth

Read the guide for the step you are on before acting; this skill only says when and in which order. Fetch
the raw files (append the path to the base URL):

- Base: `https://raw.githubusercontent.com/riverscn/tailnet-preview/main/`. If the project's
  `.github/workflows/preview.yml` already pins a version (`riverscn/tailnet-preview@v0.4.0`), use that tag
  instead of `main`, so the docs match the engine that runs.
- `docs/agent-guide.md`: the phases, who does each step, and the check for each. Follow it.
- `docs/host-setup.md`: the tailnet, the machine, the runner, the shared ingress.
- `docs/configuring.md`: writing `.tailnet-preview/` step by step, ending in a checklist.
- `docs/repository-setup.md`: the `PREVIEW_ENABLED` variable, the workflow file, the first pull request.
- `docs/troubleshooting.md`: every failure reason code with its cause and fix.
- `docs/security.md`: read it before anything else when the repository is public.
- `docs/design.md`: every setting, command and exit code.

Every document has a Simplified Chinese version (`docs/<name>.zh-CN.md`). Talk to the person in the
language they write in, and when that is Chinese, quote the Chinese guides to them.

## Rules

1. **Never ask for a secret in the chat, and never print one.** The Tailscale OAuth client secret
   (`tskey-client-…`) and DNS API tokens are written by the person into the file or GitHub setting the step
   names. Check that a secret is there without showing it, for example
   `grep -c '^TS_OAUTH_SECRET=tskey-client-' ~/.config/tailnet-preview/env` prints `1`.
2. **Batch the person's steps.** Before a phase that needs them, give one numbered list of everything they
   must do in it, with the exact pages and values filled in. Wait until they say it is done, then run the
   checks. Do not ask one question at a time.
3. **Ask before changing their things:** a repository variable, a runner, a commit, a pull request, a line
   in their host configuration. Say what you will change and wait for a yes.
4. **Destructive commands need a yes:** `destroy`, `reset main`, `prune`, removing volumes or `~/previews/`.
5. **Keep everything preview-specific in `.tailnet-preview/` and the workflow file.** Do not change how the
   project runs elsewhere, never point a preview at real user data, and never copy production credentials
   into the configuration.

## Step 1: find out what the person wants

Work out which of these it is from what they said; ask only if it is unclear:

| Goal                                             | Go to                                |
| ------------------------------------------------ | ------------------------------------ |
| Previews for a project, nothing set up yet       | Step 2, then "First setup"           |
| Another project on a host that already runs some | Step 2, then "Adding a project"      |
| Only the host, tailnet or runner                 | Step 2, then the matching phase only |
| Faster, more reliable addresses (own domain)     | "Shared ingress"                     |
| A deploy failed, or an address does not open     | "Troubleshooting"                    |
| Everyday tasks: list, rebuild, reset, update     | "Day to day"                         |

## Step 2: ask once, then look

Ask in one message, leaving out what you already know from the conversation or the repository:

- Which repository (`owner/name`) gets previews? Is it public? (Public: read `docs/security.md` with them
  first.)
- Which Linux machine runs the previews, and can you reach a shell on it (you run on it, or over `ssh`)?
  Does that user have `sudo`?
- Does the machine or tailnet already serve tailnet-preview for another project?
- Address mode: `sidecar` (default, nothing beyond Tailscale) or `shared` (a domain of theirs with a DNS
  provider API). Recommend `sidecar` unless they need previews reachable right after the deploy.

Then check what exists, and tell the person in a short list what is done and what is left:

```bash
docker compose version && docker ps              # Docker usable without sudo
tailnet-preview version && tailnet-preview host-check   # engine installed, host prerequisites
grep -c '^TS_OAUTH_SECRET=tskey-client-' ~/.config/tailnet-preview/env   # 1 = secret stored
gh auth status                                   # wherever gh runs
gh api repos/OWNER/NAME/actions/runners --jq '.runners[] | [.name, .status, (.labels | map(.name) | join(","))]'
gh variable list --repo OWNER/NAME               # PREVIEW_ENABLED
ls .tailnet-preview/ .github/workflows/preview.yml   # in the project's checkout
```

A missing command or a `FAIL` line tells you which phase to start from. Skip the phases that pass.

## First setup

Follow `docs/agent-guide.md` phase by phase. In short:

| Phase | What                                                                                   | Who                      | Done when                                                    |
| ----- | -------------------------------------------------------------------------------------- | ------------------------ | ------------------------------------------------------------ |
| 1     | Tailnet: MagicDNS + HTTPS, `tag:preview` and its access rule, an OAuth client          | Person (browser)         | They confirm all three; the first deploy proves it           |
| 2     | Machine: Docker with Compose, user in `docker` group, Docker Hub reachable, the engine | You (`sudo` may be them) | `tailnet-preview host-check` has no `FAIL` except the secret |
| 3     | `TS_OAUTH_SECRET` in `~/.config/tailnet-preview/env`                                   | Person                   | The `grep -c` above prints `1`                               |
| 4     | Self-hosted runner labelled `preview`, installed as a service                          | You, after a yes         | The runners query lists it `online` with `preview`           |
| 5     | `.tailnet-preview/` from `tailnet-preview init`, completed per `docs/configuring.md`   | You, on a branch         | `tailnet-preview validate` reports `0 error(s)`; smoke test  |
| 6     | Workflow file, `PREVIEW_ENABLED=true`, the first pull request                          | You, after a yes         | The PR comment says **Preview environment ready**            |

For phase 1, hand the person the policy lines already filled in: the ports are 443 plus every port in the
project's `PORTS` (from `.tailnet-preview/config.env` when it exists). For phase 5, do not invent values
you cannot find in the repository: leave a `TODO` and ask. Show the person the warnings `validate` prints.

The first pull request gets fresh demo data because no baseline exists yet; merging it creates the
baseline. Ask the person to open the address from a device in their tailnet: you usually cannot.

## Adding a project

The tailnet and the machine are done once. For another project, check phases 1 to 3 instead of repeating
them, then:

- Phase 4: a repository owned by a personal account needs its own runner, in its own directory on the
  machine; repositories of an organization can share one organization-level runner.
- Phases 5 and 6 as above. Add the project's extra `PORTS` to the tailnet's access rule (the person does
  that in the admin console).

## Shared ingress

Follow the optional section of `docs/agent-guide.md` and `docs/host-setup.md` section 4. The person
creates the DNS API token and writes it into the host configuration; you may write the lines without
secrets (`TP_INGRESS=shared`, `TP_INGRESS_DOMAIN`, `TP_INGRESS_DNS_PROVIDER`, `TP_INGRESS_DNS_ENV`,
`TP_INGRESS_ACME_EMAIL`) after asking. Run `tailnet-preview ingress up` and give the person the address it
prints for the split DNS entry; they also add port 53 to the access rule. Check with
`tailnet-preview doctor <env>` that the certificate is `issued`, then redeploy each existing environment.

## Troubleshooting

Look in this order, and quote the cause and fix from `docs/troubleshooting.md` instead of guessing:

1. The PR comment names a reason code when the engine recognizes the cause: `gh pr view <n> --comments`.
2. The failed run: `gh run view <run> --log-failed`; the action's **Diagnostics** step prints the
   environment's state.
3. On the host: `tailnet-preview doctor <env>` (`main`, `pr-<n>` or `br-<branch>`), read-only.

The common ones:

| Symptom or reason                             | Usually                                                                             |
| --------------------------------------------- | ----------------------------------------------------------------------------------- |
| The job waits for a runner forever            | No online runner labelled `preview` for this repository                             |
| `ts_secret`                                   | `TS_OAUTH_SECRET` is neither in the host file nor a repository secret               |
| `ts_login`                                    | The OAuth secret was revoked, or `tag:preview` is missing from `tagOwners`          |
| `https`                                       | HTTPS certificates are not enabled in the tailnet's DNS settings                    |
| `cert` notice: "ready" but HTTPS pending      | Tailscale's certificate is retried automatically; wait, `doctor` shows the attempts |
| `registry` or `build` with `connection reset` | The host cannot reach Docker Hub: a proxy or registry mirror for the Docker daemon  |
| `fork`, `migrate`, `seed`, `health`, `config` | The project's configuration or code; read the step's output in the run              |
| "Ready", but the browser cannot find the site | The browsing device does not use Tailscale DNS                                      |
| The browser times out                         | The access rule does not let the device reach `tag:preview` on that port            |
| The address ends in `-1`                      | An old node holds the name: remove it in the admin console, rename, push again      |

## Day to day

| Task                     | How                                                                                                                     |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| What exists on the host  | `tailnet-preview list`                                                                                                  |
| Rebuild a PR environment | (yes first) `tailnet-preview destroy pr-<n>`, then `gh run rerun <run>`                                                 |
| Copy the baseline again  | (yes first) `tailnet-preview reset pr-<n>`                                                                              |
| Start the baseline over  | (yes first) `gh workflow run preview.yml -f args='reset main'`                                                          |
| Update tailnet-preview   | (yes first) read `CHANGELOG.md`, change the pinned version in the workflow; on the host `git -C ~/tailnet-preview pull` |

Finish each session by telling the person what is set up, what was checked, and anything still left to
them.
