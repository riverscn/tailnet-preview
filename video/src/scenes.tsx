import { getLength, getPointAtLength } from '@remotion/paths'
import type { ReactNode } from 'react'
import { AbsoluteFill, Easing, Img, interpolate, staticFile, useCurrentFrame } from 'remotion'
import { BrowserWindow, Check, Cursor, gh, PreviewTable, PullRequestPage, Spinner, type PRState } from './github'
import { color, font } from './theme'
import { Card, Rise, Scene, Sfx, Typed, useEnter } from './ui'

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const
const ease = { ...clamp, easing: Easing.inOut(Easing.cubic) }

const PR_URL = 'https://myapp-pr-42.your-tailnet.ts.net'

// The icon's strokes draw themselves, then its window and check fill in.
export const Intro = () => {
  const frame = useCurrentFrame()
  const draw = interpolate(frame, [0, 30], [1, 0], ease)
  const fill = interpolate(frame, [24, 40], [0, 1], clamp)
  const pop = useEnter(20, 10)
  return (
    <Scene>
      <Sfx at={0} name="whoosh" volume={0.4} />
      <Sfx at={36} name="pop" />
      <svg viewBox="0 0 256 256" width={240} height={240} style={{ transform: `scale(${0.8 + pop * 0.2})` }}>
        <defs>
          <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#2563eb" />
            <stop offset="1" stopColor="#1e3a8a" />
          </linearGradient>
        </defs>
        <rect width="256" height="256" rx="56" fill="url(#bg)" opacity={fill} />
        <rect
          x="4"
          y="4"
          width="248"
          height="248"
          rx="52"
          fill="none"
          stroke={color.accent}
          strokeWidth="6"
          pathLength={1}
          strokeDasharray="1"
          strokeDashoffset={draw}
          opacity={1 - fill}
        />
        <g fill="none" stroke="#fff" strokeWidth="16" strokeLinecap="round">
          <path d="M72 70 V186" pathLength={1} strokeDasharray="1" strokeDashoffset={draw} />
          <path d="M72 166 C72 132 92 128 116 128" pathLength={1} strokeDasharray="1" strokeDashoffset={draw} />
        </g>
        <g opacity={fill}>
          <circle cx="72" cy="66" r="18" fill="#fff" />
          <circle cx="72" cy="190" r="18" fill="#fff" />
          <rect x="112" y="78" width="104" height="100" rx="18" fill="#fff" />
          <path d="M112 96 a18 18 0 0 1 18 -18 h68 a18 18 0 0 1 18 18 v8 h-104 z" fill="#bfdbfe" />
          <circle cx="132" cy="92" r="5" fill="#1e3a8a" />
          <circle cx="148" cy="92" r="5" fill="#1e3a8a" />
        </g>
        <path
          d="M138 140 l14 14 l28 -28"
          stroke="#2563eb"
          strokeWidth="12"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
          pathLength={1}
          strokeDasharray="1"
          strokeDashoffset={interpolate(frame, [36, 50], [1, 0], ease)}
        />
      </svg>
      <Rise delay={30}>
        <div style={{ fontSize: 120, fontWeight: 800, letterSpacing: -3, marginTop: 36 }}>tailnet-preview</div>
      </Rise>
      <Rise delay={42}>
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

// The pull request page in a browser window that fills most of the frame.
const PRWindow = ({ state, scroll = 0, children }: { state: PRState; scroll?: number; children?: ReactNode }) => {
  const p = useEnter(0, 20)
  return (
    <AbsoluteFill style={{ padding: '36px 120px 210px' }}>
      <BrowserWindow
        url={<span style={{ color: gh.fg }}>github.com/acme/myapp/pull/42</span>}
        style={{ height: '100%', opacity: p, transform: `scale(${0.94 + p * 0.06})` }}
      >
        <PullRequestPage state={state} scroll={scroll} />
      </BrowserWindow>
      {children}
    </AbsoluteFill>
  )
}

const baseCommits = [
  { sha: 'a1c3f9e', message: 'Add a dark theme', at: 0 },
  { sha: '5be20d4', message: 'Add a toggle to the settings page', at: 0 },
]

const steps = [
  { name: 'Build images', log: 'docker compose build · web, worker' },
  { name: 'Copy the baseline’s data', log: 'pause main · copy 2 volumes · resume (4 s)' },
  { name: 'Run the PR’s migrations', log: 'migrate: 2 applied' },
  { name: 'Start', log: PR_URL },
]
const STEP0 = 50
const STEP = 36
const DONE = STEP0 + steps.length * STEP

export const OpenPR = () => {
  const frame = useCurrentFrame()
  const panel = interpolate(frame, [30, 45], [0, 1], ease)
  return (
    <Scene>
      <PRWindow state={{ merged: false, commits: baseCommits, check: frame < DONE ? 'running' : 'success' }}>
        <div
          style={{
            position: 'absolute',
            right: 70,
            top: 150,
            width: 760,
            opacity: panel,
            transform: `translateX(${(1 - panel) * 120}px)`,
            background: gh.panel,
            border: `1px solid ${gh.border}`,
            borderRadius: 16,
            boxShadow: '0 40px 100px rgba(0,0,0,0.6)',
            fontFamily: font.sans,
            color: gh.fg,
            overflow: 'hidden',
          }}
        >
          <div style={{ padding: '20px 26px', borderBottom: `1px solid ${gh.border}`, fontSize: 26 }}>
            <b>deploy</b>
            <div style={{ color: gh.muted, fontSize: 21, marginTop: 4 }}>
              runs-on: [self-hosted, preview] · your machine
            </div>
          </div>
          {steps.map((s, i) => {
            const start = STEP0 + i * STEP
            if (frame < start) return null
            const done = frame >= start + STEP
            return (
              <div key={s.name} style={{ padding: '14px 26px', borderBottom: `1px solid ${gh.border}` }}>
                <div style={{ display: 'flex', gap: 16, alignItems: 'center', fontSize: 25 }}>
                  {done ? <Check size={24} /> : <Spinner size={24} />}
                  {s.name}
                </div>
                <div style={{ fontFamily: font.mono, fontSize: 19, color: gh.muted, margin: '6px 0 0 40px' }}>
                  <Typed text={s.log} delay={start + 4} speed={2.5} />
                </div>
              </div>
            )
          })}
        </div>
      </PRWindow>
      {steps.map((s, i) => (
        <Sfx key={s.name} at={STEP0 + (i + 1) * STEP} name="click" volume={0.35} />
      ))}
      <Sfx at={DONE} name="ding" volume={0.5} />
    </Scene>
  )
}

const readyComment = (version: string, highlight = 0) => (
  <div>
    <b>Preview environment ready</b> <span style={{ color: gh.muted }}>(copied from the baseline)</span>
    <PreviewTable url={PR_URL} />
    <div style={{ color: gh.muted, fontSize: 22, marginTop: 14 }}>
      Version{' '}
      <span
        style={{
          fontFamily: font.mono,
          color: highlight ? gh.fg : gh.muted,
          background: `rgba(68,147,248,${highlight * 0.35})`,
          borderRadius: 6,
          padding: '0 6px',
        }}
      >
        {version}
      </span>
      , updated just now. Only devices in your tailnet can open it.
    </div>
  </div>
)

// The mock application the preview runs.
const App = () => (
  <div style={{ background: '#111827', height: '100%', fontFamily: font.sans, color: '#f3f4f6', padding: '40px 60px' }}>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <div style={{ fontSize: 44, fontWeight: 800 }}>MyApp</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 24, color: '#9ca3af' }}>
        Dark mode
        <div style={{ width: 64, height: 36, borderRadius: 18, background: color.accentDeep, position: 'relative' }}>
          <div
            style={{
              position: 'absolute',
              right: 4,
              top: 4,
              width: 28,
              height: 28,
              borderRadius: 14,
              background: '#fff',
            }}
          />
        </div>
      </div>
    </div>
    <div style={{ marginTop: 34, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24 }}>
      {[
        ['Customers', '1,284'],
        ['Orders this week', '312'],
        ['Open tickets', '17'],
      ].map(([k, v]) => (
        <div key={k} style={{ background: '#1f2937', borderRadius: 16, padding: 26 }}>
          <div style={{ fontSize: 22, color: '#9ca3af' }}>{k}</div>
          <div style={{ fontSize: 48, fontWeight: 800, marginTop: 6 }}>{v}</div>
        </div>
      ))}
    </div>
    <div
      style={{ marginTop: 24, background: '#1f2937', borderRadius: 16, padding: 26, fontSize: 24, color: '#d1d5db' }}
    >
      Data copied from the baseline <span style={{ color: '#9ca3af' }}>· seeded once, upgraded by every merge</span>
    </div>
  </div>
)

