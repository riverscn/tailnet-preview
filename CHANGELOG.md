# Changelog

All notable changes are documented here. The project follows [Semantic Versioning](https://semver.org).

## Unreleased

### Added

- Deploy requests the node's HTTPS certificate once the health check passes and fails with the new reason
  `cert`, carrying Let's Encrypt's reason, instead of reporting "ready" while browsers fail the TLS
  handshake. `doctor` prints the sidecar's last certificate messages.

### Fixed

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
