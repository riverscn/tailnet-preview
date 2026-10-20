# Promo video

[简体中文](README.zh-CN.md)

A promo video for tailnet-preview, about 80 seconds at 1920×1080 and 30 fps, made with
[Remotion](https://www.remotion.dev). It comes in two versions with the same pictures: `PromoZh` has a
Chinese voice-over and `PromoEn` an English one. Both show English and Chinese subtitles, and both have
music and sound effects. Its text follows the [README](../README.md) and its colours follow the
[website](../website/). The GitHub pages in it are simulated; `acme/myapp` and its pull request are made up.

```bash
cd video
npm ci
npm run studio      # preview and edit in the browser
npm run render      # writes out/tailnet-preview-zh.mp4 and out/tailnet-preview-en.mp4
```

Rendering downloads a headless Chrome the first time. To use one already installed, add
`--browser-executable=/path/to/chrome` to the `remotion render` command.

## What is where

- `src/script.json`: the shots in order, with the voice-over of each in both languages. The subtitles show
  the same text.
- `src/scenes.tsx`: what each shot shows. `src/github.tsx` draws the simulated GitHub pages.
- `src/Promo.tsx`: puts the shots, voice-over, music and subtitles together. Each shot lasts as long as its
  voice-over, and at least its `minFrames`.
- `public/voiceover/`: the spoken lines, and `src/voiceover.json` their lengths.
- `public/audio/`: the music and sound effects.

## Changing the voice-over

After changing `src/script.json`, speak it again. The voices are [Kokoro](https://github.com/hexgrad/kokoro)
(Apache-2.0), which runs on the CPU; it needs Python 3.10 to 3.12:

```bash
python3.12 -m venv .venv
.venv/bin/pip install "kokoro>=0.9.4" "misaki[zh,en]" soundfile
.venv/bin/python scripts/voiceover.py
```

## Music and sound effects

`scripts/make-audio.py` synthesizes them with numpy (`python3 scripts/make-audio.py`), so they have no
licence of their own.

Remotion has its own [license](https://www.remotion.dev/license): free for individuals and small companies.