const LINK = { x: 780, y: 795 }

export const Comment = () => {
  const frame = useCurrentFrame()
  const scroll = interpolate(frame, [10, 40], [0, 150], ease)
  const app = interpolate(frame, [95, 120], [0, 1], ease)
  return (
    <Scene>
      <PRWindow
        state={{
          merged: false,
          commits: baseCommits,
          check: 'success',
          comment: { at: 8, body: readyComment('5be20d4') },
        }}
        scroll={scroll}
      />
      <Cursor
        path={[
          { at: 45, x: 1500, y: 900 },
          { at: 80, x: LINK.x, y: LINK.y, click: true },
          { at: 100, x: LINK.x, y: LINK.y },
        ]}
      />
      {app > 0 && (
        <AbsoluteFill style={{ padding: '70px 220px 230px' }}>
          <BrowserWindow
            url={
              <span>
                <span style={{ color: gh.muted }}>https://</span>
                <span style={{ color: gh.fg }}>myapp-pr-42</span>
                <span style={{ color: gh.muted }}>.your-tailnet.ts.net</span>
              </span>
            }
            lock={
              <span
                style={{
                  background: '#0f2a1a',
                  color: gh.greenFg,
                  borderRadius: 8,
                  padding: '2px 10px',
                  fontSize: 19,
                  fontWeight: 600,
                }}
              >
                🔒 tailnet
              </span>
            }
            style={{
              height: '100%',
              opacity: app,
              transformOrigin: `${LINK.x - 220}px ${LINK.y - 70}px`,
              transform: `scale(${0.2 + app * 0.8})`,
            }}
          >
            <App />
          </BrowserWindow>
        </AbsoluteFill>
      )}
      <Sfx at={8} name="pop" />
      <Sfx at={80} name="click" />
      <Sfx at={95} name="whoosh" volume={0.35} />
    </Scene>
  )
}

