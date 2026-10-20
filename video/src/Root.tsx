import { Composition } from 'remotion'
import { durationFor, Promo } from './Promo'
import { FPS } from './theme'

export const Root = () => (
  <>
    <Composition
      id="PromoZh"
      component={Promo}
      defaultProps={{ lang: 'zh' as const }}
      durationInFrames={durationFor('zh')}
      fps={FPS}
      width={1920}
      height={1080}
    />
    <Composition
      id="PromoEn"
      component={Promo}
      defaultProps={{ lang: 'en' as const }}
      durationInFrames={durationFor('en')}
      fps={FPS}
      width={1920}
      height={1080}
    />
  </>
)
