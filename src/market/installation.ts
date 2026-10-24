/** A Web Clip is a website shortcut, not a native app installation. */
export function installationTarget(base: string, search: string) {
  const root = new URL(base)
  const store = new URLSearchParams(search).get('target') === 'store'
  return {
    name: store ? 'James Store' : 'James',
    url: new URL(store ? 'store/' : './', root).href,
    icon: new URL(store ? 'icons/store-180.png' : 'icons/apple-touch-icon.png', root).href,
    profile: `https://james-marktplatz.netlify.app/jarvis-iphone/${store ? 'store' : 'james'}.mobileconfig`,
    guide: new URL(`installieren/${store ? '?target=store' : ''}`, root).href
  }
}
