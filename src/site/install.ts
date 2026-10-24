import { latestRelease } from '../market/releases'
import { installationTarget } from '../market/installation'
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

const target = installationTarget(new URL(import.meta.env.BASE_URL, location.origin).href, location.search)
document.title = `${target.name} hinzufügen`
$('install-title').textContent = `${target.name} aufs iPhone`
const icon = $('install-icon') as HTMLImageElement
icon.src = target.icon
for (const link of document.querySelectorAll<HTMLAnchorElement>('[data-app-link]')) link.href = target.url
;($('profile-download') as HTMLAnchorElement).href = target.profile
$('show-profile').addEventListener('click', () => {
  $('ios-profile').hidden = false
  $('show-profile').hidden = true
})
if (standalone) {
  $('install-lead').textContent = 'Du hast die Anleitung im Vollbild geöffnet. Ob das App-Symbol bereits hinzugefügt wurde, kann diese Seite nicht feststellen.'
  $('ios-safari').hidden = false
} else if (ios && safari) {
  $('ios-safari').hidden = false
} else if (ios) {
  $('ios-other').hidden = false
  $('copy-link').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(target.guide)
      $('copy-link').textContent = 'Kopiert – jetzt in Safari einfügen'
    } catch { $('copy-link').textContent = 'Kopieren nicht möglich – Adresse aus der Adresszeile kopieren' }
  })
} else {
  $('desktop').hidden = false
  renderQr($('qr'), target.guide)
  void latestRelease('Nivarro-boop/James-Jarvis', 'Setup.*\\.exe$')
    .then(release => {
      const link = $('windows-download') as HTMLAnchorElement
      link.href = release.url
      link.textContent = `James für Windows laden · ${release.version}${release.sizeMb ? ` · ${release.sizeMb} MB` : ''}`
    })
    .catch(() => undefined)
}
