#!/usr/bin/env bash
# Integration tests: the real engine, Docker and the example project (its own PostgreSQL); only Tailscale is
# replaced by test/fake-tailscale. Needs a Docker daemon. Usage: test/integration.sh
set -euo pipefail

REPO=$(cd "$(dirname "$0")/.." && pwd)
WORK=$(mktemp -d)
export TP_HOME=$WORK/home TP_PROJECT=tp-itest TP_SOURCE=$REPO TP_CONFIG=$REPO/example/.tailnet-preview
export TS_OAUTH_SECRET=tskey-client-fake TP_TS_IMAGE=tp-fake-tailscale:test TP_FAILURE_FILE=$WORK/failure
export TP_NOTICE_FILE=$WORK/notice TP_CERT_RETRY_DELAYS='2 2 2' TP_CERT_RATE_LIMIT_MARGIN=1
export TP_CERT_MIN_GAP=0
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
  rm -rf "$WORK" "$REPO"/example/.tp-test-*
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
# A variant of the example's configuration, next to it so that ../compose.yaml still resolves.
variant() {
  local dir=$REPO/example/.tp-test-$1
  rm -rf "$dir" && cp -R "$REPO/example/.tailnet-preview" "$dir"
  printf '%s' "$dir"
}
mode() { "$TP" info "$1" | sed -n 's/^mode=//p'; }
notes() { "$TP" compose "$1" exec -T app psql -Atq -F ' ' -c 'SELECT env, body FROM notes ORDER BY id' 2>>"$WORK/notes-errors"; }
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
grep -q '"Proxy": "http://app:8080"' <<<"$("$TP" compose pr-1 exec -T ts tailscale serve status)" || fatal "HTTPS on"
ok "with its certificate, the sidecar serves HTTPS"
[[ -z $(docker port tp-itest-pr-1-app-1 2>/dev/null) ]] || fatal "pr-1 publishes the project's port 8080"
grep -qx example-app <<<"$(docker ps --format '{{.Names}}')" && fatal "the fixed container name was kept"
ok "published ports and fixed container names are removed"

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
grep -q 'environment: pr-2' <<<"$(http pr-2 /)" || fatal "pr-2 home page"
ok "pr-2 serves its own environment"
grep -q 'url: https://tp-itest-pr-2.fake-tailnet.ts.net' <<<"$(http pr-2 /)" || fatal "TP_URL reaches the app"
ok "TP_URL is set before services start"

step "upgrade in place"
"$TP" compose pr-2 exec -T app psql -q -c "INSERT INTO notes (env, body) VALUES ('pr-2', 'mine')"
run deploy pr-2 --tag "$TAG"
expect_rc 0 "redeploy pr-2"
grep -q '^pr-2 mine$' <<<"$(notes pr-2)" || fatal "upgrade keeps data"
[[ $(mode pr-2) == upgraded ]] || fatal "info mode after redeploy: $(mode pr-2)"
ok "upgrade keeps data"
grep -q 'pr-2' <<<"$(notes main)" && fatal "a PR's writes reach the baseline"
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

step "DATA_VOLUMES=none: every PR starts fresh"
nodata=$(variant nodata) && echo 'DATA_VOLUMES=none' >>"$nodata/config.env"
TP_CONFIG=$nodata run deploy pr-4 --tag "$TAG"
expect_rc 0 "deploy pr-4 with DATA_VOLUMES=none"
[[ $(mode pr-4) == fresh && $(notes pr-4) == "pr-4 seeded" ]] || fatal "pr-4: $(mode pr-4), $(notes pr-4) $(cat "$WORK/notes-errors")"
ok "pr-4 fresh although a baseline exists"
run destroy pr-4
expect_rc 0 "destroy pr-4"

wrongvol=$(variant wrongvol) && echo 'DATA_VOLUMES=nonexistent' >>"$wrongvol/config.env"
TP_CONFIG=$wrongvol run deploy pr-5 --tag "$TAG"
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

# A sidecar that restarted and is still logging in is not a tailnet without HTTPS certificates.
"$TP" compose pr-2 exec -T ts sh -c 'echo 1 3 >/var/lib/tailscale/starting' # Running for resolve_url, then restarting
run deploy pr-2 --tag "$TAG"
expect_rc 0 "deploy waits for a sidecar that is still logging in"

cert_requests() { wc -l <<<"$("$TP" compose pr-2 exec -T ts cat /var/lib/tailscale/cert-requests)"; }
grep -q 'cert --cert-file' <<<"$("$TP" compose pr-2 exec -T ts cat /var/lib/tailscale/cert-requests)" ||
  fatal "deploy requests the certificate"
