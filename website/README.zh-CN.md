# 官网

[English](README.md)

tailnet-preview 的官网，用 [Astro](https://astro.build) 构建，由 [.github/workflows/pages.yml](../.github/workflows/pages.yml)
发布到 GitHub Pages：<https://riverscn.github.io/tailnet-preview/>。内容以 [README](../README.zh-CN.md) 为准；[docs/](../docs/)
里的文档仍是权威版本，官网链接到它们。

```bash
cd website
npm ci
npm run dev      # http://localhost:4321/tailnet-preview/
npm run build    # 输出到 dist/
```

- 英文页面在 `src/pages/`，简体中文页面在 `src/pages/zh-cn/`。两个版本一起改。
- 首页文字在 `src/components/Home.astro`，公共文案在 `src/i18n.ts`。
- 快速开始页是 Markdown：`src/pages/getting-started.md` 和 `src/pages/zh-cn/getting-started.md`。
- 首页的宣传视频在 `public/video/`。它在 [video/](../video/) 里制作，那里写了怎么更新。

发布前需要开启一次 GitHub Pages：仓库的 Settings → Pages → Source 选 **GitHub Actions**。
