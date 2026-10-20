import type { FC } from 'react'
import { AbsoluteFill, Sequence, useCurrentFrame } from 'remotion'
import { Agent, Comment, Features, Flow, Intro, Outro, Problem } from './scenes'
import { color, FPS } from './theme'
import { Subtitle } from './ui'

type Shot = { scene: FC; seconds: number; en: string; zh: string }

const shots: Shot[] = [
  {
    scene: Intro,
    seconds: 4,
    en: 'Per-PR preview environments, on your own host.',
    zh: '在你自己的主机上，为每个 PR 起一套试用环境。',
  },
  {
    scene: Problem,
    seconds: 5,
    en: 'Reviewing a pull request? You want to see it running, with real data.',
    zh: '评审 PR 时，你想看到它真正跑起来，而且带着真实数据。',
  },
  {
    scene: Flow,
    seconds: 10,
    en: 'Open a pull request and a complete copy of your app starts on your machine.',
    zh: '开一个 PR，你自己的机器上就会起一套完整的应用，数据库从基线复制而来。',
  },
  {
    scene: Comment,
    seconds: 6,
    en: 'A comment on the PR says where it is, or what went wrong and how to fix it.',
    zh: 'PR 上的评论会给出地址；部署失败时，会写明原因和处理办法。',
  },
  {
    scene: Features,
    seconds: 8,
    en: 'Realistic upgrades, private, cheap, and any stack.',
    zh: '贴近真实的升级、私有、便宜、不挑技术栈。',
  },
  {
    scene: Agent,
    seconds: 6,
    en: 'Paste one prompt into your coding agent and it does the setup.',
    zh: '把一段提示词贴给 AI 编程助手，它就帮你接入。',
  },
  {
    scene: Outro,
    seconds: 5,
    en: 'Open source, MIT licensed.',
    zh: '开源，MIT 协议。',
  },
]

export const DURATION = shots.reduce((sum, s) => sum + s.seconds * FPS, 0)

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

export const Promo = () => {
  let from = 0
  return (
    <AbsoluteFill style={{ background: color.bg }}>
      <Background />
      {shots.map(({ scene: S, seconds, en, zh }) => {
        const start = from
        from += seconds * FPS
        return (
          <Sequence key={en} from={start} durationInFrames={seconds * FPS}>
            <S />
            <Subtitle en={en} zh={zh} />
          </Sequence>
        )
      })}
    </AbsoluteFill>
  )
}