ok "deploy requests the certificate"
serve_status() { "$TP" compose pr-2 exec -T ts tailscale serve status; }
"$TP" compose pr-2 exec -T ts sh -c ': >/var/lib/tailscale/cert-requests; touch /var/lib/tailscale/cert-invalid; rm -rf /var/lib/tailscale/certs'
rm -f "$TP_NOTICE_FILE"
run deploy pr-2 --tag "$TAG"
expect_rc 0 "deploy without a certificate succeeds"
[[ $(serve_status) == '{}' ]] || fatal "HTTPS off without a certificate, got: $(serve_status)"
ok "without a certificate, the sidecar serves nothing (tailscaled would request one on every visit)"
[[ $(cut -f1 "$TP_NOTICE_FILE" 2>/dev/null) == cert ]] || fatal "notice cert, got '$(cat "$TP_NOTICE_FILE" 2>/dev/null)'"
grep -q 'Incorrect TXT record' "$TP_NOTICE_FILE" || fatal "notice cert carries Let's Encrypt's error"
[[ $(cert_requests) == 1 ]] || fatal "deploy requests the certificate once, got $(cert_requests) requests"
ok "notice cert with Let's Encrypt's error"
retry_log() { "$TP" compose pr-2 exec -T ts cat /var/lib/tailscale/tp-cert-retry.log 2>/dev/null; }
sleep 3
grep -q 'failed: .*Incorrect TXT record' <<<"$(retry_log)" || fatal "the sidecar retries in the background: $(retry_log)"
"$TP" compose pr-2 exec -T ts rm /var/lib/tailscale/cert-invalid
for _ in 1 2 3 4 5; do grep -q issued <<<"$(retry_log)" && break; sleep 1; done
grep -q issued <<<"$(retry_log)" || fatal "a background retry gets the certificate: $(retry_log)"
grep -q issued <<<"$("$TP" doctor pr-2)" || fatal "doctor shows the background retries"
grep -q '"Proxy": "http://app:8080"' <<<"$(serve_status)" || fatal "the loop switches HTTPS on: $(serve_status)"
ok "the sidecar retries in the background until the certificate is issued, then serves HTTPS; doctor shows it"

# Let's Encrypt remembers a missing validation record for a while: no request soon after a failed one,
# unless tailscaled already has the certificate.
"$TP" compose pr-2 exec -T ts sh -c ': >/var/lib/tailscale/cert-requests; date +%s >/var/lib/tailscale/tp-cert-failed'
TP_CERT_MIN_GAP=600 run deploy pr-2 --tag "$TAG"
expect_rc 0 "deploy with a certificate soon after a failed request"
[[ $(cert_requests) == 1 ]] || fatal "an existing certificate is fetched regardless, got $(cert_requests) requests"
"$TP" compose pr-2 exec -T ts sh -c ': >/var/lib/tailscale/cert-requests; rm -rf /var/lib/tailscale/certs; date +%s >/var/lib/tailscale/tp-cert-failed'
rm -f "$TP_NOTICE_FILE"
TP_CERT_MIN_GAP=600 run deploy pr-2 --tag "$TAG"
expect_rc 0 "deploy without a certificate soon after a failed request"
grep -q 'previous request failed' "$TP_NOTICE_FILE" || fatal "notice cert says why: $(cat "$TP_NOTICE_FILE")"
[[ -z $("$TP" compose pr-2 exec -T ts cat /var/lib/tailscale/cert-requests) ]] || fatal "requested soon after a failure"
ok "no certificate request soon after a failed one"
"$TP" compose pr-2 exec -T ts rm -f /var/lib/tailscale/tp-cert-failed

# A request that hangs (Let's Encrypt or Tailscale slow) does not hold the deploy up.
"$TP" compose pr-2 exec -T ts touch /var/lib/tailscale/cert-slow
rm -f "$TP_NOTICE_FILE"
start=$SECONDS
TP_CERT_TIMEOUT=3 run deploy pr-2 --tag "$TAG"
expect_rc 0 "deploy with a hanging certificate request succeeds"
((SECONDS - start < 25)) || fatal "a hanging certificate request held the deploy for $((SECONDS - start))s"
grep -q 'no answer within 3s' "$TP_NOTICE_FILE" || fatal "notice cert says the request hung: $(cat "$TP_NOTICE_FILE")"
ok "a hanging certificate request is cut off and left to the background loop"
"$TP" compose pr-2 exec -T ts rm /var/lib/tailscale/cert-slow

# A new deploy supersedes the previous one's certificate request.
"$TP" compose pr-2 exec -T ts touch /var/lib/tailscale/cert-slow
"$TP" compose pr-2 exec -d ts tailscale cert old-request
sleep 1
"$TP" compose pr-2 exec -T ts rm /var/lib/tailscale/cert-slow
run deploy pr-2 --tag "$TAG"
expect_rc 0 "deploy while an earlier certificate request runs"
[[ -z $("$TP" compose pr-2 exec -T ts pgrep -f 'tailscale [c]ert old-request') ]] || fatal "the earlier certificate request still runs"
ok "a new deploy stops the earlier certificate request"

