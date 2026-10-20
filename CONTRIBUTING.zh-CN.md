# 参与贡献

[English](CONTRIBUTING.md)

感谢帮忙。最有用的是附上 `tailnet-preview doctor <env>` 输出的问题报告（输出里的密钥已隐去）。

## 基本规则

- [docs/design.md](docs/design.zh-CN.md) 是事实来源。改动行为、配置、变量、命令或 action 输入，都要先改这份文档。
- 引擎不引入依赖：只用 Bash、Docker（Compose v2）、git、flock、coreutils。不在主机上增加新工具。
- 不兼容的改动需要升主版本号（[design.md 第 9 节](docs/design.zh-CN.md#9-版本)）。
- 原因能识别的失败要有一个原因码：引擎里写 `fail <code>`，`lib/comment.cjs` 的 `REASONS` 里为每种语言加一条，[docs/troubleshooting.md](docs/troubleshooting.zh-CN.md) 里加一行。有单元测试检查引擎和评论是否一致。

## 开发

需要 Docker、Node.js 22、shellcheck、yq，以及（检查工作流用的）actionlint。

```bash
shellcheck bin/tailnet-preview test/*.sh test/fake-tailscale/tailscale example/app/handler.sh
node --test 'test/*.test.mjs'          # PR 评论的渲染
test/integration.sh                     # 用 Docker 和假的 Tailscale 测试引擎（需要几分钟）
test/action.sh                          # action 的部署判断
npx prettier@3.9.9 --check .
```

集成测试用的是真实的引擎、Docker、PostgreSQL 和 [example](example/)，只有 Tailscale 换成了 [test/fake-tailscale](test/fake-tailscale/)。测试会自己清理，使用的项目名是 `tp-itest` 和 `tp-atest`。

真实的 Tailscale 路径由 [.github/workflows/preview.yml](.github/workflows/preview.yml) 覆盖：本仓库的每个 PR 都会把示例部署到维护者的试用主机上。

## Pull request

- 一个 PR 只做一件事；在描述里说明原因。
- 随改动增加或更新测试。
- 在 [CHANGELOG.md](CHANGELOG.md) 的 "Unreleased" 下更新记录。
- 代码和代码注释用英文。每份文档旁边都有简体中文版（`<文件名>.zh-CN.md`），以英文版为准；改文档时，同一个 PR 里两个版本一起改。

## 发布

1. 用一个 PR 把 `CHANGELOG.md` 里的 "Unreleased" 改名为 `## X.Y.Z - <date>`（在它上方新建一个空的 "Unreleased"），并更新 `README.md`、`README.zh-CN.md`、`docs/project-setup.md`、`docs/design.md` 以及它们的 `.zh-CN.md` 版本里固定的版本号。
2. 合并后，在 `main` 上用版本号 `X.Y.Z` 运行 **Release** 工作流。它会检查 changelog，创建标签 `vX.Y.Z` 和带有这个版本说明的 GitHub release；从 1.0.0 起，还会移动主版本标签 `vX`。
