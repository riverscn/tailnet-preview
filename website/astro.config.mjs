// @ts-check
import { defineConfig } from 'astro/config'

// Served by GitHub Pages as a project site: https://riverscn.github.io/tailnet-preview/
// A custom domain would set `site` to it and drop `base`.
export default defineConfig({
  site: 'https://riverscn.github.io',
  base: '/tailnet-preview',
  trailingSlash: 'ignore',
  i18n: {
    locales: ['en', 'zh-cn'],
    defaultLocale: 'en',
  },
})
