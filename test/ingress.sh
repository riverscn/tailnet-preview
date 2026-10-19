#!/usr/bin/env bash
# Tests the shared ingress (TP_INGRESS=shared, docs/design.md section 10): the real engine, Docker, Traefik
# and CoreDNS with the example project; Tailscale is test/fake-tailscale and the certificate is Traefik's
# self-signed default (no DNS provider). Needs a Docker daemon with /dev/net/tun. Usage: test/ingress.sh
set -euo pipefail

REPO=$(cd "$(dirname "$0")/.." && pwd)
WORK=$(mktemp -d)
export TP_HOME=$WORK/home TP_PROJECT=tp-ingtest TP_SOURCE=$REPO TP_CONFIG=$REPO/example/.tailnet-preview
export TS_OAUTH_SECRET=tskey-client-fake TP_TS_IMAGE=tp-fake-tailscale:test TP_FAILURE_FILE=$WORK/failure
export TP_NOTICE_FILE=$WORK/notice TP_RETRY_DELAY=1 TP_HOST_CONFIG=$WORK/no-host-config
export TP_INGRESS=shared TP_INGRESS_DOMAIN=preview.test TP_INGRESS_PROJECT=tp-ingtest-ingress
TP=$REPO/bin/tailnet-preview
TAG=ingtest$(date +%s)
CURL=curlimages/curl:8.11.1
TS=tp-ingtest-ingress-ts-1
PASSED=0

cleanup() {
  local env
  for env in "$TP_HOME"/tp-ingtest/envs/*; do
    if [[ -d $env ]]; then "$TP" destroy "$(basename "$env")" --force >/dev/null 2>&1 || true; fi
  done
  [[ ! -f $TP_HOME/.ingress/compose.yaml ]] || "$TP" ingress down -v >/dev/null 2>&1 ||
    docker compose -p tp-ingtest-ingress down -v >/dev/null 2>&1 || true
  docker images --filter label=tailnet-preview.project=tp-ingtest -q | xargs -r docker rmi -f >/dev/null 2>&1 || true
  rm -rf "$WORK" "$REPO"/example/.tp-ingtest-*
}
trap cleanup EXIT

ok() {
  PASSED=$((PASSED + 1))
  printf '\033[32mok\033[0m %s\n' "$*"
}
fatal() {
  printf '\033[31mFAIL\033[0m %s\n' "$*"
  exit 1
}
run() {
  set +e
  OUT=$("$TP" "$@" 2>"$WORK/stderr")
  RC=$?
  set -e
}
expect_rc() {
  [[ $RC == "$1" ]] || {
    tail -40 "$WORK/stderr"
    fatal "$2: exit code $RC, expected $1"
  }
  ok "$2"
}
# GET https://<name>.preview.test<path> through the ingress, as a tailnet device would (self-signed: -k).
https() {
  docker run --rm --network "container:$TS" "$CURL" -sk --max-time 10 \
    --resolve "tp-ingtest-$1.preview.test:${3:-443}:100.64.0.1" "https://tp-ingtest-$1.preview.test:${3:-443}$2"
}
routes() { cat "$TP_HOME/.ingress/routes/tp-ingtest-$1.yml" 2>/dev/null; }
networks() { docker inspect -f '{{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}' "$TS"; }

docker build -q -t tp-fake-tailscale:test "$REPO/test/fake-tailscale" >/dev/null
docker pull -q "$CURL" >/dev/null
# A variant with an extra port, next to the example's configuration so that ../compose.yaml resolves.
ports=$REPO/example/.tp-ingtest-ports
rm -rf "$ports" && cp -R "$REPO/example/.tailnet-preview" "$ports" && echo 'PORTS=8025=app:8080' >>"$ports/config.env"
export TP_CONFIG=$ports
"$TP" build --tag "$TAG" >/dev/null 2>&1

run deploy main --tag "$TAG"
expect_rc 0 "deploy the baseline through the shared ingress"
[[ $OUT == https://tp-ingtest-main.preview.test ]] || fatal "URL under the ingress domain, got $OUT"
ok "the URL is <project>-<env>.<TP_INGRESS_DOMAIN>"
[[ -z $(docker ps -aq --filter name=tp-ingtest-main-ts-1) ]] || fatal "no sidecar in shared mode"
ok "no per-environment sidecar"
grep -q 'environment: main' <<<"$(https main /)" || fatal "HTTPS through Traefik: $(https main /)"
ok "Traefik serves the environment over HTTPS"
grep -q 'environment: main' <<<"$(https main / 8025)" || fatal "PORTS entry through Traefik"
ok "a PORTS entry is routed on its own port"
grep -q '100.64.0.1' <<<"$(docker exec "$TS" nslookup anything.preview.test 100.64.0.1 2>&1)" ||
  fatal "CoreDNS answers the domain: $(docker exec "$TS" nslookup anything.preview.test 100.64.0.1 2>&1)"
ok "CoreDNS answers every name under the domain with the ingress's address"
grep -q 'address: "100.64.0.1:443"' "$TP_HOME/.ingress/traefik/traefik.yml" || fatal "entry point bound to the tailnet address"
ok "Traefik listens on the tailnet address only"

run deploy pr-1 --tag "$TAG"
expect_rc 0 "deploy pr-1, forked"
grep -q 'environment: pr-1' <<<"$(https pr-1 /)" || fatal "pr-1 through the ingress"
grep -q 'environment: main' <<<"$(https main /)" || fatal "the baseline still answers"
ok "each name reaches its own environment"
[[ " $(networks) " == *" tp-ingtest-pr-1_default "* ]] || fatal "ingress connected to pr-1's network: $(networks)"
ok "the ingress joins the environment's network"
grep -q 'shared ingress' <<<"$("$TP" doctor pr-1)" || fatal "doctor reports the ingress"
ok "doctor reports the shared ingress"

run destroy pr-1
expect_rc 0 "destroy pr-1"
[[ -z $(routes pr-1) ]] || fatal "route removed"
[[ " $(networks) " != *" tp-ingtest-pr-1_default "* ]] || fatal "ingress disconnected from pr-1's network"
[[ -z $(docker network ls -q --filter name=tp-ingtest-pr-1_default) ]] || fatal "pr-1's network removed"
ok "destroy removes the route, the connection and the network"

# A host switching from sidecars: the environment loses its sidecar on its next deploy.
TP_INGRESS=sidecar run deploy pr-2 --tag "$TAG"
expect_rc 0 "deploy pr-2 with a sidecar"
[[ -n $(docker ps -q --filter name=tp-ingtest-pr-2-ts-1) ]] || fatal "pr-2 has a sidecar"
run deploy pr-2 --tag "$TAG"
expect_rc 0 "deploy pr-2 again after the switch to the shared ingress"
[[ -z $(docker ps -aq --filter name=tp-ingtest-pr-2-ts-1) ]] || fatal "the sidecar was removed"
grep -q 'environment: pr-2' <<<"$(https pr-2 /)" || fatal "pr-2 through the ingress after the switch"
ok "switching to the shared ingress retires the sidecar"
TP_INGRESS=sidecar run deploy pr-2 --tag "$TAG"
expect_rc 0 "and back to a sidecar"
[[ -z $(routes pr-2) ]] || fatal "route removed when switching back"
ok "switching back removes the route"

printf '\n\033[32m%d checks passed\033[0m\n' "$PASSED"
