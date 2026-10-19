# tailnet-preview

**Per-PR preview environments on your own host, reachable only via your tailnet.**

[简体中文](README.zh-CN.md)

Open a pull request and a full copy of your application starts on a machine you own: its own containers,
its own data **copied from a long-lived baseline**, and an HTTPS address like
`https://myapp-pr-42.your-tailnet.ts.net` that only devices in your [Tailscale](https://tailscale.com)
network can open. Push to the PR and it upgrades in place; close the PR and it is gone. A comment on the PR
says where it is, or exactly what went wrong and how to fix it.

```
pull request ──▶ GitHub Actions (self-hosted runner on your machine)
                   │  build images · copy the baseline database · run migrations · start services
                   ▼
   https://myapp-pr-42.<tailnet>.ts.net      only your tailnet, no public ingress
```

## Why

- **Realistic upgrades.** A PR environment starts from a copy of the baseline's data and runs the PR's
  migrations, the way production will. Bugs that only appear on an existing database show up before merge.
- **Private by construction.** Each environment is a Tailscale node with HTTPS. There is no public port,
  tunnel, or login page to protect.
- **Cheap.** Any Linux box with Docker: a home server, a spare VM. One machine serves many projects; the
  machine needs no per-project setup.
- **Plain tools, any stack.** Bash and Docker Compose. Your database is a service in your own
  `compose.yaml`, whatever it is; data is copied as Docker volumes. No cluster, no control plane.

## How it works

| Environment          | Data                                                                                 | Lifetime            |
| -------------------- | ------------------------------------------------------------------------------------ | ------------------- |
| `main`, the baseline | Created once (migrate + seed), then upgraded by every push to the default branch     | Long-lived          |
| `pr-<number>`        | A copy of the baseline's data volumes (database, uploads…), then the PR's migrations | Until the PR closes |

Each environment is a Docker Compose project: your services, database included, plus a Tailscale
sidecar that serves HTTPS and proxies to them. To fork, the engine pauses the baseline for a few seconds
and copies the volumes you list in `DATA_VOLUMES`. Details: [docs/design.md](docs/design.md).

## Quick start

1. **Prepare the tailnet and the host once:** enable HTTPS certificates, add a `tag:preview` policy,
   create an OAuth client, install Docker and a self-hosted runner labelled `preview`.
   → [docs/host-setup.md](docs/host-setup.md)
2. **Add `.tailnet-preview/` to your project:** your existing compose file is reused unchanged; you add
   which images to build, the entry point, the application's own URL, mocks and migrate/seed tasks.
   `tailnet-preview init` writes a starting point and `tailnet-preview validate` checks it. A step-by-step
   guide, written so that a person or an AI agent can follow it: → [docs/configuring.md](docs/configuring.md)
3. **Add a workflow** that calls the action:

   ```yaml
   - uses: actions/checkout@v4
   - uses: riverscn/tailnet-preview@v0.2.4
     with:
       command: deploy
   ```

   A complete workflow (deploy, destroy on close, nightly backup and cleanup, manual commands) is in
   [docs/project-setup.md](docs/project-setup.md#4-add-the-workflow).

The [example](example/) is a complete, minimal project: this repository deploys it on every pull request
as its own end-to-end test.

## Commands

The engine also works by hand on the host:

```console
$ tailnet-preview list
main       3f6fd43dd417  https://myapp-main.tail1234.ts.net
pr-42      d69d97d1ab55  https://myapp-pr-42.tail1234.ts.net
$ tailnet-preview doctor pr-42      # containers, Tailscale, HTTPS, upstreams, logs
$ tailnet-preview reset pr-42       # copy the baseline again
```

All commands: [docs/design.md](docs/design.md#6-commands).

## Documentation

- [Design](docs/design.md): model, project configuration reference, commands, failure codes
- [Host setup](docs/host-setup.md): tailnet, machine, runner
- [Configuring a project](docs/configuring.md): writing `.tailnet-preview/`, step by step, for people and AI agents
- [Project setup](docs/project-setup.md): repository settings and the workflow
- [Troubleshooting](docs/troubleshooting.md): symptoms, causes, fixes
- [Security](docs/security.md): what you trust when you run it

## Status

Early: version 1, extracted from a multi-tenant SaaS project where it runs on a home server. Linux hosts
only. Pull requests from forks are never deployed (that would run untrusted code on your host); see
[docs/security.md](docs/security.md).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). The integration tests run the real engine against Docker with a
fake Tailscale, so most changes can be tested without a tailnet.

## License

[MIT](LICENSE)

Tailscale is a trademark of Tailscale Inc. This project is not affiliated with or endorsed by Tailscale.
