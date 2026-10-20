// A simulated GitHub pull request page (dark theme), drawn with plain elements
// so every part of it can be animated.
import type { CSSProperties, ReactNode } from 'react'
import { interpolate, useCurrentFrame } from 'remotion'
import { color, font } from './theme'

export const gh = {
  bg: '#0d1117',
  header: '#010409',
  panel: '#161b22',
  border: '#30363d',
  fg: '#e6edf3',
  muted: '#8b949e',
  link: '#4493f8',
  green: '#238636',
  greenFg: '#3fb950',
  purple: '#8957e5',
  yellow: '#d29922',
}

export const Avatar = ({ hue, size = 40, label }: { hue: string; size?: number; label: string }) => (
  <div
    style={{
      width: size,
      height: size,
      borderRadius: size / 2,
      background: hue,
      color: '#fff',
      fontSize: size * 0.45,
      fontWeight: 700,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    }}
  >
    {label}
  </div>
)

// A browser window with a tab strip and an address bar.
export const BrowserWindow = ({
  url,
  lock,
  children,
  style,
}: {
  url: ReactNode
  lock?: ReactNode
  children: ReactNode
  style?: CSSProperties
}) => (
  <div
    style={{
      background: gh.bg,
      border: `1px solid ${gh.border}`,
      borderRadius: 18,
      overflow: 'hidden',
      boxShadow: '0 50px 120px rgba(0,0,0,0.55)',
      display: 'flex',
      flexDirection: 'column',
      ...style,
    }}
  >
    <div
      style={{
        background: '#1c2128',
        padding: '14px 20px',
        display: 'flex',
        alignItems: 'center',
        gap: 18,
        borderBottom: `1px solid ${gh.border}`,
      }}
    >
      <div style={{ display: 'flex', gap: 9 }}>
        {['#ff5f57', '#febc2e', '#28c840'].map((c) => (
          <div key={c} style={{ width: 15, height: 15, borderRadius: 8, background: c }} />
        ))}
      </div>
      <div
        style={{
          flex: 1,
          background: gh.bg,
          border: `1px solid ${gh.border}`,
          borderRadius: 10,
          padding: '8px 18px',
          fontFamily: font.sans,
          fontSize: 24,
          color: gh.muted,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}
      >
        {lock ?? <span style={{ fontSize: 20 }}>🔒</span>}
        {url}
      </div>
    </div>
    <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>{children}</div>
  </div>
)

export const Spinner = ({ size = 26 }: { size?: number }) => {
  const frame = useCurrentFrame()
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        border: `4px solid ${gh.yellow}55`,
        borderTopColor: gh.yellow,
        transform: `rotate(${frame * 12}deg)`,
        flexShrink: 0,
      }}
    />
  )
}

export const Check = ({ size = 26 }: { size?: number }) => (
  <div
    style={{
      width: size,
      height: size,
      borderRadius: size / 2,
      background: gh.greenFg,
      color: gh.bg,
      fontSize: size * 0.7,
      fontWeight: 900,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    }}
  >
    ✓
  </div>
)

export type PRState = {
  merged: boolean
  commits: { sha: string; message: string; at: number }[]
  check: 'none' | 'running' | 'success'
  // When the bot's comment appears (scene frame), and what it says.
  comment?: { at: number; body: ReactNode }
  // When the merge box's button is pressed (scene frame).
  pressAt?: number
}

