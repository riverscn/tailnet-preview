// The pull request comment of tailnet-preview: one per PR, found by its marker and updated in place.
// Used from actions/github-script in action.yml. Reasons match docs/troubleshooting.md.
const MARKER = '<!-- tailnet-preview -->'

const TEXT = {
  en: {
    ready: 'Preview environment ready',
    modes: {
      forked: 'copied from the baseline',
      upgraded: 'upgraded in place',
      fresh:
        'created with empty data: there is no baseline to copy (the default branch does not use tailnet-preview yet, or DATA_VOLUMES is empty)',
    },
    app: 'Application',
    port: (port, target) => `Port ${port} (${target})`,
    footer: (version, time) =>
      `${version}updated ${time} UTC. Only devices in the tailnet allowed by its policy can open it; it is removed when the PR closes.`,
    version: (sha) => `Version \`${sha}\`, `,
    limit: (time) =>
      `**No preview environment was created:** the limit of environments was reached (count or host memory). Close PRs you no longer need, then push to this PR to try again. (${time} UTC)`,
    failed: (version, runUrl, time) =>
      `**Preview deployment failed**, ${version}see the [workflow run](${runUrl}). (${time} UTC)`,
    unknown:
      'The cause was not recognized. Look at the failing step and the "diagnostics" step of the run (docs/troubleshooting.md).',
    cause: 'Cause:',
    fix: 'Fix:',
    destroyed: (time) => `Preview environment removed. (${time} UTC)`,
    rerun: 'Then re-run the failed jobs from the Checks tab of this PR, or push a new commit.',
    reasons: {
      config: {
        cause: 'the project configuration (`.tailnet-preview/`) is invalid',
        steps: ['Fix the problem named in the detail above (docs/design.md section 5) and push.'],
      },
      registry: {
        cause: 'the preview host could not pull an image from the registry (connection reset or timed out)',
        steps: [
          'Give Docker on the host a proxy (`HTTPS_PROXY` for the docker systemd service) or a registry mirror (`registry-mirrors` in `/etc/docker/daemon.json`), see docs/host-setup.md.',
          'Check with `docker pull <image from the log>` on the host. Pulled images stay on the host.',
        ],
        rerun: true,
      },
      build: {
        cause: 'building an image on the preview host failed',
        steps: [
          'Read the "build" step of the run: a failed base image pull is a registry problem (see above); a compile error needs a code fix.',
        ],
        rerun: true,
      },
      ts_secret: {
        cause: 'the preview host has no Tailscale OAuth client secret',
        steps: [
          'Create an OAuth client in the Tailscale admin console (Settings → Trust credentials; scope Auth Keys: write; tag `tag:preview`).',
          'Put `TS_OAUTH_SECRET=tskey-client-…` into `~/.config/tailnet-preview/env` on the host (mode 600), or set the repository secret `TS_OAUTH_SECRET`.',
        ],
        rerun: true,
      },
      ts_login: {
        cause: 'the Tailscale sidecar of the environment did not log in to the tailnet',
        steps: [
          'Run `docker logs <project>-<env>-ts-1` on the host. Common causes: the OAuth secret was revoked, or `tag:preview` is missing from `tagOwners` in the tailnet policy.',
        ],
        rerun: true,
      },
      https: {
        cause:
          'the environment is deployed, but the tailnet does not issue HTTPS certificates, so browsers fail the TLS handshake',
        steps: [
          'In the Tailscale admin console, open DNS, enable MagicDNS, and under HTTPS Certificates choose Enable HTTPS.',
          'Restart the sidecar on the host: `tailnet-preview compose <env> restart ts`. The first visit takes a few seconds while the certificate is issued.',
        ],
        rerun: true,
      },
      cert: {
        cause:
          "the environment is deployed, but Let's Encrypt did not issue its HTTPS certificate, so browsers fail the TLS handshake",
        steps: [
          "`Incorrect TXT record`: Tailscale's DNS validation record had not reached public DNS when Let's Encrypt checked. `rateLimited`: five validations of this name failed within an hour; wait until the time it gives.",
          'Do not open the address meanwhile: every visit starts another validation. Then request the certificate once on the host: `tailnet-preview compose <env> exec ts tailscale cert <host name of the address>`.',
        ],
        rerun: true,
      },
      fork: {
        cause: 'copying the data volumes of the baseline into this environment failed',
        steps: [
          'Check that every name in `DATA_VOLUMES` (config.env) is a volume declared in `compose.yaml`, and that the baseline is healthy: `tailnet-preview doctor main`.',
        ],
        rerun: true,
      },
      migrate: {
        cause: 'the migrate task failed',
        steps: [
          'Read the migrate output in the run and fix the migration.',
          'If this PR changed a migration that already ran in its environment (migrations only move forward), reset the environment: `tailnet-preview reset pr-<number>`.',
        ],
      },
      seed: {
        cause: 'the seed task failed',
        steps: ['Read the seed output in the run, fix it and push.'],
      },
      health: {
        cause: 'the services started, but the health check did not pass within two minutes',
        steps: [
          'Read the service logs printed by the run and the "diagnostics" step; usually the application fails at startup.',
        ],
      },
    },
  },
  'zh-CN': {
    ready: '试用环境已就绪',
    modes: {
      forked: '从基线复制',
      upgraded: '原地升级',
      fresh: '从空数据创建：没有基线可复制（默认分支还没接入 tailnet-preview，或没有设置 DATA_VOLUMES）',
    },
    app: '应用',
    port: (port, target) => `端口 ${port}（${target}）`,
    footer: (version, time) =>
      `${version}更新于 ${time}（UTC）。只有 tailnet 策略允许的设备能访问；PR 关闭后环境自动删除。`,
    version: (sha) => `版本 \`${sha}\`，`,
    limit: (time) =>
      `**没有创建试用环境**：环境数量或主机内存已达上限。关闭不再需要的 PR 后，往这个 PR 推送新提交即可重试。（${time} UTC）`,
    failed: (version, runUrl, time) => `**试用环境部署失败**，${version}见[工作流日志](${runUrl})。（${time} UTC）`,
    unknown: '没有识别出原因，看工作流日志里出错的一步和"diagnostics"一步（docs/troubleshooting.md）。',
    cause: '原因：',
    fix: '处理：',
    destroyed: (time) => `试用环境已删除。（${time} UTC）`,
    rerun: '处理后在这个 PR 的 Checks 页面点 Re-run failed jobs，或推送新提交。',
    reasons: {
      config: {
        cause: '项目配置（`.tailnet-preview/`）有误',
        steps: ['按上面说明修正（docs/design.md 第 5 节）后推送。'],
      },
      registry: {
        cause: '试用主机从镜像仓库拉取镜像失败（连接被重置或超时）',
        steps: [
          '给主机上的 Docker 配置代理（docker systemd 服务的 `HTTPS_PROXY`）或镜像加速（`/etc/docker/daemon.json` 的 `registry-mirrors`），见 docs/host-setup.md。',
          '在主机上执行 `docker pull <日志里的镜像名>` 确认能拉下来；拉下来的镜像会留在主机上。',
        ],
        rerun: true,
      },
      build: {
        cause: '在试用主机上构建镜像失败',
        steps: ['看工作流日志里的 build 一步：拉取基础镜像失败按上面镜像仓库的办法处理；编译错误则修复代码后推送。'],
        rerun: true,
      },
      ts_secret: {
        cause: '试用主机上没有 Tailscale OAuth 密钥',
        steps: [
          '在 Tailscale 管理后台 Settings → Trust credentials 创建 OAuth 客户端（Auth Keys 写入，标签 `tag:preview`）。',
          '把 `TS_OAUTH_SECRET=tskey-client-…` 写到主机的 `~/.config/tailnet-preview/env`（权限 600），或设为仓库的 Actions secret `TS_OAUTH_SECRET`。',
        ],
        rerun: true,
      },
      ts_login: {
        cause: '试用环境的 Tailscale sidecar 没有登录 tailnet',
        steps: [
          '在主机上看 `docker logs <项目>-<环境>-ts-1`：常见原因是 OAuth 密钥被吊销，或 tailnet 策略的 `tagOwners` 里没有 `tag:preview`。',
        ],
        rerun: true,
      },
      https: {
        cause: '环境已部署，但 tailnet 没有开启 HTTPS 证书，浏览器连上后 TLS 握手会失败',
        steps: [
          '在 Tailscale 管理后台 DNS 页面开启 MagicDNS，并在 HTTPS Certificates 处点 Enable HTTPS。',
          '在主机上重启 sidecar：`tailnet-preview compose <环境> restart ts`；第一次访问时签发证书要几秒。',
        ],
        rerun: true,
      },
      cert: {
        cause: "环境已部署，但 Let's Encrypt 没有签发它的 HTTPS 证书，浏览器连上后 TLS 握手会失败",
        steps: [
          "`Incorrect TXT record`：Let's Encrypt 检查时，Tailscale 写入的 DNS 验证记录还没传到公网 DNS。`rateLimited`：这个名字一小时内验证失败了 5 次，等到它给出的时间。",
          '这期间不要打开这个地址，每次访问都会再发起一次验证。之后在主机上手动申请一次：`tailnet-preview compose <环境> exec ts tailscale cert <地址里的主机名>`。',
        ],
        rerun: true,
      },
      fork: {
        cause: '把基线的数据卷复制到这个环境时失败',
        steps: [
          '确认 config.env 里 `DATA_VOLUMES` 的每个名字都是 `compose.yaml` 里声明的 volume，并检查基线是否正常：`tailnet-preview doctor main`。',
        ],
        rerun: true,
      },
      migrate: {
        cause: '迁移任务失败',
        steps: [
          '看工作流日志里的迁移输出，修复迁移。',
          '如果这个 PR 修改了环境里已经执行过的迁移（迁移只能前进），重置环境：`tailnet-preview reset pr-<编号>`。',
        ],
      },
      seed: {
        cause: '演示数据任务失败',
        steps: ['看工作流日志里 seed 的输出，修复后推送。'],
      },
      health: {
        cause: '服务已启动，但两分钟内没有通过健康检查',
        steps: ['看工作流日志里打印的服务日志和"diagnostics"一步，通常是应用启动时报错。'],
      },
    },
  },
}

