# Setting it up with an AI agent

[简体中文](agent-guide.zh-CN.md)

A person can give an AI coding agent the URL of this repository and ask it to set up preview environments
for their project. This guide is the agent's playbook. It splits the setup into phases, says who does
each step, and gives a check for every step that the agent can run itself. The detailed instructions stay
in the other guides; this one says what to do with them and in which order.

Who does what:

| Mark      | Meaning                                                                                                                                                               |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Human** | Only the person can do it: signing in to Tailscale, GitHub or a DNS provider in a browser, creating or pasting secrets, and `sudo` when the agent has no such rights. |
| **Agent** | The agent does it with a shell on the machine, the `gh` CLI signed in as the person, and the project's repository checked out.                                        |
| **Ask**   | The agent does it, but only after the person says yes: it changes the person's repository or accounts (a repository variable, a runner, a pull request).              |

## Rules for the agent

1. **Never ask for a secret in the chat, and never print one.** Secrets (the Tailscale OAuth client secret,
   a DNS API token) are written by the person, into the file or the GitHub setting the step names. Check
   that a secret is there without showing it, for example
   `grep -c '^TS_OAUTH_SECRET=tskey-client-' ~/.config/tailnet-preview/env` prints `1`.
2. **Batch the human steps.** Before a phase that needs the person, give them one numbered list of
   everything they have to do in it, with the exact pages and values. Wait until they say it is done, then
   run the checks. Do not ask one question at a time.
3. **Ask before changing their things.** Steps marked **Ask** change the person's repository or accounts;
   describe the change and wait for a yes.
4. **Do not change how the project runs elsewhere.** Everything preview-specific goes into
   `.tailnet-preview/` and the workflow file ([configuring.md](configuring.md)).
5. **Never point a preview environment at real user data**, and never copy production credentials into
   the configuration.
6. **Destructive commands need a yes:** `destroy`, `reset main`, `prune` with an empty list, removing
   volumes or `~/previews/`.

## Phase 0: what to find out first

Ask the person, in one message:

- Which repository (`owner/name`) gets previews, and is it private? A public one needs the settings in
  [security.md](security.md) first.
- Which Linux machine runs them, and does the agent have a shell there (is the agent running on it, or can
  it `ssh` to it)? Does the agent's user have `sudo`?
- Is the machine's tailnet already set up for tailnet-preview (another project uses it)? If so, skip phases
  1 to 3 and check them instead.
