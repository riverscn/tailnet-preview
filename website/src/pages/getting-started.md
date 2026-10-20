---
layout: ../layouts/Doc.astro
lang: en
title: Getting started
description: Set up per-PR preview environments with tailnet-preview in four steps.
---

# Getting started

Four steps take you from nothing to a private preview of every pull request. The first is done once per
machine; the others once per project. Each step links to the full guide in the repository, which is the
authoritative version.

> **Using an AI coding agent?** Open it in your project and paste this prompt. It follows
> [docs/agent-guide.md](https://github.com/riverscn/tailnet-preview/blob/main/docs/agent-guide.md) and tells you which steps only you can do.
>
> ```text
> Set up tailnet-preview (https://github.com/riverscn/tailnet-preview) for this project, so every pull
> request gets its own preview environment on my machine. Follow its docs/agent-guide.md. Tell me which
> steps only I can do, all at once, and never ask me for a secret in the chat.
> ```
>
> To keep that know-how in your agent for later (another project, a failed deploy), install the skill:
> `npx skills add riverscn/tailnet-preview`.

## What you need

- A **Linux machine with Docker** that stays on, with a few GB of free memory (each environment runs its
  own copy of every service, about 400 MB for a typical web application).
- A **Tailscale account**. The free plan works.
- A **GitHub repository** you control, private or with the precautions in [security](https://github.com/riverscn/tailnet-preview/blob/main/docs/security.md).
  Anyone who can push to it can run code on the machine.
- An application that **runs in containers**, ideally with a compose file already, and reads its URL and
  database connection from environment variables.

## 1. Prepare the machine and the tailnet

Once, about 30 minutes. Full guide: [host-setup.md](https://github.com/riverscn/tailnet-preview/blob/main/docs/host-setup.md).

In Tailscale, turn on HTTPS certificates, add a `tag:preview` access rule and create an OAuth client. On the
machine, install Docker Engine with the Compose plugin, store the OAuth client secret, and get the
`tailnet-preview` command:

```bash
mkdir -p ~/.config/tailnet-preview
printf 'TS_OAUTH_SECRET=tskey-client-...\n' > ~/.config/tailnet-preview/env
chmod 600 ~/.config/tailnet-preview/env

git clone --depth 1 https://github.com/riverscn/tailnet-preview ~/tailnet-preview
echo 'export PATH="$HOME/tailnet-preview/bin:$PATH"' >> ~/.bashrc && . ~/.bashrc
tailnet-preview host-check
```

Then register a GitHub Actions [self-hosted runner](https://docs.github.com/actions/hosting-your-own-runners)
on the machine with the extra label `preview`. When you are done, `tailnet-preview host-check` reports no
`FAIL`, and the repository's Settings → Actions → Runners lists the runner as **Idle**.

## 2. Describe your application in `.tailnet-preview/`

Once per project. Full guide: [configuring.md](https://github.com/riverscn/tailnet-preview/blob/main/docs/configuring.md).

A small `config.env` and a compose override say which images to build, which service the browser opens,
the application's own URL, mock providers, and the migrate and seed tasks. Your existing compose file stays
as it is. From your project's root:

```bash
tailnet-preview init       # writes .tailnet-preview/config.env and compose.yaml, guesses marked TODO
tailnet-preview validate   # checks the configuration without building or starting anything
```

Fix every `ERROR` and read every `WARN`. The [example](https://github.com/riverscn/tailnet-preview/blob/main/example/) is a complete minimal project; this
repository deploys it on every pull request as its own end-to-end test.

## 3. Turn it on for the repository

A few minutes. Full guide: [repository-setup.md](https://github.com/riverscn/tailnet-preview/blob/main/docs/repository-setup.md).

- In the repository: Settings → Secrets and variables → Actions → **Variables**, add `PREVIEW_ENABLED` with
  the value `true`.
- Copy the workflow from [repository-setup.md](https://github.com/riverscn/tailnet-preview/blob/main/docs/repository-setup.md#2-add-the-workflow) to
  `.github/workflows/preview.yml`. Its jobs use the action like this:

```yaml
runs-on: [self-hosted, preview]
steps:
  - uses: actions/checkout@v7
  - uses: riverscn/tailnet-preview@v0.4.0
    with:
      command: deploy
```

Pin the full version and read the [changelog](https://github.com/riverscn/tailnet-preview/blob/main/CHANGELOG.md) before upgrading: minor versions may still
change configuration or behaviour before 1.0.

## 4. Open a pull request

The PR that adds `.tailnet-preview/` and the workflow gets an environment with fresh demo data, because there
is no baseline yet. Merging it creates the baseline. From then on every PR starts from a copy of the
baseline, and its comment shows the address:

> **Preview environment ready** (copied from the baseline)
>
> | Service     | Address                                 |
> | ----------- | --------------------------------------- |
> | Application | https://myapp-pr-42.your-tailnet.ts.net |

Open the address from a device in your tailnet. If the deploy fails, the comment names the cause and the
fix; all causes are in [troubleshooting.md](https://github.com/riverscn/tailnet-preview/blob/main/docs/troubleshooting.md).

## Options

- **Which PRs and branches get an environment.** By default every pull request does, drafts included. In
  the workflow, `drafts: false` waits until a PR is ready for review, and `branches: 'release/* feature/*'`
  (or `'*'`) also gives matching branches their own environment.
- **How environments are reached.** `TP_INGRESS=sidecar` (the default) makes each environment its own
  Tailscale node. `shared` uses one entry point per machine with a wildcard certificate on your own domain,
  so previews work right away ([host-setup.md section 4](https://github.com/riverscn/tailnet-preview/blob/main/docs/host-setup.md#4-shared-ingress-optional-once-per-host)).

## Further reading

1. [Host setup](https://github.com/riverscn/tailnet-preview/blob/main/docs/host-setup.md): the tailnet, the machine, the runner, optionally the shared entry point
2. [Configuring a project](https://github.com/riverscn/tailnet-preview/blob/main/docs/configuring.md): writing `.tailnet-preview/`, step by step
3. [Repository setup](https://github.com/riverscn/tailnet-preview/blob/main/docs/repository-setup.md): the repository variable, the workflow, the first pull request
4. [Troubleshooting](https://github.com/riverscn/tailnet-preview/blob/main/docs/troubleshooting.md): symptoms, causes, fixes
5. [Security](https://github.com/riverscn/tailnet-preview/blob/main/docs/security.md): what you trust when you run it, and public repositories
6. [Design](https://github.com/riverscn/tailnet-preview/blob/main/docs/design.md): how it works, every setting and command, failure codes
