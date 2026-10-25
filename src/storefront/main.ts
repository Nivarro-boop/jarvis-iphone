import { fetchCatalog, type AppEntry, type Catalog, type Skill } from '../market/catalog'
import { latestRelease } from '../market/releases'
import { fetchRemote } from '../update'
import { appRootFor } from '../market/installation'
import { renderQr } from '../site/qr'
import './store.css'

/**
 * James Store — ein Store wie Epic oder der App Store, nur ohne App Store.
 *
 * Web-Apps öffnen eine Anleitung zum Home-Bildschirm; Profile sind optional.
 * Für Windows öffnet der Store den neuesten Installer aus den GitHub-Releases;
 * für die Apple Watch die Anleitung zum Siri-Kurzbefehl. Katalog und
 * Versionen kommen live aus GitHub.
 */

const base = import.meta.env.BASE_URL
const appRoot = new URL(base, location.origin).href
/** Links in die App gehen immer an die Adresse, die auch installiert wird. */
const appHome = appRootFor(location, base)
const LIBRARY = 'james.store.library'

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
const el = <K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, ...children: (Node | string)[]) => {
  const node = Object.assign(document.createElement(tag), props)
  node.append(...children)
  return node
}
const dateDe = (iso: string) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('de-DE', { day: 'numeric', month: 'short', year: 'numeric' })
}

const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
const standalone = matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true

let catalog: Catalog = { updated: '', skills: [], apps: [] }
/** Live-Versionen, sobald bekannt. */
const versions = new Map<string, string>()
/** Gewählte Kategorie der Fähigkeiten auf „Entdecken“; leer = alle. */
let category = ''

// ─────────────────────────────────────────────────────────────
// Bibliothek: was hier geholt wurde
// ─────────────────────────────────────────────────────────────

function library(): Record<string, number> {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(LIBRARY) ?? '{}')
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
    return Object.fromEntries(Object.entries(value).filter(([id, at]) => /^[a-z0-9-]{2,41}$/.test(id) && typeof at === 'number' && Number.isFinite(at)))
  } catch {
    return {}
  }
}

function addToLibrary(id: string): void {
  try {
    localStorage.setItem(LIBRARY, JSON.stringify({ ...library(), [id]: Date.now() }))
  } catch {
    // ohne Speicher keine Bibliothek
  }
}

function removeFromLibrary(id: string): void {
  const next = library()
  delete next[id]
  try {
    localStorage.setItem(LIBRARY, JSON.stringify(next))
  } catch {
    // egal
  }
}

// ─────────────────────────────────────────────────────────────
// Holen
// ─────────────────────────────────────────────────────────────

interface Action {
  label: string
  href: string
  primary?: boolean
  external?: boolean
}

function actionsFor(app: AppEntry): Action[] {
  const actions: Action[] = []
  if (app.kind === 'self') {
    actions.push({ label: ios ? 'Zum Home-Bildschirm' : 'Am iPhone einrichten', href: `${appRoot}installieren/`, primary: true })
    actions.push({ label: 'Im Browser öffnen', href: appHome })
  } else if (app.kind === 'guide' && app.url) {
    actions.push({ label: 'Einrichten', href: `${appRoot}${app.url}`, primary: true })
  } else if (app.repo) {
    actions.push({ label: 'Herunterladen', href: `https://github.com/${app.repo}/releases/latest`, primary: true, external: true })
  }
  if (app.watch) actions.push({ label: 'Für Apple Watch', href: `${appRoot}${app.watch}` })
  return actions
}

function getButton(app: AppEntry, small = false): HTMLElement {
  const [first] = actionsFor(app)
  if (!first) return el('span')
  const owned = library()[app.id]
  const link = el('a', { className: small ? 'get small' : 'get', href: first.href, textContent: owned && app.kind !== 'github-release' ? 'Öffnen' : small && first.label.length > 12 ? 'Holen' : first.label })
  if (owned && app.kind === 'self') link.href = appHome
  link.addEventListener('click', event => {
    event.stopPropagation()
    addToLibrary(app.id)
  })
  return link
}

const skillLink = (skill: Skill) => `${appHome}#skill=${encodeURIComponent(skill.id)}`

function addButton(skill: Skill): HTMLElement {
  const link = el('a', { className: 'get small', href: skillLink(skill), textContent: 'Hinzufügen' })
  link.addEventListener('click', event => event.stopPropagation())
  return link
}

// ─────────────────────────────────────────────────────────────
// Bilder: Apps haben Symbole, Fähigkeiten bekommen eines aus Kategorie und Anfangsbuchstabe
// ─────────────────────────────────────────────────────────────

const iconOf = (app: AppEntry) => `${base}${app.icon ?? 'icons/icon-192.png'}`

