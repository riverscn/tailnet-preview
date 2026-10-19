# Proposal: gateway mode (own domain, one wildcard certificate)

Status: **proposal for review**, not implemented. When accepted, its content moves into [design.md](../design.md)
and this file is deleted.

## Why

Today every environment is its own Tailscale node with its own Let's Encrypt certificate for
`<project>-<env>.<tailnet>.ts.net`. On the first real host (2026-10-19) that was the weak point:

- Let's Encrypt validates the DNS record Tailscale publishes in the same second it is set, and rejected
  orders because the record had not reached public DNS yet (`NXDOMAIN`, `Incorrect TXT record`). Three
  nodes in a row failed; one name hit the limit of five failed validations per hour.
- Every new environment needs a new certificate, so the weekly Let's Encrypt quota per tailnet and the
  timing problem are hit again on every PR.
- Removed environments leave their node names behind for a while, so a recreated environment gets a
  `-1` suffix and a different address.

None of this is under tailnet-preview's control as long as the certificate is per node.

## What changes

An optional, host-level mode. A host that sets a domain runs **one gateway** instead of one sidecar per
environment:

```
browser ──https──▶ *.preview.example.com  (public DNS: wildcard A record → gateway's tailnet IP 100.x)
                        │  only tailnet devices can reach 100.x
                        ▼
        gateway (one per host): Tailscale node + Traefik with one wildcard certificate
                        │  routes by host name
                        ▼
        shadcn-saas-kit-pr-28 → web:80 of that environment's compose project
```

|                         | Per-node mode (today, default)                | Gateway mode                                                         |
| ----------------------- | --------------------------------------------- | -------------------------------------------------------------------- |
| Address                 | `https://<project>-<env>.<tailnet>.ts.net`    | `https://<project>-<env>.<domain>`                                   |
| Certificates            | one per environment, issued through Tailscale | one wildcard `*.<domain>` per host, renewed every 60 days by Traefik |
| Tailscale nodes         | one per environment (ephemeral for PRs)       | one per host (`<host>-preview-gateway`)                              |
| A new environment needs | a new node and a new certificate              | a routing entry (a file Traefik watches)                             |
| ACLs                    | per environment possible                      | the gateway as a whole (`tag:preview:443` and the extra ports)       |

Projects do not change: `config.env`, `compose.yaml` and the action are the same. `TP_URL` simply has the
other form.

## Host configuration

In `~/.config/tailnet-preview/env` (the host config that already holds `TS_OAUTH_SECRET`):

```sh
TP_DOMAIN=preview.example.com
CLOUDFLARE_DNS_API_TOKEN=...   # API token with Zone → DNS → Edit for that zone only
```

No `TP_DOMAIN`: per-node mode, as today.

The engine creates or updates the wildcard record `*.preview.example.com` (type A, DNS only, not proxied)
pointing to the gateway's tailnet IP through the same token, so the domain needs no manual DNS work.
A public record pointing to a `100.64.0.0/10` address reveals nothing usable: only devices in the tailnet
can connect to it. It does reveal that the domain is used for previews; use a subdomain that says nothing
more (no customer or product names).

## The gateway

A compose project `tailnet-preview-gateway`, created on the first deploy in gateway mode and shared by all
projects on the host:

- `ts`: Tailscale, non-ephemeral, `tag:preview`, `TS_USERSPACE=false` is not needed: Traefik shares its
  network namespace (`network_mode: service:ts`), so it listens on the tailnet IP directly.
- `traefik`: the official `traefik:v3` image. Its built-in ACME client requests `*.<domain>` with a
  DNS-01 challenge through Cloudflare (the token as `CF_DNS_API_TOKEN`), and keeps the certificate in a
  volume. Routes come from a directory of small files, one per environment, written by the engine (file
  provider with `watch`), not from Docker labels: the engine already knows each environment's upstreams
  and Traefik needs no access to the Docker socket.
- Reaching environments: the gateway joins each environment's compose network (`docker network connect`)
  and proxies to the container name (`<project>-<env>-web-1:80`), which is unique on the host, unlike
  the service name `web`.

Extra ports (`PORTS=8025=mailpit:8025`) become extra host names instead of extra ports, so the gateway
needs no per-project entrypoints: `https://<project>-<env>-8025.<domain>`. The PR comment lists them as
today.

## Lifecycle

| Event                            | Per-node mode                                                | Gateway mode                                                                                                                                                       |
| -------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| deploy (new environment)         | start a sidecar, wait for its login, request its certificate | write the route file, connect the network, wait until the gateway answers for the host name                                                                        |
| destroy                          | log the node out, remove the project                         | remove the route file and the project                                                                                                                              |
| first deploy on a host           | —                                                            | create the gateway, the DNS record and the wildcard certificate (failure codes `gateway`, `dns`, `cert`)                                                           |
| switching a host to gateway mode | —                                                            | each environment is upgraded on its next deploy: its sidecar is removed (`--remove-orphans`), volumes are kept; `doctor` lists environments still in per-node mode |

`health` is checked through the gateway (`https://<host name>/<HEALTH_PATH>` from inside the gateway),
which covers the route, the network and the certificate in one request.

## Security

- The Cloudflare token stays on the host (host config, mode 600), scoped to DNS edits of one zone. It is
  never passed to project containers.
- The gateway's certificate key is on the host, in a Docker volume. Anyone with root on the host can read
  it; that is already true of everything on the host ([security.md](../security.md)).
- One entry point for all environments: whoever may reach the gateway may reach every environment on the
  host. With per-node mode an ACL can single out one environment; with gateway mode it cannot. For a
  personal or small-team preview host this is acceptable; hosts that need per-environment ACLs keep
  per-node mode.

## Open questions

1. **Extra ports as host names** (`<project>-<env>-8025.<domain>`) or as ports on the same host name (as
   today, which needs an entrypoint per port number used by any project on the host)?
2. **Traefik or Caddy.** Traefik's official image includes the Cloudflare DNS challenge; Caddy needs a
   custom build with the `caddy-dns/cloudflare` module, which means building or trusting a third-party
   image. Proposed: Traefik.
3. **Other DNS providers.** Traefik supports most (Alibaba Cloud, DNSPod, Route 53, ...) with their own
   variables. Proposed: Cloudflare first, the others documented as "set these variables", tested later.
4. **Default mode.** Proposed: per-node stays the default (zero setup); gateway mode is recommended in the
   docs for hosts with frequent PRs.
