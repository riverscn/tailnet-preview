# Configuring a project

[简体中文](configuring.zh-CN.md)

This guide turns a repository into one that tailnet-preview can deploy. It is written as a procedure that a
person or an AI coding agent can follow from top to bottom: every step says **where to look** in the
project and **what to write**. The result is a `.tailnet-preview/` directory that passes
`tailnet-preview validate` and a local smoke test.

Reference for every key and variable: [design.md section 5](design.md#5-project-configuration). Workflow
and repository settings come afterwards: [project-setup.md](project-setup.md).

> **For AI agents.** Work through the steps in order. Do not invent values you cannot find in the
> repository; leave a `TODO` and ask. Never put real credentials, production hostnames or real user data in
> the configuration. Do not change how the project runs elsewhere: everything preview-specific goes into
> `.tailnet-preview/`. You are done when the [checklist](#checklist) is complete.

## 0. What the project needs first

- Each service that must run is a **container image built from a Dockerfile in the repository**, or a
  public image (databases, caches, mail catchers). A service that only runs with `npm run dev` or similar
  needs a Dockerfile first; that is a change to the project, not to its preview configuration.
- The application reads its settings from **environment variables**, at least its public URL and its
  database connection. If a setting is hard-coded, making it configurable is a project change.

## 1. Start from the generated skeleton

```bash
tailnet-preview init          # from the repository root; writes .tailnet-preview/config.env and compose.yaml
```

`init` lists the Dockerfiles it finds in `IMAGES` and, if the repository has a compose file at its root
(`compose.yaml`, `docker-compose.yml`, …), sets `COMPOSE_FILES=../<that file> compose.yaml` and writes
`compose.yaml` as an override. Every guess is marked `TODO`.

## 2. Images: `IMAGES`

**Look for:** Dockerfiles of the services the project deploys (`Dockerfile`, `apps/*/Dockerfile`,
`*.Dockerfile`); CI or deployment scripts that run `docker build`.

**Write:** one `name=path` per image, path relative to the repository root, which is also the build
context. Use the image in compose as `${TP_IMAGE_<NAME>}`.

```sh
IMAGES=api=apps/api/Dockerfile web=apps/web/Dockerfile
```

Images the project only pulls (`postgres`, `redis`) do not belong here.

## 3. The environment's services: `COMPOSE_FILES` and `compose.yaml`

**Look for:** a compose file that runs the whole application (production or a full local stack). A compose
file that runs only dependencies (database, cache) for local development is still useful: reuse it and add
the application's services in the override.

**If such a file exists**, reuse it unchanged and override only what differs:

```sh
COMPOSE_FILES=../compose.yaml compose.yaml
```

In `.tailnet-preview/compose.yaml`, set for each service of yours `image: ${TP_IMAGE_<NAME>}` (the image
built for this PR) and the environment variables of steps 5 and 6. You do not need to remove `ports:` or
`container_name:`; tailnet-preview does that. Relative paths in every file resolve against the directory
of the **first** file.

**If not**, write the complete environment in `.tailnet-preview/compose.yaml` (`COMPOSE_FILES` defaults to
it): every service, the database included, as in the [example](../example/) or the template `init` writes.

Rules that `validate` enforces: no service named `ts`; no volume with a fixed `name:`; tasks in the `tasks`
profile.

## 4. The entry point: `HTTP`, `HEALTH_PATH`, `PORTS`

**Look for:** the service that serves the web UI or the API that a browser opens; its **container** port
(the right-hand side of `ports: "8080:3000"` is `3000`, or `EXPOSE` in its Dockerfile, or the port its
server listens on). A health endpoint (`/health`, `/api/health`, `/healthz`); otherwise use `/` if it
answers 2xx/3xx without logging in.

```sh
HTTP=web:80
HEALTH_PATH=/api/health
PORTS=8025=mailpit:8025      # optional: other UIs worth opening, each on its own HTTPS port
```

If the front end and the API are separate services, `HTTP` is the one the browser opens; it must proxy the
other (for example nginx proxying `/api/`), exactly as in production.

## 5. The application's own address: `TP_URL`

Each environment has its own address, `https://<project>-<env>.<tailnet>.ts.net`, available as
`${TP_URL}`. Applications need it for login redirects, cookies, CORS and links in e-mails.

**Look for:** every setting that contains the public URL or the host name: `APP_URL`, `BASE_URL`,
`PUBLIC_URL`, `NEXTAUTH_URL`, `BETTER_AUTH_URL`, `ALLOWED_ORIGINS`, `CORS_ORIGIN`, `TRUSTED_ORIGINS`,
`VITE_*`/`NEXT_PUBLIC_*` variables baked into front-end builds.

**Write:** each of them as `${TP_URL}` in the override. A front-end build that bakes the URL in at build
time cannot be pointed at a different URL per environment: use relative URLs (same origin) in the front
end, which is also what preview environments serve.

The application runs behind a TLS-terminating proxy: if it checks the protocol (secure cookies, redirects
to https), make it trust `X-Forwarded-Proto` from private addresses (`10.0.0.0/8`, `172.16.0.0/12`,
`192.168.0.0/16`).

## 6. The outside world: mocks

A preview environment must not send real e-mails or SMS, charge cards, or call production APIs with real
keys. **Look for:** settings that hold credentials or endpoints of external services: SMTP, SMS, payment,
OAuth providers, object storage, analytics, error reporting, captcha.

**Write**, per service, whichever the project supports:

- a mock or "console" mode the application already has;
- a local stand-in as another service: a mail catcher (`axllent/mailpit`, its UI on a `PORTS` entry), an
  S3-compatible store (`minio`), …;
- the feature switched off.

Never copy production credentials into `.tailnet-preview/`. If the application refuses to start without a
real credential and has no mock, stop and ask: that needs a project change.

## 7. Data: `DATA_VOLUMES`, `SECRETS`

A PR environment starts with a copy of the baseline's data. By default every named volume is copied
(`DATA_VOLUMES=auto`); that is right when all named volumes hold data (database, uploads, search index).

```sh
DATA_VOLUMES=db-data uploads   # only these; caches and build artefacts start empty
DATA_VOLUMES=none              # every PR starts with empty data and runs the seed task
```

Passwords that the database and the application share go into `SECRETS` and are used by name in compose.
They are generated once per project and identical in every environment, which a copied database requires:

```sh
SECRETS=DB_PASSWORD SESSION_SECRET
```

```yaml
services:
  db:
    environment:
      POSTGRES_PASSWORD: ${DB_PASSWORD}
  api:
    environment:
      DATABASE_URL: postgres://app:${DB_PASSWORD}@db:5432/app
```

## 8. Migrations and demo data: tasks

**Look for:** the migration command (`migrate`, `db:migrate`, `prisma migrate deploy`, `alembic upgrade
head`, …) and a seed or fixtures command. If the application migrates by itself on start, no `migrate` task
is needed.

**Write** them as services in the `tasks` profile, run with `docker compose run --rm`:

```yaml
services:
  migrate:
    image: ${TP_IMAGE_API}
    profiles: [tasks]
    environment: *env
    depends_on:
      db:
        condition: service_healthy
    command: ['node', 'dist/migrate.js']
  seed:
    image: ${TP_IMAGE_API}
    profiles: [tasks]
    environment: *env
    depends_on:
      db:
        condition: service_healthy
    command: ['node', 'dist/seed.js']
```

`migrate` runs before every deploy; `seed` runs only when an environment starts with empty data. Demo data
must be fictional; mention its accounts in `comment.md` so reviewers can log in.

## 9. Check it

```bash
tailnet-preview validate
```

It merges the compose files the way a deploy would and reports, without building or starting anything:
images and Dockerfiles, the merged files and where relative paths resolve, the `HTTP` and `PORTS` services,
which volumes are copied, fixed volume names, tasks, and whether `TP_URL`, the images and the secrets are
used. Fix every `ERROR`; read every `WARN`.

Then run it once on a machine with Docker, without a tailnet, using the fake Tailscale sidecar of the test
suite:

```bash
git clone --depth 1 https://github.com/riverscn/tailnet-preview /tmp/tailnet-preview
docker build -t tp-fake-tailscale /tmp/tailnet-preview/test/fake-tailscale
export TP_TS_IMAGE=tp-fake-tailscale TS_OAUTH_SECRET=fake TP_HOME=$(mktemp -d)
TP=/tmp/tailnet-preview/bin/tailnet-preview
$TP build && $TP deploy main          # builds, migrates, seeds, waits for HEALTH_PATH
$TP doctor main                       # every upstream should answer "ok"
$TP compose main exec ts wget -qO- http://web:80/   # replace with your HTTP upstream
$TP destroy main --force
```

`deploy` fails with a reason (`migrate`, `seed`, `health`, …) and prints the services' logs when something
does not come up.

## Checklist

- [ ] `IMAGES` lists every image built from the repository; each is used as `${TP_IMAGE_<NAME>}`.
- [ ] `COMPOSE_FILES` reuses the project's compose file if one exists; the override changes only what
      previews need.
- [ ] `HTTP` is the service and **container** port the browser opens; `HEALTH_PATH` answers without login.
- [ ] Every URL or origin setting of the application is `${TP_URL}`.
- [ ] Nothing reaches a real external service: mail, SMS, payments, OAuth, storage use mocks or are off.
- [ ] Shared passwords are in `SECRETS`; no real credential appears anywhere in `.tailnet-preview/`.
- [ ] `DATA_VOLUMES` copies exactly the volumes that hold data.
- [ ] `migrate` (unless the app migrates itself) and `seed` exist as tasks; demo data is fictional; its
      accounts are in `comment.md`.
- [ ] `tailnet-preview validate` reports no errors.
- [ ] The local smoke test deploys, `doctor` shows every upstream `ok`, and it was destroyed again.

## Common mistakes

| Mistake                                                     | Effect                                                  | Fix                                                        |
| ----------------------------------------------------------- | ------------------------------------------------------- | ---------------------------------------------------------- |
| `HTTP` uses the published port (`8080` of `8080:3000`)      | Health check never passes (`health`)                    | Use the container port (`3000`)                            |
| The application still has `localhost` or the production URL | Logins redirect to the wrong host; cookies are rejected | Set every URL setting to `${TP_URL}` (step 5)              |
| A password generated per service or per environment         | A copied database rejects the PR environment's password | Put it in `SECRETS`                                        |
| `migrate` or `seed` without `profiles: [tasks]`             | It keeps running as a service; `validate` reports it    | Add `profiles: [tasks]`                                    |
| Tasks start before the database accepts connections         | `migrate` fails on the first deploy                     | `depends_on: db: condition: service_healthy` + healthcheck |
| A volume with `name:`                                       | Every environment shares one volume                     | Remove `name:`                                             |
| Real SMTP or API credentials in the override                | Previews send real messages, secrets end up in git      | Mocks (step 6); never commit credentials                   |
| Front end built with an absolute API URL                    | The preview's UI talks to another environment or prod   | Same-origin relative URLs                                  |
