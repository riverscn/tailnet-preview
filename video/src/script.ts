// The voice-over, one line per shot, kept in script.json. The same text is shown as
// subtitles, and scripts/voiceover.py turns it into public/voiceover/<lang>/<id>.mp3.
import script from './script.json'

export type Lang = 'zh' | 'en'

export type Line = {
  id: string
  // The shortest the shot may be, in frames, so its animation can finish.
  minFrames: number
  zh: string
  en: string
}

export const lines: Line[] = script
