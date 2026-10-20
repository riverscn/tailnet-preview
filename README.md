<p align="center"><img src="assets/icon.svg" width="112" height="112" alt=""></p>

<h1 align="center">tailnet-preview</h1>

<p align="center"><strong>Per-PR preview environments on your own machine, reachable only via your tailnet.</strong></p>

<p align="center"><a href="https://discord.gg/mCevCGR9Pc"><img src="https://img.shields.io/badge/Discord-join%20the%20chat-5865F2?logo=discord&logoColor=white" alt="Discord"></a></p>

[简体中文](README.zh-CN.md)

> **Using an AI coding agent?** Open it in your project and paste this prompt:
>
> ```text
> Set up tailnet-preview (https://github.com/riverscn/tailnet-preview) for this project, so every pull
> request gets its own preview environment on my machine. Follow its docs/agent-guide.md. Tell me which
> steps only I can do, all at once, and never ask me for a secret in the chat.
> ```
>
> The agent follows [docs/agent-guide.md](docs/agent-guide.md) and tells you which steps only you can do.
>
> To keep that know-how in your agent for later (setting up another project, a failed deploy), install the
> skill with `npx skills add riverscn/tailnet-preview`. Then just ask, for example "why did the preview of
> PR 42 fail?".

Open a pull request and a complete copy of your application starts on a machine you own, with its own
database copied from a long-lived **baseline** of your default branch. You get a private HTTPS address that
only devices in your [Tailscale](https://tailscale.com) network can open. Every push to the PR updates it,
and closing the PR removes it. A comment on the PR says where it is, or what went wrong and how to fix it.

```
pull request ──▶ GitHub Actions on your machine (self-hosted runner)
                   │  build images · copy the baseline's data · run the PR's migrations · start
                   ▼
   https://myapp-pr-42.<your tailnet>.ts.net      private to your tailnet, nothing on the internet
```

- **Realistic upgrades.** Each PR starts from a copy of real (demo) data and runs its own migrations, the way
  production will. Bugs that only show up on an existing database appear before you merge.
- **Private.** No public port, tunnel or login page: only your tailnet can reach the environments.
- **Cheap.** Any Linux box with Docker, such as a home server or a spare VM. One machine serves many projects.
- **Any stack.** Bash and Docker Compose. Your database is just a service in your compose file.

## What you need

- A **Linux machine with Docker** that stays on, with a few GB of free memory (each environment runs its
  own copy of every service). Any always-on device works: a computer at home that you leave running, a
  mini PC, a NAS that runs Docker, or an idle VPS in the cloud.
- A **Tailscale account**. The free plan works.
- A **GitHub repository** you control, private or with the precautions in [security](docs/security.md).
  Anyone who can push to it can run code on the machine.
- An application that **runs in containers**, ideally with a compose file already, and reads its URL and
  database connection from environment variables.

## Get started

**1. Prepare the machine and the tailnet** (once, about 30 minutes) → [host-setup.md](docs/host-setup.md)

You turn on HTTPS certificates and a `tag:preview` access rule in Tailscale, create an OAuth client, and
install Docker and a GitHub Actions runner labelled `preview`. When you are done, `tailnet-preview
host-check` reports no `FAIL`.

**2. Describe your application in `.tailnet-preview/`** (per project) → [configuring.md](docs/configuring.md)

A small `config.env` and a compose override: which images to build, which service the browser opens, the
application's own URL, mock providers, migrate and seed tasks. Your existing compose file stays as it is.
`tailnet-preview init` writes a first draft and `tailnet-preview validate` checks it. The guide is a
step-by-step procedure that an AI coding agent can also follow.

**3. Turn it on for the repository** (per project, a few minutes) → [repository-setup.md](docs/repository-setup.md)

Set the repository variable `PREVIEW_ENABLED=true` and copy the workflow file from that page.

**4. Open a pull request**

The PR that adds `.tailnet-preview/` gets an environment with fresh demo data, because there is no
baseline yet. Merging it creates the baseline. From then on every PR starts from a copy of the baseline,
and its comment shows the address:

> **Preview environment ready** (copied from the baseline)
>
> | Service     | Address                                 |
> | ----------- | --------------------------------------- |
> | Application | https://myapp-pr-42.your-tailnet.ts.net |

To see a complete, minimal setup first, look at the [example](example/). This repository deploys it on every
pull request as its own end-to-end test.

## How it works

| Environment              | Data                                                                                 | Lifetime                                 |
| ------------------------ | ------------------------------------------------------------------------------------ | ---------------------------------------- |
| `main`, the baseline     | Created once (migrate + seed), then upgraded by every push to the default branch     | Long-lived                               |
| `pr-<number>`            | A copy of the baseline's data volumes (database, uploads…), then the PR's migrations | Until the PR closes                      |
| `br-<branch>` (optional) | The same, for a branch without a PR, when the workflow opts in                       | Until the branch is deleted or gets a PR |

Each environment is a Docker Compose project with your services, database included. To copy the
baseline, the engine pauses it for a few seconds and copies its data volumes. Details:
[design.md](docs/design.md).

## Options

**Which PRs and branches get an environment.** By default every pull request does, drafts included, and
branches without a PR don't. In the workflow, `drafts: false` waits until a PR is ready for review, and
`branches: 'release/* feature/*'` (or `'*'`) also gives matching branches their own environment
([repository-setup.md](docs/repository-setup.md#2-add-the-workflow)).

**How environments are reached.** This is a setting of the machine (`TP_INGRESS`), the same for every
project on it:

|              | `sidecar` (default)                                                                             | `shared`                                                                     |
| ------------ | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Address      | `https://<project>-<env>.<tailnet>.ts.net`                                                      | `https://<project>-<env>.<your domain>`                                      |
| How          | Each environment is its own Tailscale node with its own certificate                             | One entry point per machine with one wildcard certificate                    |
| Needs        | Nothing beyond Tailscale                                                                        | A domain whose DNS provider has an API, and a split DNS entry in the tailnet |
| Keep in mind | A new environment's certificate is often only issued on a later retry, minutes after the deploy | If the entry point stops, no environment on the machine is reachable         |

Start with `sidecar`. Switch to `shared` when previews must work right away
([host-setup.md section 4](docs/host-setup.md#4-shared-ingress-optional-once-per-host)). Switching keeps the
data and changes the addresses.

## Day to day

Everything runs from GitHub Actions. On the machine, the same engine helps when something looks wrong:

```console
$ tailnet-preview list
main       3f6fd43dd417  https://myapp-main.tail1234.ts.net
pr-42      d69d97d1ab55  https://myapp-pr-42.tail1234.ts.net
$ tailnet-preview doctor pr-42      # containers, Tailscale, HTTPS, upstreams, logs
$ tailnet-preview reset pr-42       # copy the baseline again
```

When a deploy fails, the PR comment names the cause and the fix. All causes:
[troubleshooting.md](docs/troubleshooting.md). All commands: [design.md](docs/design.md#6-commands).

## Documentation

In the order you need them:

1. [Host setup](docs/host-setup.md): the tailnet, the machine, the runner, optionally the shared entry point
2. [Configuring a project](docs/configuring.md): writing `.tailnet-preview/`, step by step
3. [Repository setup](docs/repository-setup.md): the repository variable, the workflow, the first pull request
4. [Troubleshooting](docs/troubleshooting.md): symptoms, causes, fixes
5. [Security](docs/security.md): what you trust when you run it, and public repositories
6. [Design](docs/design.md): how it works, every setting and command, failure codes

With an AI agent: [agent guide](docs/agent-guide.md), which steps it does and which you do. As a skill for
your agent: `npx skills add riverscn/tailnet-preview`.

Every document has a Simplified Chinese version next to it (`<name>.zh-CN.md`), linked at its top.

## Status

Pre-1.0 (0.x). It is in daily use by the multi-tenant SaaS project it was extracted from, on a home server.
Minor versions may still change configuration or behaviour, so pin the full version (`@v0.4.0`) and read
the [changelog](CHANGELOG.md) before upgrading. It supports Linux hosts only. Pull requests from forks are
never deployed, and a public repository needs extra settings for its runner ([security](docs/security.md)).

## Community

Questions, ideas, or help with a setup: join the [Discord server](https://discord.gg/mCevCGR9Pc). Bugs and feature requests go to
[GitHub issues](https://github.com/riverscn/tailnet-preview/issues). Report security problems privately, as
[SECURITY.md](SECURITY.md) describes, not on Discord.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). The integration tests run the real engine against Docker with a
fake Tailscale, so most changes can be tested without a tailnet.

## License

[MIT](LICENSE)

Tailscale is a trademark of Tailscale Inc. This project is not affiliated with or endorsed by Tailscale.
