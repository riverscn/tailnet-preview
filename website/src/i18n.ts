export type Lang = 'en' | 'zh-cn'

export const REPO = 'https://github.com/riverscn/tailnet-preview'
export const DISCORD = 'https://discord.gg/mCevCGR9Pc'

const base = import.meta.env.BASE_URL.replace(/\/$/, '')

/** A path inside the site, for the given language: url('en', '/getting-started/'). */
export function url(lang: Lang, path = '/'): string {
  return `${base}${lang === 'en' ? '' : '/zh-cn'}${path}`
}

/** A document in the repository, in the given language: doc('zh-cn', 'docs/host-setup'). */
export function doc(lang: Lang, name: string, anchor = ''): string {
  const file = lang === 'en' ? `${name}.md` : `${name}.zh-CN.md`
  return `${REPO}/blob/main/${file}${anchor}`
}

/** The same page in the other language. */
export function otherLang(lang: Lang, pathname: string): { lang: Lang; href: string; label: string } {
  const rest = pathname.slice(base.length).replace(/^\/zh-cn(?=\/|$)/, '') || '/'
  return lang === 'en'
    ? { lang: 'zh-cn', href: url('zh-cn', rest), label: '简体中文' }
    : { lang: 'en', href: url('en', rest), label: 'English' }
}

export const ui = {
  en: {
    htmlLang: 'en',
    tagline: 'Per-PR preview environments on your own host, reachable only via your tailnet.',
    nav: { home: 'Home', start: 'Getting started', docs: 'Docs', github: 'GitHub' },
    footer:
      'MIT licensed. Tailscale is a trademark of Tailscale Inc. This project is not affiliated with or endorsed by Tailscale.',
  },
  'zh-cn': {
    htmlLang: 'zh-CN',
    tagline: '在你自己的主机上，为每个 PR 起一套试用环境，只能通过你的 tailnet 访问。',
    nav: { home: '首页', start: '快速开始', docs: '文档', github: 'GitHub' },
    footer: 'MIT 许可证。Tailscale 是 Tailscale Inc. 的商标。本项目与 Tailscale 无关联，也未获其背书。',
  },
} as const
