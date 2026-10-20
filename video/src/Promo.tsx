import type { FC } from 'react'
import { AbsoluteFill, Html5Audio, interpolate, Sequence, staticFile, useCurrentFrame } from 'remotion'
import { Agent, Comment, Data, Intro, Merge, OpenPR, Outro, Private, Problem, Push } from './scenes'
import { lines, type Lang } from './script'
import { color, FPS } from './theme'
import { ShotLength, Subtitle } from './ui'
import voiceover from './voiceover.json'

const scenes: Record<string, FC> = {
  intro: Intro,
  problem: Problem,
  open: OpenPR,
  comment: Comment,
  push: Push,
  merge: Merge,
  data: Data,
  private: Private,
  agent: Agent,
  outro: Outro,
}

// The voice-over starts this many frames into its shot, and the shot holds this long after it ends.
const LEAD = 12
const TAIL = 18

const seconds = voiceover as Record<Lang, Record<string, number>>

export const shotsFor = (lang: Lang) =>
  lines.map((line) => {
    const spoken = seconds[lang]?.[line.id]
    const frames = spoken ? LEAD + Math.ceil(spoken * FPS) + TAIL : 0
    return { ...line, frames: Math.max(line.minFrames, frames), spoken: Boolean(spoken) }
  })

export const durationFor = (lang: Lang) => shotsFor(lang).reduce((sum, s) => sum + s.frames, 0)

const Background = () => {
  const frame = useCurrentFrame()
  const drift = frame * 0.4
  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(circle at ${30 + Math.sin(frame / 90) * 10}% 20%, ${color.accentSoft} 0%, ${color.bg} 55%)`,
      }}
    >
      <AbsoluteFill
        style={{
          backgroundImage: `linear-gradient(${color.border} 1px, transparent 1px), linear-gradient(90deg, ${color.border} 1px, transparent 1px)`,
          backgroundSize: '80px 80px',
          backgroundPosition: `${drift}px ${drift}px`,
          opacity: 0.35,
        }}
      />
    </AbsoluteFill>
  )
}

export const Promo = ({ lang }: { lang: Lang }) => {
  const shots = shotsFor(lang)
  const total = durationFor(lang)
  let from = 0
  return (
    <AbsoluteFill style={{ background: color.bg }}>
      <Background />
      <Html5Audio
        src={staticFile('audio/music.mp3')}
        volume={(f) => interpolate(f, [0, 30, total - 60, total], [0, 0.22, 0.22, 0], { extrapolateRight: 'clamp' })}
      />
      {shots.map((shot) => {
        const S = scenes[shot.id]
        const start = from
        from += shot.frames
        return (
          <Sequence key={shot.id} from={start} durationInFrames={shot.frames}>
            <ShotLength.Provider value={shot.frames}>
              <S />
              <Subtitle en={shot.en} zh={shot.zh} />
              {shot.spoken && (
                <Sequence from={LEAD} layout="none">
                  <Html5Audio src={staticFile(`voiceover/${lang}/${shot.id}.mp3`)} />
                </Sequence>
              )}
            </ShotLength.Provider>
          </Sequence>
        )
      })}
    </AbsoluteFill>
  )
}