const PUSHED = { sha: 'd69d97d', message: 'Tweak the contrast of links', at: 40 }

export const Push = () => {
  const frame = useCurrentFrame()
  const terminal = interpolate(frame, [0, 12, 50, 62], [0, 1, 1, 0], clamp)
  const updated = frame >= 110
  const glow = interpolate(frame, [110, 120, 150, 170], [0, 1, 1, 0.3], clamp)
  return (
    <Scene>
      <PRWindow
        state={{
          merged: false,
          commits: [...baseCommits, PUSHED],
          check: frame >= 40 && frame < 110 ? 'running' : 'success',
          comment: { at: -20, body: readyComment(updated ? 'd69d97d' : '5be20d4', updated ? glow : 0) },
        }}
        scroll={196}
      >
        <div
          style={{
            position: 'absolute',
            right: 90,
            top: 120,
            opacity: terminal,
            background: color.code,
            border: `1px solid ${color.border}`,
            borderRadius: 14,
            padding: '20px 30px',
            fontFamily: font.mono,
            fontSize: 30,
            color: color.fg,
            boxShadow: '0 30px 80px rgba(0,0,0,0.6)',
          }}
        >
          <span style={{ color: color.accent }}>$ </span>
          <Typed text="git push" delay={6} speed={0.6} />
        </div>
      </PRWindow>
      <Sfx at={22} name="click" volume={0.4} />
      <Sfx at={40} name="pop" />
      <Sfx at={110} name="ding" volume={0.5} />
    </Scene>
  )
}

const MERGE_BUTTON = { x: 420, y: 830 }

export const Merge = () => {
  const frame = useCurrentFrame()
  const merged = frame >= 52
  const terminal = interpolate(frame, [100, 118], [0, 1], ease)
  const removed = interpolate(frame, [175, 195], [1, 0], clamp)
  return (
    <Scene>
      <PRWindow
        state={{
          merged,
          commits: [...baseCommits, { ...PUSHED, at: -20 }],
          check: 'success',
          pressAt: 46,
          comment: {
            at: -20,
            body: merged ? (
              <div>
                <b>Preview environment removed</b>{' '}
                <span style={{ color: gh.muted }}>(the pull request was merged)</span>
              </div>
            ) : (
              readyComment('d69d97d')
            ),
          },
        }}
        scroll={interpolate(frame, [52, 72], [420, 260], ease)}
      >
        <Cursor
          path={[
            { at: 10, x: 1300, y: 960 },
            { at: 46, x: MERGE_BUTTON.x, y: MERGE_BUTTON.y, click: true },
            { at: 70, x: MERGE_BUTTON.x + 40, y: MERGE_BUTTON.y + 60 },
          ]}
        />
        <div
          style={{
            position: 'absolute',
            right: 90,
            top: 160,
            width: 900,
            opacity: terminal,
            transform: `translateY(${(1 - terminal) * 60}px)`,
            background: color.code,
            border: `1px solid ${color.border}`,
            borderRadius: 18,
            padding: '26px 34px',
            fontFamily: font.mono,
            fontSize: 26,
            color: color.fg,
            boxShadow: '0 40px 100px rgba(0,0,0,0.65)',
            lineHeight: 1.7,
          }}
        >
          <div style={{ color: color.muted, fontSize: 21, marginBottom: 10 }}>on your machine</div>
          <div>
            <span style={{ color: color.accent }}>$ </span>
            <Typed text="tailnet-preview list" delay={122} speed={1.5} />
          </div>
          {frame >= 140 && (
            <>
              <div>
                main{'   '}
                <span style={{ color: color.green }}>d69d97d</span>
                {'  '}myapp-main.your-tailnet.ts.net{' '}
                <span
                  style={{
                    fontFamily: font.sans,
                    fontSize: 19,
                    background: '#14532d',
                    color: color.green,
                    borderRadius: 6,
                    padding: '2px 8px',
                  }}
                >
                  upgraded
                </span>
              </div>
              <div style={{ opacity: 0.25 + removed * 0.75, textDecoration: removed < 1 ? 'line-through' : undefined }}>
                pr-42{'  '}d69d97d{'  '}myapp-pr-42.your-tailnet.ts.net
              </div>
            </>
          )}
        </div>
      </PRWindow>
      <Sfx at={46} name="click" />
      <Sfx at={52} name="ding" volume={0.5} />
      <Sfx at={175} name="pop" volume={0.4} />
    </Scene>
  )
}

