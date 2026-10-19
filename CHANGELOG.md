# Changelog

All notable changes are documented here. The project follows [Semantic Versioning](https://semver.org).

## Unreleased

## 1.0.0 - 2026-10-19

First release.

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
