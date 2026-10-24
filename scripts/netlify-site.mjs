/**
 * Baut die Netlify-Site „james-marktplatz.netlify.app“ — den Marktplatz als
 * eigene Adresse.
 *
 * Die Site enthält fast nichts selbst: Sie reicht alles live von GitHub Pages
 * durch (siehe `_redirects`). Jeder Push auf `main` ist damit sofort auch
 * dort zu sehen, ohne zweites Deploy und ohne Netlify-Schlüssel in GitHub.
 *
 * Nur das Installationsprofil liegt hier selbst: GitHub Pages schickt
 * `.mobileconfig` als `application/octet-stream`, und damit bietet Safari es
 * nicht zur Installation an. Netlify setzt den richtigen Typ (`_headers`).
 *
 * Aufruf: npm run netlify. Direktes `--prod` lehnt Netlify für dieses Konto ab
 * (Forbidden); deshalb Entwurf hochladen und per API veröffentlichen.
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { webClipProfile } from './webclip.mjs'

const out = fileURLToPath(new URL('../netlify-site/', import.meta.url))
const pages = 'https://nivarro-boop.github.io/jarvis-iphone'

rmSync(out, { recursive: true, force: true })
mkdirSync(`${out}jarvis-iphone`, { recursive: true })

const icon = name => fileURLToPath(new URL(`../public/icons/${name}`, import.meta.url))
writeFileSync(`${out}jarvis-iphone/james.mobileconfig`, webClipProfile({ url: `${pages}/`, iconFile: icon('apple-touch-icon.png') }))
writeFileSync(
  `${out}jarvis-iphone/store.mobileconfig`,
  webClipProfile({
    id: 'store',
    label: 'James Store',
    url: `${pages}/store/`,
    iconFile: icon('store-180.png'),
    description: 'Legt den James Store als App auf den Home-Bildschirm. Enthält nur Symbol und Adresse.'
  })
)

writeFileSync(
  `${out}_headers`,
  `/jarvis-iphone/*.mobileconfig
  Content-Type: application/x-apple-aspen-config
  Cache-Control: no-cache
`
)

// Eigene Dateien gehen vor; alles andere kommt von GitHub Pages.
writeFileSync(
  `${out}_redirects`,
  `/                 /jarvis-iphone/store/          302
/store            /jarvis-iphone/store/          302
/marktplatz       /jarvis-iphone/marktplatz/     302
/laden            /jarvis-iphone/installieren/   302
/uhr              /jarvis-iphone/uhr/            302
/app              /jarvis-iphone/                302
/datenschutz      /jarvis-iphone/datenschutz/    302
/jarvis-iphone/*  ${pages}/:splat   200
`
)

console.log(`Netlify-Site gebaut: ${out}`)
