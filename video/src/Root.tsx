import { Composition } from 'remotion'
import { DURATION, Promo } from './Promo'
import { FPS } from './theme'

export const Root = () => (
  <Composition id="Promo" component={Promo} durationInFrames={DURATION} fps={FPS} width={1920} height={1080} />
)