const TimelineItem = ({ at, children }: { at: number; children: ReactNode }) => {
  const frame = useCurrentFrame()
  const p = interpolate(frame, [at, at + 12], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  if (p === 0) return null
  return (
    <div style={{ opacity: p, transform: `translateY(${(1 - p) * 30}px)`, maxHeight: p * 600, overflow: 'hidden' }}>
      {children}
    </div>
  )
}

export const CommentBox = ({
  avatar,
  author,
  bot,
  children,
  highlight = 0,
}: {
  avatar: ReactNode
  author: string
  bot?: boolean
  children: ReactNode
  highlight?: number
}) => (
  <div style={{ display: 'flex', gap: 20, marginBottom: 28 }}>
    {avatar}
    <div
      style={{
        flex: 1,
        border: `2px solid ${highlight > 0 ? `rgba(68,147,248,${0.4 + highlight * 0.6})` : gh.border}`,
        borderRadius: 12,
        overflow: 'hidden',
        boxShadow: highlight > 0 ? `0 0 ${40 * highlight}px rgba(68,147,248,${0.5 * highlight})` : undefined,
      }}
    >
      <div
        style={{
          background: gh.panel,
          padding: '14px 22px',
          fontSize: 24,
          color: gh.muted,
          borderBottom: `1px solid ${gh.border}`,
        }}
      >
        <b style={{ color: gh.fg }}>{author}</b>
        {bot && (
          <span
            style={{
              marginLeft: 10,
              border: `1px solid ${gh.border}`,
              borderRadius: 20,
              padding: '1px 10px',
              fontSize: 18,
            }}
          >
            bot
          </span>
        )}{' '}
        commented
      </div>
      <div style={{ padding: '20px 24px', fontSize: 27, color: gh.fg, lineHeight: 1.5 }}>{children}</div>
    </div>
  </div>
)

export const PreviewTable = ({ url }: { url: ReactNode }) => (
  <div style={{ marginTop: 16, border: `1px solid ${gh.border}`, borderRadius: 8, overflow: 'hidden', fontSize: 25 }}>
    <div style={{ display: 'flex', background: gh.panel, fontWeight: 700 }}>
      <div style={{ width: 220, padding: '10px 18px' }}>Service</div>
      <div style={{ padding: '10px 18px' }}>Address</div>
    </div>
    <div style={{ display: 'flex', borderTop: `1px solid ${gh.border}` }}>
      <div style={{ width: 220, padding: '10px 18px' }}>Application</div>
      <div style={{ padding: '10px 18px', color: gh.link, fontFamily: font.mono, fontSize: 23 }}>{url}</div>
    </div>
  </div>
)

const StateBadge = ({ merged }: { merged: boolean }) => (
  <span
    style={{
      background: merged ? gh.purple : gh.green,
      color: '#fff',
      borderRadius: 30,
      padding: '8px 22px',
      fontSize: 24,
      fontWeight: 600,
    }}
  >
    {merged ? '⇄ Merged' : '⇄ Open'}
  </span>
)

const ChecksBox = ({ state, merged, pressAt }: { state: PRState['check']; merged: boolean; pressAt?: number }) => {
  const frame = useCurrentFrame()
  const pressed = pressAt !== undefined && frame >= pressAt && frame < pressAt + 6
  if (merged) {
    return (
      <div
        style={{
          border: `1px solid ${gh.purple}`,
          borderRadius: 12,
          padding: '22px 26px',
          display: 'flex',
          gap: 18,
          alignItems: 'center',
          fontSize: 27,
          color: gh.fg,
          background: `${gh.purple}22`,
        }}
      >
        <Avatar hue={gh.purple} size={44} label="⇄" />
        <div>
          <b>Pull request successfully merged and closed</b>
          <div style={{ color: gh.muted, fontSize: 23 }}>The dark-mode branch has been merged into main.</div>
        </div>
      </div>
    )
  }
  return (
    <div style={{ border: `1px solid ${gh.border}`, borderRadius: 12, overflow: 'hidden' }}>
      <div
        style={{
          padding: '20px 26px',
          display: 'flex',
          gap: 18,
          alignItems: 'center',
          fontSize: 25,
          color: gh.fg,
          borderBottom: `1px solid ${gh.border}`,
        }}
      >
        {state === 'running' ? <Spinner /> : <Check />}
        <div style={{ flex: 1 }}>
          <b>Preview / deploy</b> <span style={{ color: gh.muted }}>(pull_request)</span>
        </div>
        <span style={{ color: state === 'running' ? gh.yellow : gh.muted, fontSize: 22 }}>
          {state === 'running' ? 'In progress…' : 'Successful in 1m 12s'}
        </span>
      </div>
      <div style={{ padding: '20px 26px', display: 'flex', alignItems: 'center', gap: 20 }}>
        <div
          style={{
            background: state === 'success' ? gh.green : '#21262d',
            color: state === 'success' ? '#fff' : gh.muted,
            borderRadius: 10,
            padding: '12px 26px',
            fontSize: 25,
            fontWeight: 600,
            transform: pressed ? 'scale(0.95)' : undefined,
          }}
        >
          Merge pull request
        </div>
        <span style={{ color: gh.muted, fontSize: 22 }}>
          {state === 'success' ? 'All checks have passed' : 'Some checks haven’t completed yet'}
        </span>
      </div>
    </div>
  )
}

// The pull request page. `scroll` moves the page up, in pixels.
export const PullRequestPage = ({ state, scroll = 0 }: { state: PRState; scroll?: number }) => (
  <div
    style={{
      fontFamily: font.sans,
      color: gh.fg,
      background: gh.bg,
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
    }}
  >
    <div
      style={{
        position: 'relative',
        zIndex: 1,
        background: gh.header,
        padding: '16px 40px',
        display: 'flex',
        alignItems: 'center',
        gap: 18,
        fontSize: 25,
        borderBottom: `1px solid ${gh.border}`,
      }}
    >
      <svg width="38" height="38" viewBox="0 0 16 16" fill={gh.fg}>
        <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
      </svg>
      <span style={{ color: gh.muted }}>acme</span>/<b>myapp</b>
    </div>
    <div style={{ flex: 1, overflow: 'hidden' }}>
      <div style={{ padding: '30px 56px 0', transform: `translateY(${-scroll}px)` }}>
        <div style={{ fontSize: 46, fontWeight: 400 }}>
          Add dark mode <span style={{ color: gh.muted }}>#42</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 14, fontSize: 25, color: gh.muted }}>
          <StateBadge merged={state.merged} />
          <span>
            <b style={{ color: gh.fg }}>alice</b> {state.merged ? 'merged' : 'wants to merge'} {state.commits.length}{' '}
            commits into <Branch>main</Branch> from <Branch>dark-mode</Branch>
          </span>
        </div>
        <div
          style={{
            display: 'flex',
            gap: 36,
            fontSize: 24,
            color: gh.muted,
            borderBottom: `1px solid ${gh.border}`,
            marginTop: 26,
            paddingBottom: 14,
          }}
        >
          <span style={{ color: gh.fg, borderBottom: '3px solid #f78166', paddingBottom: 14, marginBottom: -16 }}>
            Conversation
          </span>
          <span>Commits {state.commits.length}</span>
          <span>Checks 1</span>
          <span>Files changed 6</span>
        </div>
        <div style={{ maxWidth: 1240, marginTop: 30 }}>
          <CommentBox avatar={<Avatar hue="#db61a2" label="a" />} author="alice">
            Adds a dark theme and a toggle in the settings page.
          </CommentBox>
          {state.commits.map((c) => (
            <TimelineItem key={c.sha} at={c.at}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 24, margin: '0 0 22px 60px' }}>
                <div style={{ width: 14, height: 14, borderRadius: 7, border: `3px solid ${gh.muted}` }} />
                <span>{c.message}</span>
                <span style={{ fontFamily: font.mono, color: gh.muted, fontSize: 21 }}>{c.sha}</span>
              </div>
            </TimelineItem>
          ))}
          {state.comment && (
            <TimelineItem at={state.comment.at}>
              <CommentBox avatar={<Avatar hue={color.accentDeep} label="▶" />} author="github-actions" bot>
                {state.comment.body}
              </CommentBox>
            </TimelineItem>
          )}
          {state.check !== 'none' && <ChecksBox state={state.check} merged={state.merged} pressAt={state.pressAt} />}
        </div>
      </div>
    </div>
  </div>
)