- Mode: `sidecar` (default, nothing beyond Tailscale) or `shared` (a domain of theirs; see the
  [README](../README.md#options)). Unless they have a reason, start with `sidecar`.

Check what is already there, on the machine: `docker compose version`, `docker ps`,
`tailnet-preview host-check` if the command exists, and `gh auth status` wherever `gh` runs.

## Phase 1: the tailnet (Human)

Give the person these steps from [host-setup.md section 1](host-setup.md#1-the-tailnet-once), with the
policy already filled in. For the ports, use 443 plus every port in the project's `PORTS` (read
`.tailnet-preview/config.env` if it exists; the example uses 8025):

1. Tailscale admin console → DNS: enable MagicDNS and HTTPS certificates.
2. Access controls: add `tag:preview` to `tagOwners` and an access rule for the ports, as in host-setup
   step 1.2. Hand them the exact JSON lines.
3. Settings → Trust credentials → Credential → OAuth: scope Auth Keys (Write), tag `tag:preview`. Keep the
   client secret (`tskey-client-…`) for phase 3; do not send it to the agent.

Check: the agent cannot see the tailnet's settings; the deploy in phase 6 proves them. Ask the person to
confirm all three.

## Phase 2: the machine (Agent; `sudo` steps may be Human)

Follow [host-setup.md section 2](host-setup.md#2-the-machine-once), steps 2.1 to 2.3 and 2.5, as the user
that will run the runner:

| Step                          | Who                          | Check                                                             |
| ----------------------------- | ---------------------------- | ----------------------------------------------------------------- |
| Docker with Compose           | Agent, or Human without sudo | `docker compose version`                                          |
| User in the `docker` group    | Agent, or Human without sudo | `docker ps` works without `sudo` (in a new login shell)           |
| Docker Hub reachable          | Agent                        | `docker pull postgres:17-alpine`; if it fails, see host-setup 2.3 |
| The `tailnet-preview` command | Agent                        | `tailnet-preview version`                                         |

## Phase 3: the Tailscale secret (Human)

Ask the person to run this on the machine, as the runner's user, replacing the placeholder with the client
secret from phase 1 (host-setup step 2.4):

```bash
mkdir -p ~/.config/tailnet-preview
printf 'TS_OAUTH_SECRET=tskey-client-...\n' > ~/.config/tailnet-preview/env
chmod 600 ~/.config/tailnet-preview/env
```

Check (Agent): `grep -c '^TS_OAUTH_SECRET=tskey-client-' ~/.config/tailnet-preview/env` prints `1`, and
`tailnet-preview host-check` reports no `FAIL`.

## Phase 4: the runner (Ask)

The runner registers with a one-time token that `gh` can fetch when the person is an admin of the
repository. Register it as the runner's user on the machine, in its own directory
([host-setup.md section 3](host-setup.md#3-the-runner-per-repository-or-once-per-organization)):

```bash
REPO=owner/name                                        # the person's repository
VERSION=$(gh api repos/actions/runner/releases/latest --jq '.tag_name | ltrimstr("v")')
ARCH=$(uname -m | sed 's/x86_64/x64/; s/aarch64/arm64/')
mkdir -p ~/actions-runner-${REPO#*/} && cd ~/actions-runner-${REPO#*/}
curl -fsSL "https://github.com/actions/runner/releases/download/v$VERSION/actions-runner-linux-$ARCH-$VERSION.tar.gz" | tar xz
TOKEN=$(gh api -X POST "repos/$REPO/actions/runners/registration-token" --jq .token)
./config.sh --unattended --url "https://github.com/$REPO" --token "$TOKEN" --labels preview --name "$(hostname)-${REPO#*/}"
sudo ./svc.sh install && sudo ./svc.sh start          # Human, if the agent has no sudo
```

If `gh` runs elsewhere (not on the machine), fetch the token there and pass it over; it expires after an
hour. Check: `gh api repos/$REPO/actions/runners --jq '.runners[] | [.name, .status, (.labels | map(.name) | join(","))]'`
lists the runner as `online` with the label `preview`.

## Phase 5: the project's configuration (Agent)

Follow [configuring.md](configuring.md) from top to bottom in the project's repository, on a branch. It is
written for agents: every step says where to look and what to write, and it ends with a checklist.

Check: `tailnet-preview validate` reports `0 error(s)`, and the local smoke test in configuring.md step 9
passes. Show the person the warnings and any `TODO` you could not resolve.

## Phase 6: the repository and the first pull request (Ask)

1. Add `.github/workflows/preview.yml` from
   [repository-setup.md section 2](repository-setup.md#2-add-the-workflow) on the same branch. Set
   `drafts` and `branches` only if the person asked for them.
2. Set the switch: `gh variable set PREVIEW_ENABLED --body true --repo "$REPO"`.
3. Commit, push and open the pull request: `gh pr create`.

Check: `gh pr checks --watch` until the deploy job finishes, then read the comment:
`gh pr view --comments`. It shows **Preview environment ready** with the address, or a failure with its
reason and fix ([troubleshooting.md](troubleshooting.md)). On the machine, `tailnet-preview doctor pr-<number>`
shows the details.

The first pull request gets fresh demo data; the baseline is created when it is merged
([repository-setup.md section 3](repository-setup.md#3-the-first-pull-request)). Ask the person to open the
address from a device in their tailnet: the agent usually cannot.

## Optional: the shared ingress

Only if the person chose `shared` ([host-setup.md section 4](host-setup.md#4-shared-ingress-optional-once-per-host)):

1. **Human:** create the DNS provider's API token (Cloudflare: Edit zone DNS, for the one zone) and add it to
   `~/.config/tailnet-preview/env` as the step says. The agent may write the lines without secrets
   (`TP_INGRESS=shared`, `TP_INGRESS_DOMAIN=…`, `TP_INGRESS_DNS_PROVIDER=…`, `TP_INGRESS_DNS_ENV=…`,
   `TP_INGRESS_ACME_EMAIL=…`) after asking.
2. **Agent:** `tailnet-preview ingress up`; note the address it prints.
3. **Human:** in the Tailscale admin console, the split DNS entry for the domain pointing to that address,
   and port 53 in the access rule.
4. **Agent, checks:** `tailnet-preview doctor <env>` says the certificate is `issued`; from a device in the
   tailnet (if the agent has one), `dig +short anything.<domain> @<address>` prints the address. Then
   redeploy the environments.

## Day to day

What an agent can do when asked to look after previews:

| Task                     | Command or place                                                                                                                         |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Why did a deploy fail?   | `gh pr view <n> --comments`; `gh run view <run> --log-failed`; `tailnet-preview doctor pr-<n>`; [troubleshooting.md](troubleshooting.md) |
| What exists on the host? | `tailnet-preview list`                                                                                                                   |
| Rebuild a PR environment | (Ask) `tailnet-preview destroy pr-<n>`, then re-run the PR's deploy job: `gh run rerun <run>`                                            |
| Start the baseline over  | (Ask) the workflow's manual job with `reset main`: `gh workflow run preview.yml -f args='reset main'`                                    |
| Update tailnet-preview   | (Ask) change the pinned version in the workflow after reading [CHANGELOG.md](../CHANGELOG.md)                                            |

Every command is listed in [design.md section 6](design.md#6-commands).
