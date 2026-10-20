# Host setup

[简体中文](host-setup.zh-CN.md)

The preview host is generic: the steps below are done once per tailnet and once per machine. Adding a
project later needs no login to the host (see [repository-setup.md](repository-setup.md)).

## 1. The tailnet (once)

In the [Tailscale admin console](https://login.tailscale.com/admin):

1. **DNS:** enable **MagicDNS**, then under **HTTPS Certificates** choose **Enable HTTPS**. Without this,
   browsers connect but the TLS handshake is reset, and deploys fail with reason `https`.
2. **Access controls:** define the tag and let only your own devices reach preview nodes, on the ports the
   environments serve (443, plus any `PORTS` your projects use). Preview nodes get no access of their own:

   ```jsonc
   "tagOwners": { "tag:preview": ["autogroup:admin"] },
   "acls": [
     { "action": "accept", "src": ["autogroup:member"], "dst": ["tag:preview:443,8025"] }
   ]
   ```

   If your policy uses `grants` instead of `acls`, write the equivalent grant.

3. **OAuth client:** Settings → [Trust credentials](https://login.tailscale.com/admin/settings/trust-credentials)
   → Credential → OAuth. Scope **Auth Keys: Write**, tag **`tag:preview`**. Copy the client secret
   (`tskey-client-…`); it is shown once. Preview nodes register with it: the baseline's node is persistent,
   PR nodes are ephemeral and disappear when removed.

To use a different tag, set `TS_TAGS=tag:something` next to the secret below and adjust the policy.

## 2. The machine (once)

Any x86_64 or arm64 Linux machine with Docker. A VM dedicated to previews is recommended
([security.md](security.md)). About 400 MB of memory per environment of a typical web application; the
engine refuses new PR environments below `MIN_FREE_MB` of available memory (default 1.5 GB).

1. Install Docker Engine with the Compose plugin, and `git` and `flock` (util-linux). Tailscale does **not**
   need to be installed on the host: every environment brings its own sidecar.
2. Make sure the host can pull from Docker Hub reliably. Where connections to Docker Hub are reset (common
   in mainland China), configure the Docker daemon once:
   - a proxy: `systemctl edit docker` and add
     ```ini
     [Service]
     Environment="HTTPS_PROXY=http://proxy.example:3128"
     Environment="NO_PROXY=localhost,127.0.0.1"
     ```
   - or a registry mirror you trust, in `/etc/docker/daemon.json`:
     `{ "registry-mirrors": ["https://mirror.example"] }`

   then `sudo systemctl restart docker` and check with `docker pull postgres:17-alpine`. The engine retries
   pulls, but retries do not fix a link that is down.

3. Store the OAuth client secret for the user that will run the GitHub runner:

   ```bash
   mkdir -p ~/.config/tailnet-preview
   printf 'TS_OAUTH_SECRET=tskey-client-...\n' > ~/.config/tailnet-preview/env
   chmod 600 ~/.config/tailnet-preview/env
   ```

   Alternatively set a repository (or organization) secret `TS_OAUTH_SECRET`; it takes precedence.

4. Check:

   ```bash
   git clone https://github.com/riverscn/tailnet-preview && tailnet-preview/bin/tailnet-preview host-check
   ```

## 3. The runner (per repository, or once per organization)

The workflow jobs run on a [self-hosted runner](https://docs.github.com/actions/hosting-your-own-runners)
on this machine, labelled `preview`.

- **Repositories owned by a personal account** can only use repository-level runners. Register one per
  repository (Settings → Actions → Runners → New self-hosted runner, Linux), each in its own directory on
  the host; several runners on one machine are fine.
- **Repositories in an organization** can share one organization-level runner; adding a project then needs
  no runner registration at all.

When configuring, add the label `preview`, then install it as a service:
`sudo ./svc.sh install && sudo ./svc.sh start`. The runner's user must be in the `docker` group and is the
user whose `~/previews/` and `~/.config/tailnet-preview/` are used.

## 4. Shared ingress (optional, once per host)

By default every environment is its own Tailscale node with its own certificate, requested during the
deploy; that request fails often (docs/design.md section 7). With the shared ingress, the host has one
Tailscale node and one wildcard certificate for a domain of yours, and environments are
`https://<project>-<env>.<your domain>`. Design: [design.md section 10](design.md#10-shared-ingress-one-per-host-one-wildcard-certificate).
It needs a domain whose DNS is at a provider with an API (Cloudflare, Alibaba Cloud DNS, DNSPod, … any
[lego provider](https://go-acme.github.io/lego/dns/)). The steps for Cloudflare and `preview.example.com`:

1. **A DNS token.** Cloudflare → My Profile → API Tokens → Create Token → template **Edit zone DNS**,
   zone `example.com` only. Let's Encrypt's validation record is written under
   `_acme-challenge.preview.example.com`; nothing else changes in the zone, and no public record points to
   the host.
2. **The settings,** in `~/.config/tailnet-preview/env` next to `TS_OAUTH_SECRET`:

   ```sh
   TP_INGRESS=shared
   TP_INGRESS_DOMAIN=preview.example.com
   TP_INGRESS_DNS_PROVIDER=cloudflare
   TP_INGRESS_DNS_ENV=CF_DNS_API_TOKEN
   CF_DNS_API_TOKEN=...
   TP_INGRESS_ACME_EMAIL=you@example.com
   ```

   For another provider, use its lego name and the variables its lego page lists. The host needs
   `/dev/net/tun` (`tailnet-preview host-check` checks it).

3. **Start the ingress** and note its address: `tailnet-preview ingress up` prints it (`100.x.y.z`). The
   wildcard certificate is requested in the background; `tailnet-preview doctor <env>` shows whether it is
   issued.
4. **The tailnet** (admin console):
   - **Split DNS:** DNS → Nameservers → Add nameserver → Custom: the ingress's address, with **Restrict to
     domain** `preview.example.com`. Names then resolve inside the tailnet, on every device that uses
     Tailscale DNS, without a public record that some routers would filter.
   - **Policy:** let your devices reach the ingress on port 53 as well:
     `"dst": ["tag:preview:53,443,8025"]` (the ports of your projects' `PORTS` too).
5. **Redeploy** each environment (push, or `tailnet-preview reset <env>` for the baseline). Each loses its
   own Tailscale node and is served by the ingress from then on.

## What lives where

| Path or name                    | Content                                                            |
| ------------------------------- | ------------------------------------------------------------------ |
| `~/.config/tailnet-preview/env` | `TS_OAUTH_SECRET` (and optionally `TS_TAGS`) for all projects      |
| `~/previews/<project>/`         | Generated secrets, environment directories, baseline backups, lock |
| `<project>-<env>-*`             | Containers of one environment                                      |
| `<project>-<env>_*`             | Volumes of one environment                                         |

To remove a project completely: destroy its environments (`tailnet-preview destroy pr-N`,
`tailnet-preview destroy main --force`), then remove `~/previews/<project>/`.
