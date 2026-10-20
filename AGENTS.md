# Instructions for AI agents

简体中文见下文。

**Setting up previews for someone's project?** Follow [docs/agent-guide.md](docs/agent-guide.md). It says
which steps the person must do, which you do, and how you check each one. Never ask for secrets in the
chat.

**Changing tailnet-preview itself?** Read [CONTRIBUTING.md](CONTRIBUTING.md) first. In short:

- [docs/design.md](docs/design.md) is the source of truth: change it before the behaviour.
- Every document has a Simplified Chinese version (`<name>.zh-CN.md`); change both in the same pull
  request.
- The engine (`bin/tailnet-preview`) stays Bash with Docker, git, flock and coreutils, nothing else.
- Before a pull request: shellcheck, `node --test 'test/*.test.mjs'`, `test/integration.sh`,
  `test/ingress.sh`, `test/action.sh` and `npx prettier@3.9.9 --check .` pass (CONTRIBUTING.md has the
  exact commands).

## 简体中文

**要为别人的项目接入试用环境？** 按 [docs/agent-guide.zh-CN.md](docs/agent-guide.zh-CN.md) 来做。它写明哪些步骤必须由人来做、哪些由你做，以及每一步怎么检查。永远不要在聊天里索要密钥。

**要修改 tailnet-preview 本身？** 先读 [CONTRIBUTING.zh-CN.md](CONTRIBUTING.zh-CN.md)。简要地说：

- [docs/design.md](docs/design.zh-CN.md) 是事实来源：先改它，再改行为。
- 每份文档都有简体中文版（`<文件名>.zh-CN.md`）；同一个 PR 里两个版本一起改。
- 引擎（`bin/tailnet-preview`）只用 Bash、Docker、git、flock 和 coreutils，不引入别的工具。
- 开 PR 之前：shellcheck、`node --test 'test/*.test.mjs'`、`test/integration.sh`、`test/ingress.sh`、`test/action.sh` 和 `npx prettier@3.9.9 --check .` 都要通过（具体命令见 CONTRIBUTING）。
