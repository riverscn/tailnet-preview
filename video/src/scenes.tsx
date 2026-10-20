import { Img, interpolate, staticFile, useCurrentFrame } from 'remotion'
import { color, font } from './theme'
import { Card, Rise, Scene, Typed, useEnter } from './ui'

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const

export const Intro = () => {
  const p = useEnter(0, 12)
  return (
    <Scene>
      <Img
        src={staticFile('icon.svg')}
        style={{ width: 220, height: 220, transform: `scale(${p}) rotate(${(1 - p) * -20}deg)` }}
      />
      <Rise delay={10}>
        <div style={{ fontSize: 120, fontWeight: 800, letterSpacing: -3, marginTop: 36 }}>tailnet-preview</div>
      </Rise>
      <Rise delay={22}>
        <div style={{ fontSize: 40, color: color.muted, marginTop: 8 }}>
          Per-PR preview environments on your own host
        </div>
      </Rise>
    </Scene>
  )
}

export const Problem = () => {
  const frame = useCurrentFrame()
  const strike = interpolate(frame, [60, 80], [0, 100], clamp)
  return (
    <Scene>
      <Rise>
        <div style={{ fontSize: 64, fontWeight: 800, textAlign: 'center', lineHeight: 1.25 }}>
          Reviewing a pull request?
          <br />
          <span style={{ color: color.accent }}>See it running.</span>
        </div>
      </Rise>
      <div style={{ display: 'flex', gap: 32, marginTop: 64 }}>
        {['Read the diff', 'Pull the branch', 'Set up a database'].map((t, i) => (
          <Rise key={t} delay={20 + i * 8}>
            <Card style={{ padding: '24px 36px', fontSize: 36, color: color.muted, position: 'relative' }}>
              {t}
              <div
                style={{
                  position: 'absolute',
                  left: 28,
                  top: '50%',
                  height: 4,
                  width: `calc(${strike}% - 56px * ${strike / 100})`,
                  background: '#f87171',
                }}
              />
            </Card>
          </Rise>
        ))}
      </div>
    </Scene>
  )
}

const steps = ['build images', 'copy the baseline’s data', 'run the PR’s migrations', 'start']

export const Flow = () => {
  const frame = useCurrentFrame()
  const line = (from: number) => interpolate(frame, [from, from + 20], [0, 1], clamp)
  const url = 'https://myapp-pr-42.your-tailnet.ts.net'
  return (
    <Scene>
      <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
        <Rise>
          <Card style={{ width: 380, textAlign: 'center' }}>
            <div style={{ fontSize: 26, color: color.muted }}>GitHub</div>
            <div style={{ fontSize: 44, fontWeight: 800, marginTop: 8 }}>Pull request</div>
            <div style={{ fontSize: 34, color: color.accent, fontFamily: font.mono, marginTop: 8 }}>#42</div>
          </Card>
        </Rise>
        <Arrow progress={line(20)} />
        <Rise delay={35}>
          <Card style={{ width: 640 }}>
            <div style={{ fontSize: 26, color: color.muted }}>Your machine · self-hosted runner</div>
            <div style={{ fontSize: 44, fontWeight: 800, marginTop: 8 }}>GitHub Actions</div>
            <div style={{ marginTop: 20 }}>
              {steps.map((s, i) => {
                const done = frame > 70 + i * 22
                const p = interpolate(frame, [55 + i * 22, 70 + i * 22], [0, 1], clamp)
                return (
                  <div
                    key={s}
                    style={{ opacity: p, fontSize: 32, fontFamily: font.mono, display: 'flex', gap: 16, marginTop: 8 }}
                  >
                    <span style={{ color: done ? color.green : color.muted, width: 32 }}>{done ? '✓' : '…'}</span>
                    {s}
                  </div>
                )
              })}
            </div>
          </Card>
        </Rise>
      </div>
      <Arrow progress={line(160)} vertical />
      <Rise delay={175}>
        <Card style={{ fontFamily: font.mono, fontSize: 44, padding: '28px 44px', borderColor: color.accent }}>
          <span style={{ color: color.green }}>🔒 </span>
          <Typed text={url} delay={185} speed={1.5} />
        </Card>
      </Rise>
      <Rise delay={225}>
        <div style={{ fontSize: 30, color: color.muted, marginTop: 20 }}>
          private to your tailnet · nothing on the internet
        </div>
      </Rise>
    </Scene>
  )
}

const Arrow = ({ progress, vertical }: { progress: number; vertical?: boolean }) => {
  const len = vertical ? 70 : 120
  return (
    <div
      style={{
        width: vertical ? 6 : len,
        height: vertical ? len : 6,
        position: 'relative',
        margin: vertical ? '16px 0' : '0 24px',
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: vertical ? 6 : `${progress * 100}%`,
          height: vertical ? `${progress * 100}%` : 6,
          background: color.accent,
          borderRadius: 3,
        }}
      />
    </div>
  )
}

