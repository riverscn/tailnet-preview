# Promo video

[简体中文](README.zh-CN.md)

A 44-second promo video for tailnet-preview (1920×1080, 30 fps, English and Simplified Chinese subtitles),
made with [Remotion](https://www.remotion.dev). Its text follows the [README](../README.md) and its colours
follow the [website](../website/).

```bash
cd video
npm ci
npm run studio   # preview and edit in the browser
npm run render   # writes out/tailnet-preview.mp4
npm run still    # writes out/poster.png, a single frame
```

- The scenes and their subtitles are listed in order in `src/Promo.tsx`; each scene is in `src/scenes.tsx`.
- Colours and fonts are in `src/theme.ts`. The fonts come from npm (`@fontsource/*`), so rendering works offline.
- Rendering downloads a headless Chrome the first time. To use one already installed, add
  `--browser-executable=/path/to/chrome` to the command.

Remotion has its own [license](https://www.remotion.dev/license): free for individuals and small companies.
