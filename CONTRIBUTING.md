# Contributing

[简体中文](CONTRIBUTING.zh-CN.md)

Thanks for helping. Bug reports with the output of `tailnet-preview doctor <env>` (secrets are redacted)
are the most useful kind.

## Ground rules

- [docs/design.md](docs/design.md) is the source of truth. A change to behaviour, configuration, variables,
  commands or action inputs starts with a change to that document.
- Keep the engine dependency-free: Bash, Docker (Compose v2), git, flock, coreutils. No new tools on the host.
- Breaking changes need a new major version ([design.md section 9](docs/design.md#9-versioning)).
- A failure with a recognizable cause gets a reason code: `fail <code>` in the engine, an entry in
  `REASONS` in `lib/comment.cjs` for every language, and a row in [docs/troubleshooting.md](docs/troubleshooting.md).
  A unit test checks that the engine and the comment agree.

## Development

You need Docker, Node.js 22, shellcheck, yq and (for workflows) actionlint.

```bash
shellcheck bin/tailnet-preview test/*.sh test/fake-tailscale/tailscale example/app/handler.sh
node --test 'test/*.test.mjs'          # PR comment rendering
test/integration.sh                     # engine against Docker, fake Tailscale (a few minutes)
test/action.sh                          # the action's deploy decisions
npx prettier@3.9.9 --check .
```

The integration tests use the real engine, Docker, PostgreSQL and the [example](example/); only Tailscale is
replaced by [test/fake-tailscale](test/fake-tailscale/). They clean up after themselves and use the project
names `tp-itest` and `tp-atest`.

The real Tailscale path is covered by [.github/workflows/preview.yml](.github/workflows/preview.yml), which
deploys the example on the maintainers' preview host for every pull request from this repository.

## Pull requests

- One topic per pull request; explain why in the description.
- Add or update tests with the change.
- Update [CHANGELOG.md](CHANGELOG.md) under "Unreleased".
- Code and code comments are in English. Every document has a Simplified Chinese version next to it
  (`<name>.zh-CN.md`); the English one is authoritative. A change to a document changes both in the same
  pull request.

## Releases

1. A pull request renames "Unreleased" in `CHANGELOG.md` to `## X.Y.Z - <date>` (with a new empty
   "Unreleased" above it) and updates the pinned version in `README.md`, `README.zh-CN.md`,
   `docs/repository-setup.md`, `docs/design.md` and their `.zh-CN.md` versions.
2. After it is merged, run the **Release** workflow on `main` with the version `X.Y.Z`. It checks the
   changelog, creates the tag `vX.Y.Z` and a GitHub release with that version's notes and, from 1.0.0,
   moves the major tag `vX`.
