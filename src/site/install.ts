import { latestRelease } from '../market/releases'
import { appRootFor, installationTarget } from '../market/installation'
import { renderQr } from './qr'
import './site.css'

/**
 * „James laden“: eine Seite für alle Geräte. Das passende steht oben und ist
 * markiert; am iPhone folgt gleich der Weg über „Zum Home-Bildschirm“, ein
 * Web-Clip-Profil ist nur die Alternative. Mit `?target=store` geht es um
 * den James Store statt um James.
 */
const $ = (id: string) => document.getElementById(id) as HTMLElement

const ua = navigator.userAgent
const ios = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
// Andere Browser auf iOS geben sich mit eigenen Kürzeln zu erkennen.
const safari = ios && !/CriOS|FxiOS|EdgiOS|OPiOS|GSA\//.test(ua)
const windows = !ios && /Windows/.test(ua)
const standalone = matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true

const target = installationTarget(appRootFor(location, import.meta.env.BASE_URL), location.search)
for (const link of document.querySelectorAll<HTMLAnchorElement>('[data-app-link]')) link.href = target.url
;($('profile-download') as HTMLAnchorElement).href = target.profile
$('show-profile').addEventListener('click', () => {
  $('ios-profile').hidden = false
  $('show-profile').hidden = true
})

// Nur der Store: Windows und Uhr gehören hier nicht dazu.
if (target.name !== 'James') {
  document.title = `${target.name} hinzufügen`
  $('install-title').textContent = `${target.name} aufs iPhone`
  ;($('install-icon') as HTMLImageElement).src = target.icon
  $('install-lead').textContent = 'Den Web-Store als eigenes Symbol auf den Home-Bildschirm legen.'
  $('iphone-name').textContent = target.name
  $('iphone-text').textContent = 'Apps und Fähigkeiten für James, wie im App Store – als Web-App.'
  $('ios-steps-title').textContent = `${target.name} in drei Tipps`
  $('p-windows').hidden = true
  $('p-watch').hidden = true
}

function recommend(id: string): void {
  const card = $(id)
  card.classList.add('recommended')
  $('platforms').prepend(card)
}

if (ios) {
  recommend('p-iphone')
  $('windows-elsewhere').hidden = false
  if (standalone) {
    $('install-lead').textContent = 'Du hast die Anleitung im Vollbild geöffnet. Ob das App-Symbol bereits hinzugefügt wurde, kann diese Seite nicht feststellen.'
    $('ios-safari').hidden = false
  } else if (safari) {
    $('ios-safari').hidden = false
  } else {
    $('ios-other').hidden = false
    $('copy-link').addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(target.guide)
        $('copy-link').textContent = 'Kopiert – jetzt in Safari einfügen'
      } catch {
        $('copy-link').textContent = 'Kopieren nicht möglich – Adresse aus der Adresszeile kopieren'
      }
    })
  }
} else {
  if (windows) recommend('p-windows')
  // Am Rechner geht es am iPhone weiter: QR-Code statt Anleitung.
  $('iphone-qr').hidden = false
  $('iphone-get').hidden = true
  renderQr($('qr'), target.guide)
}

void latestRelease('Nivarro-boop/James-Jarvis', 'Setup.*\\.exe$')
  .then(release => {
    const link = $('windows-download') as HTMLAnchorElement
    link.href = release.url
    link.textContent = `Für Windows laden · ${release.version}`
    $('windows-meta').textContent = ['Windows 10 oder 11 · 64 Bit', release.sizeMb ? `${release.sizeMb} MB` : '', new Date(release.date).toLocaleDateString('de-DE', { day: 'numeric', month: 'short', year: 'numeric' })]
      .filter(Boolean)
      .join(' · ')
  })
  .catch(() => undefined)
