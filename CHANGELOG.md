# Changelog

All notable changes are documented here. The project follows [Semantic Versioning](https://semver.org).

## Unreleased

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