const Cylinder = ({ label, sub, tint, scale = 1 }: { label: string; sub?: string; tint: string; scale?: number }) => (
  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', transform: `scale(${scale})` }}>
    <svg width="170" height="190" viewBox="0 0 170 190">
      <path d="M10 30 v130 a75 22 0 0 0 150 0 v-130" fill={tint} opacity="0.85" />
      <ellipse cx="85" cy="30" rx="75" ry="22" fill={tint} />
      <ellipse cx="85" cy="30" rx="75" ry="22" fill="#fff" opacity="0.25" />
      <path
        d="M10 75 a75 22 0 0 0 150 0 M10 120 a75 22 0 0 0 150 0"
        stroke="#fff"
        strokeOpacity="0.3"
        strokeWidth="3"
        fill="none"
      />
    </svg>
    <div style={{ fontFamily: font.mono, fontSize: 32, fontWeight: 700, marginTop: 12 }}>{label}</div>
    {sub && <div style={{ fontSize: 24, color: color.muted, marginTop: 4 }}>{sub}</div>}
  </div>
)

// The baseline's data flows into each pull request's environment, which then migrates.
export const Data = () => {
  const frame = useCurrentFrame()
  const targets = ['pr-42', 'pr-43', 'pr-44']
  return (
    <Scene>
      <div style={{ position: 'relative', width: 1500, height: 620 }}>
        <div style={{ position: 'absolute', left: 60, top: 170 }}>
          <Rise>
            <Cylinder label="main" sub="baseline" tint={color.accentDeep} scale={1.15} />
          </Rise>
        </div>
        <svg width="1500" height="620" style={{ position: 'absolute', left: 0, top: 0 }}>
          {targets.map((_, i) => {
            const start = 25 + i * 22
            const y = 100 + i * 200
            const d = `M290 300 C 640 300, 640 ${y}, 1000 ${y}`
            const draw = interpolate(frame, [start, start + 25], [1, 0], ease)
            const dot = interpolate(frame, [start + 10, start + 40], [0, 1], ease)
            const at = getPointAtLength(d, getLength(d) * dot)
            return (
              <g key={i}>
                <path d={d} stroke={color.border} strokeWidth="6" fill="none" />
                <path
                  d={d}
                  stroke={color.accent}
                  strokeWidth="6"
                  fill="none"
                  pathLength={1}
                  strokeDasharray="1"
                  strokeDashoffset={draw}
                />
                {at && dot > 0 && dot < 1 && <circle cx={at.x} cy={at.y} r="14" fill={color.accentStrong} />}
              </g>
            )
          })}
        </svg>
        {targets.map((t, i) => {
          const arrive = 25 + i * 22 + 40
          const p = interpolate(frame, [arrive - 10, arrive + 5], [0, 1], clamp)
          const migrated = interpolate(frame, [arrive + 30, arrive + 42], [0, 1], clamp)
          return (
            <div
              key={t}
              style={{
                position: 'absolute',
                left: 1010,
                top: i * 200 + 10,
                display: 'flex',
                alignItems: 'center',
                gap: 24,
                opacity: p,
                transform: `scale(${0.8 + p * 0.2})`,
              }}
            >
              <div style={{ transform: 'scale(0.68)', transformOrigin: 'left center', width: 120 }}>
                <Cylinder label={t} tint="#3b82f6" />
              </div>
              <div
                style={{
                  opacity: migrated,
                  transform: `translateX(${(1 - migrated) * -20}px)`,
                  background: '#14532d',
                  color: color.green,
                  fontSize: 26,
                  fontWeight: 600,
                  borderRadius: 30,
                  padding: '8px 20px',
                  marginLeft: 20,
                }}
              >
                + its migrations
              </div>
            </div>
          )
        })}
      </div>
      {[0, 1, 2].map((i) => (
        <Sfx key={i} at={25 + i * 22 + 40} name="pop" volume={0.35} />
      ))}
    </Scene>
  )
}

