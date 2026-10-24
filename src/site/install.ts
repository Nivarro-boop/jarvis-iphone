import { latestRelease } from '../market/releases'
import { renderQr } from './qr'
import './site.css'

/**
 * „Runterladen“ fürs iPhone: Ohne App Store heißt das „Zum Home-Bildschirm“.
 * Die Seite zeigt je nach Gerät genau den passenden Weg.
 */
const $ = (id: string) => document.getElementById(id) as HTMLElement

const ua = navigator.userAgent
const ios = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
// Andere Browser auf iOS geben sich mit eigenen Kürzeln zu erkennen.
const safari = ios && !/CriOS|FxiOS|EdgiOS|OPiOS|GSA\//.test(ua)
const standalone = matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true

if (standalone) {
  $('install-lead').textContent = 'James ist schon installiert. Viel Freude damit!'
} else if (ios && safari) {
  $('ios-safari').hidden = false
} else if (ios) {
  $('ios-other').hidden = false
  $('copy-link').addEventListener('click', async () => {
    await navigator.clipboard.writeText(location.href).catch(() => undefined)
    $('copy-link').textContent = 'Kopiert – jetzt in Safari einfügen'
  })
} else {
  $('desktop').hidden = false
  renderQr($('qr'), location.href)
  void latestRelease('Nivarro-boop/James-Jarvis', 'Setup.*\\.exe$')
    .then(release => {
      const link = $('windows-download') as HTMLAnchorElement
      link.href = release.url
      link.textContent = `James für Windows laden · ${release.version}${release.sizeMb ? ` · ${release.sizeMb} MB` : ''}`
    })
    .catch(() => undefined)
}
