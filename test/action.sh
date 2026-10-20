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
    TP=$TP TP_SOURCE=$WORK/project TP_CONFIG=$WORK/project/.tailnet-preview TP_FAILURE_FILE=$WORK/failure TP_NOTICE_FILE=$WORK/notice \
      CONFIG_REL=.tailnet-preview ENV_NAME=$1 BASE_REF=main RUNNER_TEMP=$WORK \
      GITHUB_OUTPUT=$out GITHUB_STEP_SUMMARY=$WORK/summary bash --noprofile --norc -eo pipefail "$STEP"
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
build() {
  TP_SOURCE=$WORK/project "$TP" build >"$WORK/log" 2>&1 || {
    tail -30 "$WORK/log"
    fatal "build"
  }
}
notes() { TP_SOURCE=$WORK/project "$TP" compose "$1" exec -T app psql -Atq -F ' ' -c 'SELECT env, body FROM notes ORDER BY id'; }

# The environment step: which environment for which event, what is skipped, and never a deploy of a fork's
# pull request. Variables of the event come from the arguments (VAR=value ...).
yq -r '.runs.steps[] | select(.id == "env") | .run' "$REPO/action.yml" >"$WORK/env-step.sh"
env_step() {
  : >"$WORK/env-output"
  : >"$WORK/summary"
  env TP="$TP" TP_PROJECT=app TP_HOST_CONFIG="$WORK/no-host-config" COMMAND=deploy EVENT=pull_request PR=5 \
    HEAD_REPO=me/app DRAFT=false DRAFTS=true BRANCHES='' BRANCH_PR='' DELETED_REF='' DELETED_TYPE='' \
    GITHUB_REPOSITORY=me/app DEFAULT_BRANCH=main GITHUB_REF=refs/pull/5/merge "$@" \
    GITHUB_OUTPUT="$WORK/env-output" GITHUB_STEP_SUMMARY="$WORK/summary" \
    bash --noprofile --norc -eo pipefail "$WORK/env-step.sh" >"$WORK/log" 2>&1
}
# expect_env NAME|skip DESCRIPTION VAR=value...
expect_env() {
  local want=$1 what=$2
  shift 2
  env_step "$@" || fatal "$what: the step failed: $(cat "$WORK/log")"
  if [[ $want == skip ]]; then
    grep -qx 'skip=true' "$WORK/env-output" || fatal "$what: not skipped: $(cat "$WORK/env-output")"
    grep -q 'No preview environment' "$WORK/summary" || fatal "$what: the summary does not say why"
  else
    [[ $(cat "$WORK/env-output") == "name=$want" ]] || fatal "$what: expected $want, got $(cat "$WORK/env-output")"
  fi
}
expect_env pr-5 "a PR from the repository"
if env_step HEAD_REPO=someone/app; then fatal "deploy of a fork's PR was not refused"; fi
grep -q 'does not deploy pull requests from forks' "$WORK/log" || fatal "refusal names the reason: $(cat "$WORK/log")"
expect_env pr-5 "destroy of a fork's PR (nothing of its code runs)" COMMAND=destroy HEAD_REPO=someone/app
ok "the action refuses to deploy a fork's pull request"
expect_env pr-5 "a draft PR, drafts: true" DRAFT=true
expect_env skip "a draft PR, drafts: false" DRAFT=true DRAFTS=false
expect_env pr-5 "destroy of a draft PR, drafts: false" COMMAND=destroy DRAFT=true DRAFTS=false
ok "draft pull requests are skipped only with drafts: false"
push=(EVENT=push PR= GITHUB_REF=refs/heads/feature/Login)
expect_env main "a push to the default branch" EVENT=push PR= GITHUB_REF=refs/heads/main
expect_env skip "a branch push, branches off" "${push[@]}"
expect_env skip "a branch push that does not match" "${push[@]}" BRANCHES='release/*'
expect_env br-feature-login "a branch push that matches" "${push[@]}" BRANCHES='release/*, feature/*'
expect_env br-feature-login "a branch push, every branch" "${push[@]}" BRANCHES='*'
expect_env skip "a branch push of a branch with an open PR" "${push[@]}" BRANCHES='*' BRANCH_PR=7
expect_env br-feature-login "destroy after the branch is deleted" COMMAND=destroy EVENT=delete PR= \
  GITHUB_REF=refs/heads/main DELETED_REF=feature/Login DELETED_TYPE=branch
ok "branch pushes get br-<branch> environments when branches matches and there is no PR"

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
# The project's own compose file sits at its root here, which is where ../compose.yaml points.
cp "$REPO/example/compose.yaml" compose.yaml
git add . && git commit -qm 'adopt tailnet-preview'

build
deploy_step pr-1
[[ $MODE == fresh ]] || fatal "first PR: mode $MODE, expected fresh"
[[ $(notes pr-1) == "pr-1 seeded" ]] || fatal "first PR is seeded"
ok "adopting PR: base branch without configuration -> fresh"

deploy_step pr-1
[[ $MODE == upgraded ]] || fatal "second deploy: mode $MODE, expected upgraded"
ok "same PR again -> upgraded"

# Merge it; the push to main creates the baseline.
git checkout -q main && git merge -q --ff-only adopt && git push -q origin main
build
deploy_step main
[[ $(notes main) == "main seeded" ]] || fatal "baseline seeded"
ok "push to main -> baseline"

git checkout -qb feature && echo change >>README.md && git commit -qam change
build
deploy_step pr-2
[[ $MODE == forked && $(notes pr-2) == "main seeded" ]] || fatal "next PR: mode $MODE, notes $(notes pr-2)"
ok "next PR -> forked from the baseline"

# No baseline, but main uses tailnet-preview: the step builds main and initializes the baseline first.
TP_SOURCE=$WORK/project "$TP" destroy main --force >/dev/null 2>&1
deploy_step pr-3
[[ $MODE == forked && $(notes pr-3) == "main seeded" ]] || fatal "baseline from base: mode $MODE, notes $(notes pr-3)"
[[ -f $TP_HOME/tp-atest/envs/main/initialized ]] || fatal "baseline was not initialized"
grep -q tailnet-preview-base <<<"$(git worktree list)" && fatal "base worktree left behind"
ok "PR without baseline -> baseline initialized from main, then forked"

printf '\n\033[32maction checks passed\033[0m\n'
