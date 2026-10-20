# Changelog

All notable changes are documented here. The project follows [Semantic Versioning](https://semver.org).

## Unreleased

### Added

- An agent skill, `skills/tailnet-preview/`, installed with `npx skills add riverscn/tailnet-preview`. It
  guides a person through setup, adding a project, the shared ingress and troubleshooting, by asking
  questions and following the documentation.

### Changed

- The README gives a prompt to paste into an AI coding agent to set up previews.

## 0.4.0 - 2026-10-20

### Added

- Action inputs to choose what gets an environment. `drafts: false` skips draft pull requests until they are
  ready for review (the default deploys them, as before). `branches` gives branches without a pull request
  an environment of their own, `br-<branch>`: none by default, `*` for every branch, or globs such as
  `release/* feature/*`. A branch environment is removed when its branch is deleted (the `delete` event),
  gets a pull request, or no longer matches (by `nightly`). A skipped deploy succeeds and says why in the
  job summary. Engine: `branch-env`, and `prune` keeps listed `br-` environments.
- `MAX_ENVS` counts branch environments too.

### Changed

- Documentation: `docs/project-setup.md` is now `docs/repository-setup.md` and covers only what happens in the
  repository (the variable, the workflow, the first pull request); what it repeated from `configuring.md` is
  gone. `configuring.md` says how to get the `tailnet-preview` command, and its local smoke test no longer
  picks up a real host's settings. The README is reorganised for a first-time reader: what you need, four
  steps to a first preview, then how it works and the options.
- The setup guides say, for each step, where it is done, as which user, what it produces, which later step
  uses it and how to check it: the OAuth client secret of host setup step 1.3 is `TS_OAUTH_SECRET` in step
  2.4; Docker group membership; the `tailnet-preview` command on `PATH`; registering the runner and
  checking it is Idle; the repository variable and secret; what happens on the first pull request.
- `docs/agent-guide.md`: a playbook for an AI agent that sets previews up for a person, phase by phase, with
  who does each step (the person, the agent, or the agent after asking), a check for every step, and the
  rule that secrets never go through the chat. `AGENTS.md` (and `CLAUDE.md`) point agents to it, or to
  CONTRIBUTING.md for changes to tailnet-preview; the README says to give an agent the repository's URL.
- A project icon (`assets/icon.svg`, PNGs at 256 and 512 px), at the top of both READMEs.

## 0.3.0 - 2026-10-19

### Added

- **Shared ingress** (`TP_INGRESS=shared`, opt-in per host): one Tailscale node per host with Traefik and
  CoreDNS, one wildcard certificate for a domain of yours (DNS-01 through the DNS provider's API), names
  resolved through the tailnet's split DNS. Environments are `<project>-<env>.<domain>` and need no
  certificate of their own, so the per-environment certificate failures and Let's Encrypt limits no longer
  apply. `tailnet-preview ingress up|down|status`. Design: docs/design.md section 10; setup:
  docs/host-setup.md section 4. Redeploying an environment moves it to the ingress (its sidecar is
  removed) or back.
- The action refuses to deploy a pull request from a fork, also when the workflow's condition is missing.
- The notice `hostname`: when the tailnet already has a device with the environment's name and Tailscale
  adds a suffix (`myapp-pr-42-1`), the PR comment and `doctor` say so and how to get the name back.
- `docs/security.md` explains why a public repository must not let fork pull requests run on the
  self-hosted runner, and the settings that prevent it.

### Changed

- Several notices per deploy: `TP_NOTICE_FILE` holds a line per notice, and the comment shows each.
- `actions/checkout@v7`, `actions/github-script@v9` and `actions/setup-node@v7` (Node.js 24) in the action,
  the documented workflows and this repository's own; Node.js 20 actions are deprecated on GitHub.
- README: the status says what 0.x means.

## 0.2.5 - 2026-10-19

### Fixed

- Browser visits no longer use up Let's Encrypt's five failed validations per hour. tailscaled requests a
  certificate on every TLS handshake, hourly and at start-up while HTTPS is configured without one; the
  sidecar now serves HTTPS only once it has the certificate (the serve configuration is copied to
  `TS_SERVE_CONFIG` in the state volume then), and nothing before.
- No certificate request within `TP_CERT_MIN_GAP` (default 6 minutes) of a failed one, by the deploy or the
  retry loop: Let's Encrypt still sees the validation record as missing (`NXDOMAIN` is cached for up to the
  5-minute negative TTL of ts.net), so such a request failed the same way. The first retry moves from 5 to 6
  minutes.
- The reason of a failed order (`NXDOMAIN`, `Incorrect TXT record`) is shown again when the order is not on
  the last line of tailscale's output.

## 0.2.4 - 2026-10-19

### Changed

- The background certificate retries continue hourly for a day after the 5, 25 and 70 minute attempts.

### Fixed

- A name that Let's Encrypt rate limits (five failed validations within an hour) no longer gets new requests
  while the limit lasts: the deploy reads the time from the sidecar's log and does not request, and the
  retry loop waits until it has passed. Before, every deploy and retry extended the limit.

## 0.2.3 - 2026-10-19

### Fixed

- A deploy job cancelled by a newer push no longer replaces the PR comment with "deploy failed"; the
  diagnostics, comment and result steps run after failures only, not after cancellation.

## 0.2.2 - 2026-10-19

### Fixed

- A new deploy also stops a certificate request still running in the sidecar, not only the previous retry
  loop, so it no longer waits for it.
- The PR comment's table has a header row (`Service`, `Address`) instead of an empty one.

### Changed

- The documented workflow (and this repository's) cancels a pull request's deploy job when a newer push
  arrives; deploys of the default branch always finish.

## 0.2.1 - 2026-10-19

### Fixed

- A deploy waited up to three minutes for the certificate when a request was already running (the
  previous deploy's background retries, or one Tailscale started itself). It now stops the previous retries
  first and waits at most a minute (`TP_CERT_TIMEOUT`) before leaving it to the background retries.

## 0.2.0 - 2026-10-19

### Added

- Deploy requests the node's HTTPS certificate once the health check passes. When Let's Encrypt does not
  issue it (a timing problem between Tailscale and Let's Encrypt), the deploy still succeeds, the PR comment
  says "HTTPS certificate pending" with Let's Encrypt's reason, and the sidecar requests it again after 5,
  25 and 70 minutes. `doctor` prints the sidecar's certificate messages and the retries. Notices
  (`TP_NOTICE_FILE`) are new: something the PR comment mentions although the deploy succeeded.

### Fixed

- A sidecar that restarted and was still logging in made the deploy report that the tailnet does not
  issue HTTPS certificates; the check now waits until the sidecar runs.
- The action's `run` command refuses `deploy pr-<n>` and `reset pr-<n>`, which would have deployed the
  default branch's code into a PR environment.

## 0.1.0 - 2026-10-19

First release. Until 1.0.0, a minor version may change the configuration, commands or action inputs: pin the
full version.

### Added

- Engine `bin/tailnet-preview`: baseline and per-PR environments, data copied from the baseline as Docker
  volumes (any database), in-place upgrades, fresh environments when the default branch does not use
  tailnet-preview yet, destroy, reset, stop/start, backups, pruning, `doctor` diagnostics, `host-check`.
- Project configuration `.tailnet-preview/`: reuses the project's own compose files unchanged
  (`COMPOSE_FILES`), with published ports and fixed container names removed automatically and the
  repository snapshotted per environment; `config.env`, an override, comment text.
- `tailnet-preview validate` (static checks without deploying) and `tailnet-preview init` (a commented
  starting point); a step-by-step configuration guide for people and AI agents (`docs/configuring.md`).
- Composite action with `deploy`, `destroy`, `nightly` and `run`; PR comments in English and Chinese that
  name the cause of known failures and how to fix them.
- Example project, integration tests with a fake Tailscale, end-to-end workflow on a real host.
