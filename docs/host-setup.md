# Host setup

[简体中文](host-setup.zh-CN.md)

The preview host is generic: the steps below are done once per tailnet and once per machine. Adding a
project later needs no login to the host (see [repository-setup.md](repository-setup.md)).

You will collect one secret on the way, the **OAuth client secret** from step 1.3. It is called
`TS_OAUTH_SECRET` from then on; keep it somewhere safe until step 2.4.

## 1. The tailnet (once)

In the [Tailscale admin console](https://login.tailscale.com/admin), signed in as an admin of your
tailnet:

1. **DNS page:** enable **MagicDNS**, then under **HTTPS Certificates** choose **Enable HTTPS**. Without this,
   browsers connect but the TLS handshake is reset, and deploys fail with reason `https`.
2. **Access controls page** (the policy file editor): define the tag `tag:preview`, and let only your own
   devices reach preview nodes, on the ports the environments serve (443, plus any `PORTS` your projects
   use; the example uses 8025 for a mail catcher). Preview nodes get no access of their own. Add these two
   entries to the policy; if `tagOwners` or `acls` already exist, add the lines inside them instead:

   ```jsonc
   "tagOwners": { "tag:preview": ["autogroup:admin"] },
   "acls": [
     { "action": "accept", "src": ["autogroup:member"], "dst": ["tag:preview:443,8025"] }
   ]
   ```

   `autogroup:member` means every user of your tailnet. If your policy uses `grants` instead of `acls`,
   write the equivalent grant. Save the policy before the next step: the OAuth client can only use a tag
   the policy defines.

3. **OAuth client:** Settings → [Trust credentials](https://login.tailscale.com/admin/settings/trust-credentials)
   → Credential → OAuth. Give it the scope **Auth Keys: Write** and the tag **`tag:preview`**, then generate
   it. Copy the **client secret**, which starts with `tskey-client-`. It is shown only once; this is your
   `TS_OAUTH_SECRET`. With it, each environment registers its own Tailscale node: the baseline's node is
   persistent, PR nodes are ephemeral and disappear when removed.

To use a different tag, set `TS_TAGS=tag:something` next to the secret in step 2.4 and adjust the policy.

## 2. The machine (once)

Any x86_64 or arm64 Linux machine with Docker. A VM dedicated to previews is recommended
([security.md](security.md)). Plan about 400 MB of memory per environment of a typical web application;
the engine creates no new environment below `MIN_FREE_MB` of available memory (default 1.5 GB).

Everything below runs on that machine, in a terminal (for example over SSH).

1. **Choose the user** that will run the GitHub runner: your own account or a dedicated one such as
   `preview`. Run the remaining steps as that user. The environments, their data and the configuration
   all live in its home directory.
2. **Install Docker Engine with the Compose plugin** ([Docker's instructions](https://docs.docker.com/engine/install/)),
   plus `git` and `flock` (`flock` is in `util-linux`, usually present). Let the user run Docker without
   `sudo`, then log out and back in:

   ```bash
   sudo usermod -aG docker "$USER"
   ```

   Check: `docker compose version` and `docker ps` both work without `sudo`. Tailscale does **not** need to be
   installed on the machine: environments bring their own.

3. **Make sure the machine can pull from Docker Hub.** `docker pull postgres:17-alpine` must succeed. Where
   connections to Docker Hub are reset (common in mainland China), configure the Docker daemon once:
   - a proxy: `sudo systemctl edit docker` and add
     ```ini
     [Service]
     Environment="HTTPS_PROXY=http://proxy.example:3128"
     Environment="NO_PROXY=localhost,127.0.0.1"
     ```
   - or a registry mirror you trust, in `/etc/docker/daemon.json`:
     `{ "registry-mirrors": ["https://mirror.example"] }`

   then `sudo systemctl restart docker` and pull again. The engine retries pulls, but retries do not fix a
   link that is down.

4. **Store `TS_OAUTH_SECRET`**, the client secret from step 1.3, in the host configuration file. Replace
   `tskey-client-...` with your secret:

   ```bash
   mkdir -p ~/.config/tailnet-preview
   printf 'TS_OAUTH_SECRET=tskey-client-...\n' > ~/.config/tailnet-preview/env
   chmod 600 ~/.config/tailnet-preview/env
   ```

   This file holds the settings of the machine for all projects (more of them in section 4). Instead, you
   can set a repository (or organization) secret named `TS_OAUTH_SECRET`; it takes precedence.

5. **Get the `tailnet-preview` command and check the machine.** The command is the engine in this
   repository's `bin/`; the GitHub action brings its own copy, so this one is for you on the machine:

   ```bash
   git clone --depth 1 https://github.com/riverscn/tailnet-preview ~/tailnet-preview
   echo 'export PATH="$HOME/tailnet-preview/bin:$PATH"' >> ~/.bashrc && . ~/.bashrc
   tailnet-preview host-check
   ```

   Every line must start with `ok` or `info`. A `FAIL` line says what to fix. To update the command later,
   run `git -C ~/tailnet-preview pull`.

## 3. The runner (per repository, or once per organization)

The workflow jobs run on a [self-hosted runner](https://docs.github.com/actions/hosting-your-own-runners)
on this machine, labelled `preview`. Which kind you need:

- **Repositories owned by a personal account** can only use repository-level runners. Register one per
  repository, each in its own directory on the machine; several runners on one machine are fine.
- **Repositories in an organization** can share one organization-level runner (the organization's Settings
  → Actions → Runners); adding a project then needs no runner registration at all.

To register one, as the user from step 2.1:

1. In the repository on GitHub: Settings → Actions → Runners → **New self-hosted runner**, choose Linux and
   the machine's architecture. GitHub shows two blocks of commands, **Download** and **Configure**.
2. Run them on the machine in a new directory per runner, for example `~/actions-runner-<repository>`
   instead of the `actions-runner` they suggest. `./config.sh` asks a few questions: press Enter for the
   defaults, except **additional labels**, where you type `preview`.
3. Install and start it as a service, so it survives reboots:

   ```bash
   sudo ./svc.sh install && sudo ./svc.sh start
   ```

Check: the repository's Settings → Actions → Runners lists the runner as **Idle**, with the labels
`self-hosted`, `Linux` and `preview`.

## 4. Shared ingress (optional, once per host)

By default every environment is its own Tailscale node with its own certificate, requested during the
deploy; that request fails often (docs/design.md section 7). With the shared ingress, the host has one
Tailscale node and one wildcard certificate for a domain of yours, and environments are
`https://<project>-<env>.<your domain>`. Design: [design.md section 10](design.md#10-shared-ingress-one-per-host-one-wildcard-certificate).
It needs a domain whose DNS is at a provider with an API (Cloudflare, Alibaba Cloud DNS, DNSPod, … any
[lego provider](https://go-acme.github.io/lego/dns/)). The steps for Cloudflare and `preview.example.com`:

1. **A DNS token.** Cloudflare → My Profile → API Tokens → Create Token → template **Edit zone DNS**; under
   Zone Resources choose your zone (`example.com`) only. Copy the token; it is the value of
   `CF_DNS_API_TOKEN` below. Let's Encrypt's validation record is written under
   `_acme-challenge.preview.example.com`; nothing else changes in the zone, and no public record points to
   the host.
2. **The settings,** added to `~/.config/tailnet-preview/env` (the file from step 2.4), below the line with
   `TS_OAUTH_SECRET`. Replace the domain, the token and the e-mail address with yours:

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

3. **Start the ingress** and note its address: `tailnet-preview ingress up` prints it (`ingress up at
100.x.y.z`); the next step needs it. It also appears in the Tailscale admin console as a machine named
   `tailnet-preview-<host>`. The
   wildcard certificate is requested in the background; `tailnet-preview doctor <env>` shows whether it is
   issued.
4. **The tailnet** (admin console):
   - **Split DNS:** DNS page → Nameservers → Add nameserver → Custom: enter the ingress's address from
     step 3, turn on **Restrict to domain** and enter `preview.example.com`. Names then resolve inside the tailnet, on every device that uses
     Tailscale DNS, without a public record that some routers would filter.
   - **Policy:** in the access rule from step 1.2, add port 53, so your devices can ask the ingress for
     names: `"dst": ["tag:preview:53,443,8025"]`.
5. **Redeploy** each environment that already exists (push to its PR; for the baseline, push to the default
   branch or run `reset main` from the workflow's manual job). Each loses its own Tailscale node and is
   served by the ingress from then on. Persistent nodes (the baselines') then remain in the admin console as
   offline machines; delete them there.

## What lives where

| Path or name                    | Content                                                                                     |
| ------------------------------- | ------------------------------------------------------------------------------------------- |
| `~/.config/tailnet-preview/env` | `TS_OAUTH_SECRET`, optionally `TS_TAGS` and the shared ingress's settings, for all projects |
| `~/previews/<project>/`         | Generated secrets, environment directories, baseline backups, lock                          |
| `~/previews/.ingress/`          | The shared ingress's files (section 4)                                                      |
| `~/tailnet-preview/`            | The `tailnet-preview` command (step 2.5)                                                    |
| `<project>-<env>-*`             | Containers of one environment                                                               |
| `<project>-<env>_*`             | Volumes of one environment                                                                  |

To remove a project completely: destroy its environments (`tailnet-preview destroy pr-N`,
`tailnet-preview destroy main --force`), then remove `~/previews/<project>/`.