# Rate limited: a deploy does not request while the limit lasts (it would only extend it); the background
# loop waits it out, then gets the certificate.
"$TP" compose pr-2 exec -T ts sh -c ': >/var/lib/tailscale/cert-requests; : >/var/lib/tailscale/tp-cert-retry.log; echo 20 >/var/lib/tailscale/cert-ratelimited; rm -rf /var/lib/tailscale/certs'
rm -f "$TP_NOTICE_FILE"
run deploy pr-2 --tag "$TAG"
expect_rc 0 "deploy while Let's Encrypt rate limits the name"
grep -q rateLimited "$TP_NOTICE_FILE" || fatal "notice cert names the rate limit: $(cat "$TP_NOTICE_FILE")"
rm -f "$TP_NOTICE_FILE"
run deploy pr-2 --tag "$TAG"
expect_rc 0 "deploy again during the rate limit"
grep -q 'refuses new requests for this name until' "$TP_NOTICE_FILE" || fatal "notice cert says until when: $(cat "$TP_NOTICE_FILE")"
[[ $(cert_requests) == 1 ]] || fatal "a deploy requested a certificate during the rate limit, got $(cert_requests) requests"
ok "no certificate request while the name is rate limited"
"$TP" compose pr-2 exec -T ts rm /var/lib/tailscale/cert-ratelimited
for _ in $(seq 1 40); do grep -q issued <<<"$(retry_log)" && break; sleep 1; done
grep -q issued <<<"$(retry_log)" || fatal "the background loop gets the certificate after the rate limit: $(retry_log)"
ok "the background loop waits out the rate limit, then gets the certificate"

limited=$(variant limited) && echo 'MAX_ENVS=2' >>"$limited/config.env"
TP_CONFIG=$limited run deploy pr-3 --tag "$TAG"
expect_rc 3 "limit of PR environments exits 3"

bad=$(variant bad) && echo 'NOPE=1' >>"$bad/config.env"
TP_CONFIG=$bad run deploy pr-3 --tag "$TAG"
expect_rc 1 "unknown config key fails"
expect_reason config "reason config"

sick=$(variant sick) && sed -i 's|^HEALTH_PATH=.*|HEALTH_PATH=/missing|' "$sick/config.env"
TP_CONFIG=$sick TP_HEALTH_TIMEOUT=6 run deploy pr-1 --tag "$TAG"
expect_rc 1 "failing health check fails"
expect_reason health "reason health"

TS_OAUTH_SECRET='' run deploy pr-1 --tag "$TAG"
expect_rc 1 "missing OAuth secret fails"
expect_reason ts_secret "reason ts_secret"

step "validate and init"
run validate
expect_rc 0 "validate the example"
grep -q '0 error(s), 0 warning(s)' <<<"$OUT" || fatal "the example validates cleanly: $OUT"
grep -q 'copy every named volume from the baseline: db-data' <<<"$OUT" || fatal "validate resolves DATA_VOLUMES"
ok "validate output"
broken=$(variant broken) && sed -i 's/^HTTP=.*/HTTP=nope:80/' "$broken/config.env" && echo 'DATA_VOLUMES=nope' >>"$broken/config.env"
TP_CONFIG=$broken run validate
expect_rc 1 "validate rejects a wrong HTTP service and volume"
grep -q "no running service 'nope'" <<<"$OUT" || fatal "validate names the HTTP error: $OUT"
grep -q "DATA_VOLUMES entry 'nope'" <<<"$OUT" || fatal "validate names the volume error: $OUT"
ok "validate names both errors"
fixed=$(variant fixed) && printf 'volumes:\n  db-data:\n    name: shared-data\n' >>"$fixed/compose.yaml"
TP_CONFIG=$fixed run validate
expect_rc 1 "validate rejects a fixed volume name"
mkdir -p "$WORK/newproject" && cp "$REPO/example/compose.yaml" "$WORK/newproject/compose.yaml"
mkdir -p "$WORK/newproject/web" && echo 'FROM scratch' >"$WORK/newproject/web/Dockerfile"
TP_SOURCE=$WORK/newproject TP_CONFIG=$WORK/newproject/.tailnet-preview run init
expect_rc 0 "init in a project with a compose file"
grep -qx 'COMPOSE_FILES=../compose.yaml compose.yaml' "$WORK/newproject/.tailnet-preview/config.env" ||
  fatal "init uses the project's compose file"
grep -qx 'IMAGES=web=web/Dockerfile' "$WORK/newproject/.tailnet-preview/config.env" || fatal "init finds the Dockerfile"
ok "init finds the compose file and the Dockerfile"
TP_SOURCE=$WORK/newproject TP_CONFIG=$WORK/newproject/.tailnet-preview run init
expect_rc 1 "init refuses to overwrite"

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
grep -q '^tp-itest-pr-2-' <<<"$(docker ps -a --format '{{.Names}}')" && fatal "pr-2 containers remain"
grep -q '^tp-itest-pr-2_' <<<"$(docker volume ls -q)" && fatal "pr-2 volumes remain"
ok "pr-2 containers and volumes removed"

printf '\n\033[32m%d checks passed\033[0m\n' "$PASSED"
