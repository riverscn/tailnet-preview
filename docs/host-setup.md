# Host setup

The preview host is generic: the steps below are done once per tailnet and once per machine. Adding a
project later needs no login to the host (see [project-setup.md](project-setup.md)).

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

## What lives where

| Path or name                    | Content                                                                             |
| ------------------------------- | ----------------------------------------------------------------------------------- |
| `~/.config/tailnet-preview/env` | `TS_OAUTH_SECRET` (and optionally `TS_TAGS`) for all projects                       |
| `~/previews/<project>/`         | Generated secrets, environment directories, baseline backups, lock                  |
| `<project>-preview-postgres`    | The project's PostgreSQL container (volume `<project>-preview-infra_postgres-data`) |
| `<project>-<env>-*`             | Containers of one environment                                                       |

To remove a project completely: destroy its environments (`tailnet-preview destroy pr-N`,
`tailnet-preview destroy main --force`), then `docker rm -f <project>-preview-postgres`, remove its volume,
the network `<project>-preview` and `~/previews/<project>/`.
