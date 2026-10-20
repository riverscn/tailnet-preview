# 宣传视频

[English](README.md)

tailnet-preview 的 44 秒宣传视频（1920×1080，30 fps，中英双语字幕），用 [Remotion](https://www.remotion.dev)
制作。文字以 [README](../README.zh-CN.md) 为准，配色和[官网](../website/)一致。

```bash
cd video
npm ci
npm run studio   # 在浏览器里预览和修改
npm run render   # 生成 out/tailnet-preview.mp4
npm run still    # 生成 out/poster.png，单帧封面
```

- 场景和字幕按顺序列在 `src/Promo.tsx` 里，每个场景的画面在 `src/scenes.tsx`。
- 配色和字体在 `src/theme.ts`。字体来自 npm（`@fontsource/*`），离线也能渲染。
- 第一次渲染会下载一个无头 Chrome。要用已经装好的，在命令后加 `--browser-executable=/path/to/chrome`。

Remotion 有自己的[许可协议](https://www.remotion.dev/license)：个人和小公司可以免费使用。
