# Website

[简体中文](README.zh-CN.md)

The tailnet-preview website, built with [Astro](https://astro.build) and published to GitHub Pages at
<https://riverscn.github.io/tailnet-preview/> by [.github/workflows/pages.yml](../.github/workflows/pages.yml).
Its content follows the [README](../README.md); the documents in [docs/](../docs/) stay authoritative and the
site links to them.

```bash
cd website
npm ci
npm run dev      # http://localhost:4321/tailnet-preview/
npm run build    # writes dist/
```

- English pages are in `src/pages/`, Simplified Chinese ones in `src/pages/zh-cn/`. Change both together.
- The home page text is in `src/components/Home.astro`, shared strings in `src/i18n.ts`.
- The getting-started pages are Markdown: `src/pages/getting-started.md` and `src/pages/zh-cn/getting-started.md`.
- The promo video on the home page is in `public/video/`. It is made in [video/](../video/), which says how to
  update it.

Publishing needs GitHub Pages turned on once: the repository's Settings → Pages → Source: **GitHub Actions**.
