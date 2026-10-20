import type { CSSProperties, ReactNode } from 'react'
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion'
import { color, font } from './theme'

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const

// Fades a whole scene in at its start and out at its end.
export const Scene = ({ children }: { children: ReactNode }) => {
  const frame = useCurrentFrame()
  const { durationInFrames } = useVideoConfig()
  const opacity = interpolate(frame, [0, 12, durationInFrames - 12, durationInFrames], [0, 1, 1, 0], clamp)
  return (
    <AbsoluteFill
      style={{
        opacity,
        fontFamily: font.sans,
        color: color.fg,
        alignItems: 'center',
        justifyContent: 'center',
        paddingBottom: 150,
      }}
    >
      {children}
    </AbsoluteFill>
  )
}

// A spring from 0 to 1 that starts `delay` frames into the scene.
export const useEnter = (delay = 0, damping = 18) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  return spring({ frame: frame - delay, fps, config: { damping } })
}

export const Rise = ({
  delay = 0,
  children,
  style,
}: {
  delay?: number
  children: ReactNode
  style?: CSSProperties
}) => {
  const p = useEnter(delay)
  return <div style={{ opacity: p, transform: `translateY(${(1 - p) * 40}px)`, ...style }}>{children}</div>
}

// Types `text` out from `delay`, `speed` characters per frame.
export const Typed = ({ text, delay = 0, speed = 1.2 }: { text: string; delay?: number; speed?: number }) => {
  const frame = useCurrentFrame()
  const shown = Math.max(0, Math.floor((frame - delay) * speed))
  const caret = shown < text.length && frame >= delay
  return (
    <>
      {text.slice(0, shown)}
      {caret && <span style={{ color: color.accent }}>▍</span>}
    </>
  )
}

// English and Chinese subtitles at the bottom of a scene.
export const Subtitle = ({ en, zh }: { en: string; zh: string }) => {
  const frame = useCurrentFrame()
  const { durationInFrames } = useVideoConfig()
  const opacity = interpolate(frame, [8, 20, durationInFrames - 12, durationInFrames], [0, 1, 1, 0], clamp)
  return (
    <AbsoluteFill style={{ justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 56, opacity }}>
      <div
        style={{
          textAlign: 'center',
          background: 'rgba(6, 11, 23, 0.72)',
          border: `1px solid ${color.border}`,
          borderRadius: 18,
          padding: '16px 36px',
          maxWidth: 1600,
          fontFamily: font.sans,
        }}
      >
        <div style={{ fontSize: 38, fontWeight: 600, color: color.fg }}>{en}</div>
        <div style={{ fontSize: 32, color: color.accentStrong, marginTop: 6 }}>{zh}</div>
      </div>
    </AbsoluteFill>
  )
}

export const Card = ({ children, style }: { children: ReactNode; style?: CSSProperties }) => (
  <div
    style={{
      background: color.bgSoft,
      border: `1px solid ${color.border}`,
      borderRadius: 24,
      padding: 36,
      boxShadow: '0 30px 80px rgba(0, 0, 0, 0.35)',
      ...style,
    }}
  >
    {children}
  </div>
)
