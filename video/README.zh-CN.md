# 宣传视频

[English](README.md)

tailnet-preview 的宣传视频，约 80 秒，1920×1080，30 fps，用 [Remotion](https://www.remotion.dev) 制作。
有两个版本，画面相同：`PromoZh` 是中文配音，`PromoEn` 是英文配音。两个版本都有中英双语字幕、配乐和音效。
文字以 [README](../README.zh-CN.md) 为准，配色和[官网](../website/)一致。片中的 GitHub 页面是模拟的，
`acme/myapp` 和它的 PR 都是虚构的。

```bash
cd video
npm ci
npm run studio      # 在浏览器里预览和修改
npm run render      # 生成 out/tailnet-preview-zh.mp4 和 out/tailnet-preview-en.mp4
```

第一次渲染会下载一个无头 Chrome。要用已经装好的，在 `remotion render` 命令后加
`--browser-executable=/path/to/chrome`。

## 官网上的视频

官网首页播放的是两个版本的压缩版，放在 `website/public/video/`。渲染之后用 `npm run publish`（需要 ffmpeg）
更新它们，再提交那里生成的文件。

## 文件在哪

- `src/script.json`：按顺序列出各个镜头，以及每个镜头的中英文旁白。字幕显示的就是这些文字。
- `src/scenes.tsx`：每个镜头的画面。`src/github.tsx` 画模拟的 GitHub 页面。
- `src/Promo.tsx`：把镜头、旁白、配乐和字幕拼在一起。每个镜头的长度跟随它的旁白，且不短于 `minFrames`。
- `public/voiceover/`：旁白音频，`src/voiceover.json` 记录每句的长度。
- `public/audio/`：配乐和音效。
- `scripts/`：生成音频、导入配音、把视频发布到官网的脚本。

## 修改旁白

改完 `src/script.json` 后要重新生成语音。

英文旁白用 [Kokoro](https://github.com/hexgrad/kokoro)（Apache-2.0）在 CPU 上生成，需要 Python 3.10 到 3.12：

```bash
python3.12 -m venv .venv
.venv/bin/pip install "kokoro>=0.9.4" "misaki[zh,en]" soundfile
.venv/bin/python scripts/voiceover.py en
```

中文旁白用 [ElevenLabs](https://elevenlabs.io) 生成（音色 “Yichen Wang”，模型 `eleven_v4`），中文听起来比
Kokoro 自然。每句存成一个 mp3，以它在 `src/script.json` 里的 `id` 命名（例如 `intro.mp3`），放进一个文件夹，
再导入。导入时会统一响度并记录每句的长度：

```bash
scripts/import-voiceover.sh zh path/to/folder
```

没有 ElevenLabs 账号的话，`scripts/voiceover.py zh` 仍然可以用 Kokoro 生成中文旁白。

## 配乐和音效

`scripts/make-audio.py` 用 numpy 合成（`python3 scripts/make-audio.py`），没有另外的版权许可问题。

Remotion 有自己的[许可协议](https://www.remotion.dev/license)：个人和小公司可以免费使用。
