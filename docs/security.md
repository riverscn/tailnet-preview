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

- **Pull requests from forks are never deployed.** The documented workflows skip them (the job condition
  compares the head repository with the base repository), and the action refuses to deploy one even if a
  workflow lacks that condition. Keep the condition anyway: it keeps the job off the runner. Both only
  hold for workflows a fork cannot change, which is not the case in a public repository (next section).
- **No public ingress.** Environments are reachable only through the tailnet; nothing listens on the host's
  network. Services must not publish ports.
- **Least-privilege Tailscale credentials.** The OAuth client can only create auth keys for `tag:preview`.
  The recommended policy lets your own devices reach preview nodes and gives preview nodes no access to
  anything else. PR nodes are ephemeral.
- **Secrets stay on the host.** Generated secrets (`~/previews/<project>/secrets.env`) and the per
  environment `compose.env` are mode 600. The OAuth secret is redacted from diagnostics.
- **The configuration is parsed, not executed.** `config.env` is read as data; but note that compose files,
  SQL hooks and Dockerfiles from the PR are, by design, executed.

## Public repositories

In a public repository, a pull request from a fork runs the workflows **as changed by that pull request**.
A fork can delete the job condition, stop calling the action, and run any command on a job that targets
the self-hosted runner: on your host, as a user equivalent to root. Neither the condition nor the action
can prevent this. GitHub's own advice is not to use self-hosted runners with public repositories.

If the repository must be public:

- Under **Settings → Actions → General → Approval for running fork pull request workflows from
  contributors**, choose **Require approval for all external contributors**, and read a fork's workflow
  changes before you approve a run. The default asks only first-time contributors.
- Better: do not make the runner available to the public repository at all. Deploy from a private
  repository (a private mirror, or a separate repository that holds the deployment), or, in an
  organization, put the runner in a runner group that does not allow public repositories.
- Keep `PREVIEW_ENABLED` unset until the above is in place; a fork can still change workflows, so this
  variable alone is not protection.

tailnet-preview's own repository deploys its example on every pull request in the same way and follows
the same rules.

## Recommendations

- Use a dedicated VM for previews, with nothing else of value on it.
- Never copy real production data into a preview environment. Use seeds and anonymized fixtures.
- Use mock providers for anything that sends messages or moves money.
- Review who has push access before enabling `PREVIEW_ENABLED`.

## Reporting a vulnerability

See [SECURITY.md](../SECURITY.md).
