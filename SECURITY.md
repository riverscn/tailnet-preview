# Security policy

## Reporting a vulnerability

Please do not open a public issue. Use GitHub's private vulnerability reporting: the **Security** tab of
this repository → **Report a vulnerability**. You will get an answer within a week.

## Scope

tailnet-preview runs pull request code on the preview host by design; that this is possible for people with
push access is documented, not a vulnerability. See [docs/security.md](docs/security.md) for the security
model. In scope are, for example: secrets leaking into logs or PR comments, environments reachable outside
the tailnet, fork pull requests being deployed by the documented workflows, or one environment being able
to read another's data through the engine.

## Supported versions

The latest release of the current major version.
