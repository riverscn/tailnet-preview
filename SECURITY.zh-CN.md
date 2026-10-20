# 安全策略

[English](SECURITY.md)

## 报告漏洞

请不要开公开的 issue。请用 GitHub 的私密漏洞报告：本仓库的 **Security** 标签页 → **Report a vulnerability**（报告漏洞）。一周内会有答复。

## 范围

tailnet-preview 按设计就会在试用主机上运行 PR 的代码；有推送权限的人能做到这一点，是文档写明的行为，不是漏洞。安全模型见 [docs/security.md](docs/security.zh-CN.md)。属于范围内的例如：密钥泄露到日志或 PR 评论里，环境能在 tailnet 之外被访问，文档里的工作流部署了来自 fork 的 PR，或者一个环境能通过引擎读到另一个环境的数据。

## 支持的版本

最新的发布版本。版本还是 0.x 时，修复只以新的 0.y.z 发布，不向旧版本回移。