function utcTime() {
  return new Date().toISOString().slice(0, 16).replace('T', ' ')
}

/**
 * Comment body. kind: ready | limit | failed | destroyed.
 * data: { language, url, sha, mode, ports, extra, runUrl, reason, detail }
 * ports: the PORTS value of config.env, e.g. "8025=mailpit:8025".
 */
function render(kind, data = {}) {
  const t = TEXT[data.language] ?? TEXT.en
  const time = utcTime()
  const version = data.sha ? t.version(data.sha.slice(0, 7)) : ''
  switch (kind) {
    case 'ready': {
      const rows = [`| ${t.app} | ${data.url} |`]
      for (const entry of (data.ports ?? '').split(/\s+/).filter(Boolean)) {
        const [port, target] = entry.split('=')
        rows.push(`| ${t.port(port, target)} | ${data.url}:${port} |`)
      }
      return [
        `**${t.ready}** (${t.modes[data.mode] ?? data.mode})`,
        '',
        '| | |',
        '|---|---|',
        ...rows,
        ...(data.extra?.trim() ? ['', data.extra.trim()] : []),
        '',
        t.footer(version, time),
      ].join('\n')
    }
    case 'limit':
      return t.limit(time)
    case 'failed': {
      const head = t.failed(version, data.runUrl, time)
      const reason = t.reasons[data.reason]
      if (!reason) return [head, '', t.unknown].join('\n')
      const steps = reason.rerun ? [...reason.steps, t.rerun] : reason.steps
      return [
        head,
        '',
        `**${t.cause}** ${reason.cause}${data.detail ? ` (${data.detail})` : ''}`,
        '',
        `**${t.fix}**`,
        ...steps.map((step, i) => `${i + 1}. ${step}`),
      ].join('\n')
    }
    case 'destroyed':
      return t.destroyed(time)
    default:
      throw new Error(`unknown comment kind: ${kind}`)
  }
}

/** Create or update this PR's tailnet-preview comment. */
async function upsert({ github, context, issueNumber, body }) {
  const { owner, repo } = context.repo
  const comments = await github.paginate(github.rest.issues.listComments, {
    owner,
    repo,
    issue_number: issueNumber,
    per_page: 100,
  })
  const existing = comments.find((c) => c.body?.includes(MARKER))
  const text = `${MARKER}\n${body}`
  if (existing) {
    await github.rest.issues.updateComment({ owner, repo, comment_id: existing.id, body: text })
  } else {
    await github.rest.issues.createComment({ owner, repo, issue_number: issueNumber, body: text })
  }
}

module.exports = { render, upsert, TEXT, MARKER }