const Branch = ({ children }: { children: ReactNode }) => (
  <span
    style={{
      fontFamily: font.mono,
      fontSize: 21,
      color: gh.link,
      background: '#388bfd26',
      borderRadius: 6,
      padding: '2px 8px',
    }}
  >
    {children}
  </span>
)

// A mouse pointer that moves through `path` and dips when it clicks.
export const Cursor = ({ path }: { path: { at: number; x: number; y: number; click?: boolean }[] }) => {
  const frame = useCurrentFrame()
  const ats = path.map((p) => p.at)
  const opts = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const
  const x = interpolate(
    frame,
    ats,
    path.map((p) => p.x),
    opts,
  )
  const y = interpolate(
    frame,
    ats,
    path.map((p) => p.y),
    opts,
  )
  const clicking = path.some((p) => p.click && frame >= p.at && frame < p.at + 6)
  const ring = path.find((p) => p.click && frame >= p.at && frame < p.at + 18)
  const opacity = interpolate(frame, [ats[0] - 8, ats[0]], [0, 1], opts)
  return (
    <div style={{ position: 'absolute', left: 0, top: 0, opacity, pointerEvents: 'none' }}>
      {ring && (
        <div
          style={{
            position: 'absolute',
            left: ring.x - 30,
            top: ring.y - 30,
            width: 60,
            height: 60,
            borderRadius: 30,
            border: `4px solid ${color.accent}`,
            opacity: 1 - (frame - ring.at) / 18,
            transform: `scale(${0.5 + (frame - ring.at) / 12})`,
          }}
        />
      )}
      <svg
        width="44"
        height="44"
        viewBox="0 0 24 24"
        style={{ position: 'absolute', left: x - 6, top: y - 3, transform: `scale(${clicking ? 0.85 : 1})` }}
      >
        <path d="M5 3l14 8-6.5 1.5L9 19z" fill="#fff" stroke="#000" strokeWidth="1.4" strokeLinejoin="round" />
      </svg>
    </div>
  )
}
