# Security model

tailnet-preview runs code from pull requests on a machine you own. Understand what that means before you
enable it.

## What you trust

- **Everyone who can push to the repository.** Deploying a PR builds and runs its code, and the runner's
  user is in the `docker` group, which is equivalent to root on the host. Anyone who can push a branch can
  therefore run commands on the host. This is acceptable for private repositories where push access is
  controlled, and not otherwise.
- **Every project on the host.** Projects are separated by naming, not by isolation: a project's push
  access is enough to affect another project's environments on the same host. Share a host only between
  projects with the same owners.
- **The images you build and pull,** including the registry mirror you configure.

## What the project does to limit exposure

- **Pull requests from forks are never deployed** by the documented workflows (the job condition compares
  the head repository with the base repository). Keep that condition.
- **No public ingress.** Environments are reachable only through the tailnet; nothing listens on the host's
  network. Services must not publish ports.
- **Least-privilege Tailscale credentials.** The OAuth client can only create auth keys for `tag:preview`.
  The recommended policy lets your own devices reach preview nodes and gives preview nodes no access to
  anything else. PR nodes are ephemeral.
- **Secrets stay on the host.** Generated secrets (`~/previews/<project>/secrets.env`) and the per
  environment `compose.env` are mode 600. The OAuth secret is redacted from diagnostics.
- **The configuration is parsed, not executed.** `config.env` is read as data; but note that compose files,
  SQL hooks and Dockerfiles from the PR are, by design, executed.

## Recommendations

- Use a dedicated VM for previews, with nothing else of value on it.
- Never copy real production data into a preview environment. Use seeds and anonymized fixtures.
- Use mock providers for anything that sends messages or moves money.
- Review who has push access before enabling `PREVIEW_ENABLED`.

## Reporting a vulnerability

See [SECURITY.md](../SECURITY.md).