export const Comment = () => {
  const card = useEnter(10, 14)
  const frame = useCurrentFrame()
  const row = interpolate(frame, [40, 55], [0, 1], clamp)
  return (
    <Scene>
      <div
        style={{
          width: 1180,
          opacity: card,
          transform: `translateY(${(1 - card) * 80}px) scale(${0.94 + card * 0.06})`,
          background: '#0d1117',
          border: '1px solid #30363d',
          borderRadius: 20,
          overflow: 'hidden',
          boxShadow: '0 40px 100px rgba(0,0,0,0.5)',
        }}
      >
        <div
          style={{
            background: '#161b22',
            borderBottom: '1px solid #30363d',
            padding: '20px 32px',
            fontSize: 28,
            color: '#8b949e',
            display: 'flex',
            alignItems: 'center',
            gap: 16,
          }}
        >
          <div style={{ width: 44, height: 44, borderRadius: 22, background: color.accentDeep }} />
          <b style={{ color: '#e6edf3' }}>github-actions</b> commented
        </div>
        <div style={{ padding: '32px 40px', fontSize: 34, color: '#e6edf3' }}>
          <div>
            <b>Preview environment ready</b> <span style={{ color: '#8b949e' }}>(copied from the baseline)</span>
          </div>
          <div style={{ marginTop: 28, border: '1px solid #30363d', borderRadius: 10, overflow: 'hidden' }}>
            <div style={{ display: 'flex', background: '#161b22', fontWeight: 700 }}>
              <div style={{ width: 300, padding: '14px 24px' }}>Service</div>
              <div style={{ padding: '14px 24px' }}>Address</div>
            </div>
            <div style={{ display: 'flex', borderTop: '1px solid #30363d', opacity: row }}>
              <div style={{ width: 300, padding: '14px 24px' }}>Application</div>
              <div style={{ padding: '14px 24px', color: '#4493f8', fontFamily: font.mono, fontSize: 30 }}>
                https://myapp-pr-42.your-tailnet.ts.net
              </div>
            </div>
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 24, marginTop: 48 }}>
        {[
          ['push', 'updates it'],
          ['close', 'removes it'],
        ].map(([a, b], i) => (
          <Rise key={a} delay={70 + i * 12}>
            <Card style={{ padding: '18px 32px', fontSize: 32 }}>
              <span style={{ color: color.accent, fontWeight: 700 }}>{a}</span> → {b}
            </Card>
          </Rise>
        ))}
      </div>
    </Scene>
  )
}

const features = [
  ['Realistic upgrades', '贴近真实的升级', 'Real (demo) data + the PR’s own migrations'],
  ['Private', '私有', 'No public port, tunnel or login page'],
  ['Cheap', '便宜', 'Any Linux box with Docker. One machine, many projects'],
  ['Any stack', '不挑技术栈', 'Bash and Docker Compose. Your compose file stays as it is'],
]

export const Features = () => (
  <Scene>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 32, width: 1500 }}>
      {features.map(([en, zh, body], i) => (
        <Rise key={en} delay={i * 30}>
          <Card style={{ height: 230 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 20, whiteSpace: 'nowrap' }}>
              <span style={{ fontSize: 48, fontWeight: 800, color: color.accent }}>{en}</span>
              <span style={{ fontSize: 32, color: color.accentStrong }}>{zh}</span>
            </div>
            <div style={{ fontSize: 32, color: color.muted, marginTop: 16, lineHeight: 1.4 }}>{body}</div>
          </Card>
        </Rise>
      ))}
    </div>
  </Scene>
)

const prompt =
  'Set up tailnet-preview (https://github.com/riverscn/tailnet-preview) for this project, so every pull request gets its own preview environment on my machine. Follow its docs/agent-guide.md.'

export const Agent = () => (
  <Scene>
    <Rise>
      <div style={{ fontSize: 60, fontWeight: 800 }}>Using an AI coding agent?</div>
    </Rise>
    <Rise delay={12}>
      <div
        style={{
          width: 1400,
          marginTop: 40,
          background: color.code,
          border: `1px solid ${color.border}`,
          borderRadius: 20,
          padding: '36px 44px',
          fontFamily: font.mono,
          fontSize: 34,
          lineHeight: 1.55,
          minHeight: 260,
        }}
      >
        <span style={{ color: color.accent }}>&gt; </span>
        <Typed text={prompt} delay={20} speed={2} />
      </div>
    </Rise>
    <Rise delay={130}>
      <div style={{ fontSize: 34, color: color.muted, marginTop: 32 }}>
        It does the setup and tells you which steps only you can do.
      </div>
    </Rise>
  </Scene>
)

export const Outro = () => {
  const p = useEnter(0, 12)
  return (
    <Scene>
      <div style={{ display: 'flex', alignItems: 'center', gap: 40, transform: `scale(${0.9 + p * 0.1})`, opacity: p }}>
        <Img src={staticFile('icon.svg')} style={{ width: 160, height: 160 }} />
        <div style={{ fontSize: 100, fontWeight: 800, letterSpacing: -3 }}>tailnet-preview</div>
      </div>
      <Rise delay={15}>
        <div style={{ fontFamily: font.mono, fontSize: 40, color: color.accent, marginTop: 48, textAlign: 'center' }}>
          github.com/riverscn/tailnet-preview
        </div>
      </Rise>
      <Rise delay={25}>
        <div style={{ fontFamily: font.mono, fontSize: 34, color: color.muted, marginTop: 16, textAlign: 'center' }}>
          riverscn.github.io/tailnet-preview
        </div>
      </Rise>
    </Scene>
  )
}
