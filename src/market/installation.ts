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

/**
 * Netlify spiegelt GitHub Pages nur. Installiert und verlinkt wird immer die
 * GitHub-Pages-Adresse: Speicher (Schlüssel, Verlauf, Fähigkeiten) hängt an
 * der Adresse, und das Profil legt ohnehin diese auf den Home-Bildschirm.
 */
export const APP_HOME = 'https://nivarro-boop.github.io/jarvis-iphone/'

export function appRootFor(page: { origin: string; hostname: string }, base: string): string {
  return page.hostname.endsWith('netlify.app') ? APP_HOME : new URL(base, page.origin).href
}
