# 安全模型

[English](security.md)

tailnet-preview 会在你自己的机器上运行 PR 里的代码。启用之前，先弄清楚这意味着什么。

## 你信任了谁

- **所有能向仓库推送的人。** 部署 PR 就是构建并运行它的代码，而 runner 用户在 `docker` 组里，相当于主机的 root。所以任何能推送分支的人，都能在主机上执行命令。推送权限受控的私有仓库可以接受这一点，其他情况不行。
- **主机上的每个项目。** 项目之间只靠命名区分，并没有隔离：有一个项目的推送权限，就足以影响同一主机上其他项目的环境。只在所有者相同的项目之间共用主机。
- **你构建和拉取的镜像，** 包括你配置的镜像加速。

## 项目怎样缩小暴露面

- **来自 fork 的 PR 一律不部署。** 文档里的工作流会跳过它们（job 条件比较 head 仓库和 base 仓库）；即使工作流里没有这个条件，action 也会拒绝部署。但这个条件还是要保留：有了它，job 根本不会落到 runner 上。这两道防线都只对 fork 改不了的工作流有效，而公开仓库不是这样（见下一节）。
- **没有公网入口。** 环境只能经 tailnet 访问，主机的网络上没有任何监听。服务不得发布端口。
- **最小权限的 Tailscale 凭据。** OAuth 客户端只能为 `tag:preview` 创建 auth key。推荐的访问策略让你自己的设备能访问试用节点，而试用节点不能访问任何别的东西。PR 节点是临时节点（ephemeral）。
- **密钥留在主机上。** 生成的密钥（`~/previews/<project>/secrets.env`）和每个环境的 `compose.env` 权限都是 600。诊断输出会隐去 OAuth 密钥。
- **配置只解析，不执行。** `config.env` 按数据读取；但要注意，PR 里的 compose 文件、SQL 钩子和 Dockerfile 按设计是会被执行的。

## 公开仓库

在公开仓库里，来自 fork 的 PR 运行的是**被这个 PR 改过的**工作流。fork 可以删掉 job 条件、不再调用 action，在任何指向 self-hosted runner 的 job 里运行任意命令，也就是在你的主机上，以相当于 root 的用户运行。job 条件和 action 都拦不住。GitHub 自己的建议是，公开仓库不要用 self-hosted runner。

如果仓库必须公开：

- 在 **Settings → Actions → General → Approval for running fork pull request workflows from contributors**（来自 fork 的 PR 运行工作流前是否需要批准）下，选择 **Require approval for all external contributors**（所有外部贡献者都需要批准），并在批准运行前读一遍 fork 对工作流的改动。默认设置只要求首次贡献者经过批准。
- 更好的做法：根本不让公开仓库用到这个 runner。从私有仓库部署（仓库的私有镜像（mirror），或单独存放部署配置的仓库）；在组织里，也可以把 runner 放进一个不允许公开仓库使用的 runner group。
- 上面的措施到位之前，不要设置 `PREVIEW_ENABLED`；fork 照样能改工作流，所以单靠这个变量起不到保护作用。

tailnet-preview 自己的仓库也用同样的方式在每个 PR 上部署示例，遵守同样的规则。

## 建议

- 用一台专用虚拟机做试用主机，上面不放其他有价值的东西。
- 不要把真实的生产数据复制进试用环境。用种子数据和脱敏的测试数据。
- 凡是会发消息或动钱的服务，都用模拟服务代替。
- 设置 `PREVIEW_ENABLED` 之前，先检查谁有推送权限。

## 报告漏洞

见 [SECURITY.md](../SECURITY.zh-CN.md)。
