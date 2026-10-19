#!/usr/bin/env bash
# Tests the decision logic of the action's deploy step (upgrade, fork, initialize the baseline from the
# base branch, or fresh) by running the step's script from action.yml against a throwaway git repository
# that adopts tailnet-preview the way a real project would. Needs Docker and yq. Usage: test/action.sh
set -euo pipefail

REPO=$(cd "$(dirname "$0")/.." && pwd)
WORK=$(mktemp -d)
export TP_HOME=$WORK/home TP_PROJECT=tp-atest TS_OAUTH_SECRET=tskey-client-fake TP_TS_IMAGE=tp-fake-tailscale:test
export TP_HOST_CONFIG=$WORK/no-host-config TP_RETRY_DELAY=1
TP=$REPO/bin/tailnet-preview
STEP=$WORK/deploy-step.sh
yq -r '.runs.steps[] | select(.id == "deploy") | .run' "$REPO/action.yml" >"$STEP"

cleanup() {
  local env
  for env in "$TP_HOME"/tp-atest/envs/*; do
    if [[ -d $env ]]; then TP_SOURCE=$WORK/project "$TP" destroy "$(basename "$env")" --force >/dev/null 2>&1 || true; fi
  done
  docker images --filter label=tailnet-preview.project=tp-atest -q | xargs -r docker rmi -f >/dev/null 2>&1 || true
  rm -rf "$WORK"
}
trap cleanup EXIT

ok() { printf '\033[32mok\033[0m %s\n' "$*"; }
fatal() {
  printf '\033[31mFAIL\033[0m %s\n' "$*"
  exit 1
}

# Run the deploy step for ENV with BASE_REF=main from the project checkout; sets CODE and MODE.
deploy_step() {
  local out=$WORK/github-output
  : >"$out"
  (
    cd "$WORK/project"
    TP=$TP TP_SOURCE=$WORK/project TP_CONFIG=$WORK/project/.tailnet-preview TP_FAILURE_FILE=$WORK/failure \
      CONFIG_REL=.tailnet-preview ENV_NAME=$1 BASE_REF=main RUNNER_TEMP=$WORK \
      GITHUB_OUTPUT=$out GITHUB_STEP_SUMMARY=$WORK/summary bash "$STEP"
  ) >"$WORK/log" 2>&1 || {
    tail -30 "$WORK/log"
    fatal "deploy step of $1 exited non-zero"
  }
  CODE=$(sed -n 's/^code=//p' "$out")
  MODE=$(sed -n 's/^mode=//p' "$out")
  [[ $CODE == 0 ]] || {
    tail -30 "$WORK/log"
    fatal "deploy of $1: code $CODE"
  }
}
notes() { TP_SOURCE=$WORK/project "$TP" compose "$1" exec -T app psql -Atq -F ' ' -c 'SELECT env, body FROM notes ORDER BY id'; }

docker build -q -t tp-fake-tailscale:test "$REPO/test/fake-tailscale" >/dev/null

# A project whose main branch does not use tailnet-preview yet, with a bare "origin".
git init -q -b main "$WORK/project"
cd "$WORK/project"
git config user.email test@example.com && git config user.name test
echo '# project' >README.md && git add . && git commit -qm init
git clone -q --bare . "$WORK/origin.git" && git remote add origin "$WORK/origin.git" && git fetch -q origin

# The PR that adopts tailnet-preview: the example project's files.
git checkout -qb adopt
mkdir -p example && cp -R "$REPO/example/app" "$REPO/example/Dockerfile" example/
cp -R "$REPO/example/.tailnet-preview" .tailnet-preview
git add . && git commit -qm 'adopt tailnet-preview'

TP_SOURCE=$WORK/project "$TP" build >/dev/null 2>&1
deploy_step pr-1
[[ $MODE == fresh ]] || fatal "first PR: mode $MODE, expected fresh"
[[ $(notes pr-1) == "pr-1 seeded" ]] || fatal "first PR is seeded"
ok "adopting PR: base branch without configuration -> fresh"

deploy_step pr-1
[[ $MODE == upgraded ]] || fatal "second deploy: mode $MODE, expected upgraded"
ok "same PR again -> upgraded"

# Merge it; the push to main creates the baseline.
git checkout -q main && git merge -q --ff-only adopt && git push -q origin main
TP_SOURCE=$WORK/project "$TP" build >/dev/null 2>&1
deploy_step main
[[ $(notes main) == "main seeded" ]] || fatal "baseline seeded"
ok "push to main -> baseline"

git checkout -qb feature && echo change >>README.md && git commit -qam change
TP_SOURCE=$WORK/project "$TP" build >/dev/null 2>&1
deploy_step pr-2
[[ $MODE == forked && $(notes pr-2) == "main seeded" ]] || fatal "next PR: mode $MODE, notes $(notes pr-2)"
ok "next PR -> forked from the baseline"

# No baseline, but main uses tailnet-preview: the step builds main and initializes the baseline first.
TP_SOURCE=$WORK/project "$TP" destroy main --force >/dev/null 2>&1
deploy_step pr-3
[[ $MODE == forked && $(notes pr-3) == "main seeded" ]] || fatal "baseline from base: mode $MODE, notes $(notes pr-3)"
[[ -f $TP_HOME/tp-atest/envs/main/initialized ]] || fatal "baseline was not initialized"
git worktree list | grep -q tailnet-preview-base && fatal "base worktree left behind"
ok "PR without baseline -> baseline initialized from main, then forked"

printf '\n\033[32maction checks passed\033[0m\n'
