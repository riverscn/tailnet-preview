# Changelog

All notable changes are documented here. The project follows [Semantic Versioning](https://semver.org).

## Unreleased

### Added

- Engine `bin/tailnet-preview`: baseline and per-PR environments, database copy from the baseline, in-place
  upgrades, fresh environments when the default branch does not use tailnet-preview yet, destroy, reset,
  stop/start, backups, pruning, `doctor` diagnostics, `host-check`.
- Project configuration `.tailnet-preview/` (`config.env`, `compose.yaml`, SQL hooks, comment text).
- Composite action with `deploy`, `destroy`, `nightly` and `run`; PR comments in English and Chinese that
  name the cause of known failures and how to fix them.
- Example project, integration tests with a fake Tailscale, end-to-end workflow on a real host.
