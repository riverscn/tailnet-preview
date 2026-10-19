#!/usr/bin/env bash
# Integration tests: the real engine, Docker and the example project (its own PostgreSQL); only Tailscale is
# replaced by test/fake-tailscale. Needs a Docker daemon. Usage: test/integration.sh
set -euo pipefail

REPO=$(cd "$(dirname "$0")/.." && pwd)
WORK=$(mktemp -d)
export TP_HOME=$WORK/home TP_PROJECT=tp-itest TP_SOURCE=$REPO TP_CONFIG=$REPO/example/.tailnet-preview
export TS_OAUTH_SECRET=tskey-client-fake TP_TS_IMAGE=tp-fake-tailscale:test TP_FAILURE_FILE=$WORK/failure
export TP_RETRY_DELAY=1 TP_HOST_CONFIG=$WORK/no-host-config
TP=$REPO/bin/tailnet-preview
TAG=itest$(date +%s)
PASSED=0

cleanup() {
  local env
  for env in "$TP_HOME"/tp-itest/envs/*; do
    if [[ -d $env ]]; then "$TP" destroy "$(basename "$env")" --force >/dev/null 2>&1 || true; fi
  done
  docker images --filter label=tailnet-preview.project=tp-itest -q | xargs -r docker rmi -f >/dev/null 2>&1 || true
  rm -rf "$WORK"
}
trap cleanup EXIT

step() { printf '\n\033[1m== %s\033[0m\n' "$*"; }
ok() {
  PASSED=$((PASSED + 1))
  printf '\033[32mok\033[0m %s\n' "$*"
}
fatal() {
  printf '\033[31mFAIL\033[0m %s\n' "$*"
  exit 1
}

# Run the engine; set RC and OUT (stdout) without aborting on failure.
run() {
  rm -f "$TP_FAILURE_FILE"
  set +e
  OUT=$("$TP" "$@" 2>"$WORK/stderr")
  RC=$?
  set -e
  if [[ ${VERBOSE:-} == 1 ]]; then cat "$WORK/stderr" >&2; fi
}
expect_rc() {
  [[ $RC == "$1" ]] || {
    tail -40 "$WORK/stderr"
    fatal "$2: exit code $RC, expected $1"
  }
  ok "$2"
}
expect_reason() {
  [[ $(cut -f1 "$TP_FAILURE_FILE" 2>/dev/null) == "$1" ]] || fatal "$2: reason '$(cat "$TP_FAILURE_FILE" 2>/dev/null)', expected $1"
  ok "$2"
}
mode() { "$TP" info "$1" | sed -n 's/^mode=//p'; }
notes() { "$TP" compose "$1" exec -T app psql -Atq -F ' ' -c 'SELECT env, body FROM notes ORDER BY id' 2>/dev/null; }
http() { "$TP" compose "$1" exec -T ts wget -q -O - "http://app:8080$2" 2>/dev/null; }

step "prerequisites"
docker build -q -t tp-fake-tailscale:test "$REPO/test/fake-tailscale" >/dev/null
ok "fake tailscale image"
run build --tag "$TAG"
expect_rc 0 "build the example image"
run build --tag "$TAG"
expect_rc 0 "build again (skipped)"
grep -q 'already exist' "$WORK/stderr" || fatal "second build did not skip"

step "a PR before the baseline exists"
run deploy pr-1 --tag "$TAG"
expect_rc 4 "deploy without baseline exits 4"
run deploy pr-1 --tag "$TAG" --fresh
expect_rc 0 "deploy --fresh"
[[ $OUT == https://tp-itest-pr-1.fake-tailnet.ts.net ]] || fatal "stdout is only the URL, got: $OUT"
ok "stdout is only the URL"
[[ $(notes pr-1) == "pr-1 seeded" ]] || fatal "fresh PR is seeded with its own name: $(notes pr-1)"
[[ $(mode pr-1) == fresh ]] || fatal "info mode of pr-1: $(mode pr-1)"
ok "fresh PR seeded"
[[ $(stat -c %a "$TP_HOME/tp-itest/envs/pr-1/compose.env") == 600 ]] || fatal "compose.env is not 600"
ok "compose.env is private"
grep -q '"Proxy": "http://app:8080"' "$TP_HOME/tp-itest/envs/pr-1/tailscale/serve.json" || fatal "serve.json"
ok "serve.json proxies to the HTTP upstream"

step "baseline and fork"
run deploy main --tag "$TAG"
expect_rc 0 "deploy the baseline"
"$TP" compose main exec -T app psql -q -c "INSERT INTO notes (env, body) VALUES ('main', 'written later')"
run deploy pr-2 --tag "$TAG"
expect_rc 0 "deploy pr-2 forked from the baseline"
[[ $(notes pr-2) == $'main seeded\nmain written later' ]] || fatal "fork copies the baseline: $(notes pr-2)"
[[ $(mode pr-2) == forked ]] || fatal "info mode of pr-2: $(mode pr-2)"
ok "fork has the baseline's data and was not seeded"
[[ -n $(docker volume ls -q --filter label=com.docker.compose.project=tp-itest-pr-2 --filter label=com.docker.compose.volume=db-data) ]] ||
  fatal "pr-2 has its own db-data volume"
ok "pr-2 has its own data volume"
[[ $(http main /health) == ok ]] || fatal "baseline is back up after the fork"
ok "baseline restarted after the fork"
http pr-2 / | grep -q 'environment: pr-2' || fatal "pr-2 home page"
ok "pr-2 serves its own environment"
http pr-2 / | grep -q 'url: https://tp-itest-pr-2.fake-tailnet.ts.net' || fatal "TP_URL reaches the app"
ok "TP_URL is set before services start"

step "upgrade in place"
"$TP" compose pr-2 exec -T app psql -q -c "INSERT INTO notes (env, body) VALUES ('pr-2', 'mine')"
run deploy pr-2 --tag "$TAG"
expect_rc 0 "redeploy pr-2"
notes pr-2 | grep -q '^pr-2 mine$' || fatal "upgrade keeps data"
[[ $(mode pr-2) == upgraded ]] || fatal "info mode after redeploy: $(mode pr-2)"
ok "upgrade keeps data"
notes main | grep -q 'pr-2' && fatal "a PR's writes reach the baseline"
ok "PR writes stay in the PR"
run has pr-2
expect_rc 0 "has pr-2"
run has pr-9
expect_rc 2 "has pr-9 (missing) exits 2"

step "a half-created environment is recreated"
rm "$TP_HOME/tp-itest/envs/pr-1/initialized"
run has pr-1
expect_rc 2 "has pr-1 without marker exits 2"
run deploy pr-1 --tag "$TAG" --fresh
expect_rc 0 "redeploy pr-1"
grep -q 'creating with empty volumes' "$WORK/stderr" || fatal "pr-1 was not recreated"
[[ $(notes pr-1) == "pr-1 seeded" ]] || fatal "recreated pr-1 has only its seed: $(notes pr-1)"
ok "half-created environment recreated"

step "without DATA_VOLUMES every PR starts fresh"
cp -R "$TP_CONFIG" "$WORK/nodata" && sed -i 's/^DATA_VOLUMES=.*//' "$WORK/nodata/config.env"
TP_CONFIG=$WORK/nodata run deploy pr-4 --tag "$TAG"
expect_rc 0 "deploy pr-4 without DATA_VOLUMES"
[[ $(mode pr-4) == fresh && $(notes pr-4) == "pr-4 seeded" ]] || fatal "pr-4: $(mode pr-4), $(notes pr-4)"
ok "pr-4 fresh although a baseline exists"
run destroy pr-4
expect_rc 0 "destroy pr-4"

cp -R "$TP_CONFIG" "$WORK/wrongvol" && sed -i 's/^DATA_VOLUMES=.*/DATA_VOLUMES=nonexistent/' "$WORK/wrongvol/config.env"
TP_CONFIG=$WORK/wrongvol run deploy pr-5 --tag "$TAG"
expect_rc 1 "a DATA_VOLUMES entry that is not a volume fails"
expect_reason fork "reason fork"
[[ $(http main /health) == ok ]] || fatal "baseline is back up after a failed fork"
ok "baseline restarted after a failed fork"
run destroy pr-5
expect_rc 0 "destroy pr-5"

step "failures with reasons"
"$TP" compose pr-2 exec -T ts touch /var/lib/tailscale/no-https
run deploy pr-2 --tag "$TAG"
expect_rc 1 "deploy without HTTPS certificates fails"
expect_reason https "reason https"
run has pr-2
expect_rc 0 "environment kept without HTTPS"
"$TP" compose pr-2 exec -T ts rm /var/lib/tailscale/no-https

cp -R "$TP_CONFIG" "$WORK/limited" && echo 'MAX_ENVS=2' >>"$WORK/limited/config.env"
TP_CONFIG=$WORK/limited run deploy pr-3 --tag "$TAG"
expect_rc 3 "limit of PR environments exits 3"

cp -R "$TP_CONFIG" "$WORK/bad" && echo 'NOPE=1' >>"$WORK/bad/config.env"
TP_CONFIG=$WORK/bad run deploy pr-3 --tag "$TAG"
expect_rc 1 "unknown config key fails"
expect_reason config "reason config"

cp -R "$TP_CONFIG" "$WORK/sick" && sed -i 's|^HEALTH_PATH=.*|HEALTH_PATH=/missing|' "$WORK/sick/config.env"
TP_CONFIG=$WORK/sick TP_HEALTH_TIMEOUT=6 run deploy pr-1 --tag "$TAG"
expect_rc 1 "failing health check fails"
expect_reason health "reason health"

TS_OAUTH_SECRET='' run deploy pr-1 --tag "$TAG"
expect_rc 1 "missing OAuth secret fails"
expect_reason ts_secret "reason ts_secret"

step "operations"
run doctor pr-2
expect_rc 0 "doctor"
grep -q 'enabled for the tailnet' <<<"$OUT" || fatal "doctor reports HTTPS"
grep -q 'http://app:8080/health: ok' <<<"$OUT" || fatal "doctor checks the upstream"
ok "doctor output"
run list
[[ $(grep -c . <<<"$OUT") == 3 ]] || fatal "list shows three environments: $OUT"
ok "list"
run backup
expect_rc 0 "backup"
archives=("$TP_HOME"/tp-itest/backups/main-*/db-data.tar.gz)
listing=$(tar tzf "${archives[0]}")
grep -q PG_VERSION <<<"$listing" || fatal "backup archive"
ok "backup archive of db-data written"
run prune 2
expect_rc 0 "prune keeps open PR 2"
[[ ! -d $TP_HOME/tp-itest/envs/pr-1 && -d $TP_HOME/tp-itest/envs/pr-2 ]] || fatal "prune removed pr-1 only"
ok "prune removed the closed PR"
main_url=$("$TP" url main)
run reset main --tag "$TAG"
expect_rc 0 "reset main"
[[ $("$TP" url main) == "$main_url" ]] || fatal "reset main keeps the address"
[[ $(notes main) == "main seeded" ]] || fatal "reset main starts over: $(notes main)"
ok "reset main starts over"
run destroy main
expect_rc 1 "destroy main needs --force"
run destroy pr-2
expect_rc 0 "destroy pr-2"
docker ps -a --format '{{.Names}}' | grep -q '^tp-itest-pr-2-' && fatal "pr-2 containers remain"
docker volume ls -q | grep -q '^tp-itest-pr-2_' && fatal "pr-2 volumes remain"
ok "pr-2 containers and volumes removed"

printf '\n\033[32m%d checks passed\033[0m\n' "$PASSED"