/** Gleiche Kategorie, gleiche Farbe — ohne Farbliste im Katalog. */
function hueOf(text: string): number {
  let hash = 7
  for (const char of text) hash = (hash * 31 + char.charCodeAt(0)) % 360
  return hash
}

const skillAccent = (skill: Skill) => `hsl(${hueOf(skill.category)} 65% 52%)`

function skillIcon(skill: Skill): string {
  const hue = hueOf(skill.category)
  const letter = (skill.name.slice(0, 1) || '?').replace(/[&<>"]/g, c => `&#${c.charCodeAt(0)};`)
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0" stop-color="hsl(${hue} 72% 60%)"/><stop offset="1" stop-color="hsl(${(hue + 40) % 360} 60% 30%)"/></linearGradient></defs>` +
    `<rect width="120" height="120" rx="27" fill="url(#g)"/>` +
    `<text x="60" y="80" font-family="-apple-system,Segoe UI,sans-serif" font-size="60" font-weight="800" fill="#fff" text-anchor="middle">${letter}</text></svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

// ─────────────────────────────────────────────────────────────
// Entdecken
// ─────────────────────────────────────────────────────────────

function heroCard(app: AppEntry): HTMLElement {
  const card = el(
    'article',
    { className: 'hero-card' },
    el('img', { className: 'hero-icon', src: iconOf(app), alt: '' }),
    el('div', { className: 'hero-text' }, el('span', { className: 'eyebrow', textContent: app.platform }), el('h2', { textContent: app.name }), el('p', { textContent: app.tagline ?? app.description })),
    getButton(app)
  )
  card.style.setProperty('--accent', app.accent ?? '#2f86ef')
  card.addEventListener('click', () => openDetail(app))
  return card
}

function appTile(app: AppEntry): HTMLElement {
  const tile = el(
    'article',
    { className: 'tile' },
    el('div', { className: 'tile-art' }, el('img', { src: iconOf(app), alt: '' })),
    el('h3', { textContent: app.name }),
    el('p', { textContent: app.platform }),
    el('div', { className: 'tile-foot' }, el('span', { className: 'price', textContent: 'Kostenlos' }), getButton(app, true))
  )
  tile.style.setProperty('--accent', app.accent ?? '#2f86ef')
  tile.addEventListener('click', () => openDetail(app))
  return tile
}

function skillTile(skill: Skill): HTMLElement {
  const tile = el(
    'article',
    { className: 'tile skill' },
    el('div', { className: 'tile-art' }, el('img', { src: skillIcon(skill), alt: '' })),
    el('h3', { textContent: skill.name }),
    el('p', { textContent: skill.category }),
    el('div', { className: 'tile-foot' }, el('span', { className: 'price', textContent: 'für James' }), addButton(skill))
  )
  tile.style.setProperty('--accent', skillAccent(skill))
  tile.addEventListener('click', () => openSkill(skill))
  return tile
}

function renderSkillRail(): void {
  const categories = [...new Set(catalog.skills.map(s => s.category))]
  $('skill-filter').replaceChildren(
    ...['', ...categories].map(name => {
      const chip = el('button', { type: 'button', className: 'filter', textContent: name || 'Alle' })
      chip.setAttribute('aria-pressed', String(name === category))
      chip.addEventListener('click', () => {
        category = name
        renderSkillRail()
      })
      return chip
    })
  )
  $('skills-rail').replaceChildren(...catalog.skills.filter(s => !category || s.category === category).map(skillTile))
}

function renderDiscover(): void {
  const featured = catalog.apps.filter(a => a.tagline)
  $('hero').replaceChildren(...featured.map(heroCard))
  $('apps-rail').replaceChildren(...catalog.apps.map(appTile))
  renderSkillRail()
  $('install-store').hidden = !ios || standalone
}

async function renderNews(): Promise<void> {
  const remote = await fetchRemote(base)
  const items = (remote?.notes ?? []).slice(0, 5)
  $('news').replaceChildren(...items.map(n => el('li', { textContent: n })))
  if (remote) {
    versions.set('james-iphone', remote.version)
    $('store-version').textContent = `v${remote.version}`
  }
}

// ─────────────────────────────────────────────────────────────
// Detailseite — für Apps und Fähigkeiten dieselbe
// ─────────────────────────────────────────────────────────────

const detail = $<HTMLDialogElement>('detail')
/** Späte Antworten (Release-Infos) gehören nur zur Detailseite, die sie angefordert hat. */
let detailRevision = 0
detail.addEventListener('close', () => {
  detailRevision++
})

/**
 * Jede Detailseite ist ein Eintrag im Verlauf: Wischen vom Rand und die
 * Zurück-Taste schließen sie, und der Link lässt sich teilen. Schließen geht
 * deshalb immer über den Verlauf; popstate macht das Blatt zu.
 */
function closeDetail(): void {
  if ((history.state as { detail?: boolean } | null)?.detail) history.back()
  else detail.close()
}
$('detail-close').addEventListener('click', closeDetail)
detail.addEventListener('cancel', event => {
  event.preventDefault()
  closeDetail()
})
window.addEventListener('popstate', () => {
  if (detail.open) detail.close()
})

function shareButton(title: string, query: string): HTMLElement {
  const url = `${location.origin}${location.pathname}?${query}`
  const button = el('button', { type: 'button', className: 'ghost wide', textContent: 'Teilen' })
  button.addEventListener('click', async () => {
    if (navigator.share) {
      await navigator.share({ title, url }).catch(() => undefined)
      return
    }
    const copied = await navigator.clipboard
      ?.writeText(url)
      .then(() => true)
      .catch(() => false)
    button.textContent = copied ? 'Link kopiert' : url
  })
  return button
}

function fact(name: string, value: string): Node[] {
  return [el('dt', { textContent: name }), el('dd', { textContent: value })]
}

function showDetail(options: { accent: string; icon: string; name: string; tagline: string; chips: string[]; text: string; query: string; qr: string }): void {
  $('detail-status').textContent = ''
  // Am Rechner: weiter am iPhone per QR-Code.
  $('detail-qr').hidden = ios
  if (!ios) renderQr($('app-qr'), options.qr)
  $('detail-hero').style.setProperty('--accent', options.accent)
  $<HTMLImageElement>('detail-icon').src = options.icon
  $('detail-name').textContent = options.name
  $('detail-tagline').textContent = options.tagline
  $('detail-chips').replaceChildren(...options.chips.map(text => el('span', { className: 'chip', textContent: text })))
  $('detail-text').textContent = options.text
  $('detail-examples').replaceChildren()
  $('detail-examples-block').hidden = true
  $('detail-hint').hidden = true
  if (!detail.open) {
    history.pushState({ detail: true }, '', `?${options.query}`)
    detail.showModal()
  }
  detail.scrollTop = 0
}

function openDetail(app: AppEntry): void {
  const revision = ++detailRevision
  showDetail({
    accent: app.accent ?? '#2f86ef',
    icon: iconOf(app),
    name: app.name,
    tagline: app.tagline ?? '',
    chips: [app.platform, app.kind === 'self' ? 'Web-App' : app.kind === 'guide' ? 'Kurzbefehl-Anleitung' : 'Windows-Installer', 'Kostenlos', ...(app.watch ? ['Apple Watch'] : [])],
    text: app.description,
    query: `app=${encodeURIComponent(app.id)}`,
    qr: app.kind === 'guide' && app.url ? new URL(app.url, appRoot).href : `${appRoot}store/?app=${encodeURIComponent(app.id)}`
  })
  $('detail-actions').replaceChildren(
    ...actionsFor(app).map(action => {
      const link = el('a', {
        className: action.primary ? 'get wide' : 'ghost wide',
        href: action.href,
        textContent: action.label,
        ...(action.external ? { target: '_blank', rel: 'noopener' } : {})
      })
      link.addEventListener('click', () => {
        if (action.primary) addToLibrary(app.id)
      })
      return link
    }),
    shareButton(app.name, `app=${encodeURIComponent(app.id)}`)
  )
  const facts = $('detail-facts')
  facts.replaceChildren(...fact('Preis', 'Kostenlos'), ...fact('Plattform', app.platform))
  const known = versions.get(app.id)
  if (known) facts.append(...fact('Version', known))
  if (app.repo && !known) {
    void latestRelease(app.repo, app.asset)
      .then(release => {
        versions.set(app.id, release.version)
        if (revision !== detailRevision || !detail.open) return
        facts.append(...fact('Version', `${release.version} · ${dateDe(release.date)}`))
        if (release.sizeMb) facts.append(...fact('Größe', `${release.sizeMb} MB`))
        const primary = $('detail-actions').querySelector<HTMLAnchorElement>('.get')
        if (primary) primary.href = release.url
      })
      .catch(() => undefined)
  }
}

function openSkill(skill: Skill): void {
  detailRevision++
  showDetail({
    accent: skillAccent(skill),
    icon: skillIcon(skill),
    name: skill.name,
    tagline: skill.category,
    chips: ['Fähigkeit', 'Kostenlos', `v${skill.version}`],
    text: skill.description,
    query: `skill=${encodeURIComponent(skill.id)}`,
    qr: `${appRoot}store/?skill=${encodeURIComponent(skill.id)}`
  })
  if (skill.examples.length) {
    $('detail-examples').replaceChildren(...skill.examples.map(e => el('li', { textContent: e })))
    $('detail-examples-block').hidden = false
  }
  const add = el('a', { className: 'get wide', href: skillLink(skill), textContent: 'Zu James hinzufügen' })
  $('detail-actions').replaceChildren(add, shareButton(skill.name, `skill=${encodeURIComponent(skill.id)}`))
  $('detail-hint').textContent = `Oder in James einfach sagen: „Installiere ${skill.name}“.`
  $('detail-hint').hidden = false
  $('detail-facts').replaceChildren(...fact('Preis', 'Kostenlos'), ...fact('Kategorie', skill.category), ...fact('Version', skill.version), ...fact('Von', skill.author))
}

// ─────────────────────────────────────────────────────────────
// Suche und Bibliothek
// ─────────────────────────────────────────────────────────────

function row(title: string, subtitle: string, icon: string, action: HTMLElement, onOpen?: () => void): HTMLElement {
  const item = el('article', { className: 'row' }, el('div', { className: 'row-art' }, el('img', { src: icon, alt: '' })), el('div', { className: 'row-text' }, el('h3', { textContent: title }), el('p', { textContent: subtitle })), action)
  if (onOpen) item.addEventListener('click', onOpen)
  return item
}

function renderSearch(): void {
  const q = $<HTMLInputElement>('search').value.trim().toLowerCase()
  const match = (...texts: string[]) => !q || texts.some(t => t.toLowerCase().includes(q))
  const apps = catalog.apps.filter(a => match(a.name, a.platform, a.description, a.tagline ?? ''))
  const skills = catalog.skills.filter(s => match(s.name, s.category, s.description, ...s.examples))
  $('search-results').replaceChildren(
    ...apps.map(a => row(a.name, a.platform, iconOf(a), getButton(a, true), () => openDetail(a))),
    ...skills.map(s => row(s.name, `Fähigkeit · ${s.category}`, skillIcon(s), addButton(s), () => openSkill(s)))
  )
  if (!apps.length && !skills.length) {
    const suggest = el('a', { href: 'https://github.com/Nivarro-boop/jarvis-iphone/issues/new?template=faehigkeit.yml', target: '_blank', rel: 'noopener', textContent: 'vorschlagen' })
    $('search-results').append(el('p', { className: 'empty' }, 'Nichts gefunden. Versuche iPhone, Watch oder eine Fähigkeit – oder eine neue ', suggest, '.'))
  }
}
$('search').addEventListener('input', renderSearch)

function renderLibrary(): void {
  const owned = library()
  const apps = catalog.apps.filter(a => owned[a.id]).sort((a, b) => owned[b.id] - owned[a.id])
  $('library').replaceChildren(
    ...apps.map(app => {
      const remove = el('button', { type: 'button', className: 'ghost small', textContent: 'Entfernen' })
      remove.addEventListener('click', event => {
        event.stopPropagation()
        removeFromLibrary(app.id)
        renderLibrary()
      })
      const actions = el('div', { className: 'row-actions' }, getButton(app, true), remove)
      const version = versions.get(app.id)
      return row(app.name, `${app.platform}${version ? ` · ${version} verfügbar` : ''}`, iconOf(app), actions, () => openDetail(app))
    })
  )
  $('library-empty').hidden = apps.length > 0
}

// ─────────────────────────────────────────────────────────────
// Tabs und Start
// ─────────────────────────────────────────────────────────────

const tabs = document.querySelectorAll<HTMLButtonElement>('.tabbar button')
function show(view: string): void {
  for (const tab of tabs) {
    if (tab.dataset.view === view) tab.setAttribute('aria-current', 'page')
    else tab.removeAttribute('aria-current')
  }
  for (const name of ['discover', 'search', 'library']) $(`view-${name}`).hidden = name !== view
  if (view === 'search') {
    renderSearch()
    $('search').focus()
  }
  if (view === 'library') renderLibrary()
  window.scrollTo(0, 0)
}
for (const tab of tabs) tab.addEventListener('click', () => show(tab.dataset.view ?? 'discover'))

function load(): void {
  $('hero').replaceChildren(el('div', { className: 'hero-card skeleton' }))
  fetchCatalog(base)
    .then(result => {
      catalog = result
      renderDiscover()
      // Geteilte Links: ?app=james-windows oder ?skill=koch
      const params = new URLSearchParams(location.search)
      const app = catalog.apps.find(a => a.id === params.get('app'))
      const skill = catalog.skills.find(s => s.id === params.get('skill'))
      if (app || skill) history.replaceState(null, '', location.pathname)
      if (app) openDetail(app)
      else if (skill) openSkill(skill)
    })
    .catch(error => {
      const retry = el('button', { type: 'button', className: 'get', textContent: 'Nochmal versuchen' })
      retry.addEventListener('click', load)
      $('hero').replaceChildren(
        el('div', { className: 'offline' }, el('strong', { textContent: 'Store gerade nicht erreichbar' }), el('p', { textContent: error instanceof Error ? error.message : String(error) }), retry)
      )
    })
}
load()
void renderNews()

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register(`${base}sw.js`).catch(() => undefined)
}