const Device = ({ icon, label }: { icon: string; label: string }) => (
  <div
    style={{
      background: color.bgSoft,
      border: `1px solid ${color.border}`,
      borderRadius: 18,
      padding: '18px 26px',
      fontSize: 28,
      display: 'flex',
      alignItems: 'center',
      gap: 14,
    }}
  >
    <span style={{ fontSize: 36 }}>{icon}</span>
    {label}
  </div>
)

// The tailnet: your devices and the machine inside, the internet kept out.
export const Private = () => {
  const frame = useCurrentFrame()
  const ring = interpolate(frame, [0, 30], [1, 0], ease)
  const packet = (frame % 40) / 40
  const blocked = interpolate(frame, [70, 95], [0, 1], ease)
  const x = interpolate(frame, [100, 112, 124], [0, 1.2, 1], clamp)
  return (
    <Scene>
      <div style={{ position: 'relative', width: 1640, height: 640 }}>
        <svg width="1640" height="640" style={{ position: 'absolute', left: 0, top: 0 }}>
          <rect
            x="20"
            y="20"
            width="1180"
            height="600"
            rx="60"
            fill="rgba(37,99,235,0.08)"
            stroke={color.accent}
            strokeWidth="5"
            pathLength={1}
            strokeDasharray="1"
            strokeDashoffset={ring}
          />
          {[170, 470].map((y) => (
            <g key={y}>
              <path d={`M400 ${y} L760 320`} stroke={color.border} strokeWidth="5" />
              <circle cx={400 + (760 - 400) * packet} cy={y + (320 - y) * packet} r="9" fill={color.accent} />
            </g>
          ))}
          <path
            d={`M1560 320 L${1560 - 330 * blocked} 320`}
            stroke="#f87171"
            strokeWidth="5"
            strokeDasharray="14 10"
            opacity={blocked}
          />
        </svg>
        <div style={{ position: 'absolute', left: 60, top: 46, fontSize: 28, color: color.accent, fontWeight: 600 }}>
          your tailnet
        </div>
        <div style={{ position: 'absolute', left: 90, top: 125 }}>
          <Rise delay={10}>
            <Device icon="💻" label="Laptop" />
          </Rise>
        </div>
        <div style={{ position: 'absolute', left: 90, top: 425 }}>
          <Rise delay={18}>
            <Device icon="📱" label="Phone" />
          </Rise>
        </div>
        <div style={{ position: 'absolute', left: 760, top: 160 }}>
          <Rise delay={26}>
            <Card style={{ width: 400, padding: 30 }}>
              <div style={{ fontSize: 24, color: color.muted }}>One Linux machine</div>
              <div style={{ fontSize: 36, fontWeight: 800, marginTop: 4 }}>Docker</div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 18 }}>
                {['main', 'pr-42', 'pr-43', 'pr-44'].map((e) => (
                  <span
                    key={e}
                    style={{
                      fontFamily: font.mono,
                      fontSize: 22,
                      background: color.accentSoft,
                      color: color.accentStrong,
                      borderRadius: 8,
                      padding: '4px 12px',
                    }}
                  >
                    {e}
                  </span>
                ))}
              </div>
            </Card>
          </Rise>
        </div>
        <div style={{ position: 'absolute', left: 1440, top: 250, textAlign: 'center', opacity: blocked }}>
          <div style={{ fontSize: 90 }}>🌐</div>
          <div style={{ fontSize: 26, color: color.muted }}>Internet</div>
        </div>
        <div
          style={{
            position: 'absolute',
            left: 1172,
            top: 284,
            width: 72,
            height: 72,
            borderRadius: 36,
            background: '#7f1d1d',
            border: '4px solid #f87171',
            color: '#fecaca',
            fontSize: 44,
            fontWeight: 900,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transform: `scale(${x})`,
          }}
        >
          ✕
        </div>
      </div>
      <Sfx at={100} name="pop" />
    </Scene>
  )
}

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
      <Sfx at={0} name="ding" volume={0.4} />
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
