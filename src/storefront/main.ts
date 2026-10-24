import { fetchCatalog, type AppEntry, type Catalog, type Skill } from '../market/catalog'
import { latestRelease } from '../market/releases'
import { fetchRemote } from '../update'
import { renderQr } from '../site/qr'
import './store.css'

/**
 * James Store — ein Store wie Epic oder der App Store, nur ohne App Store.
 *
 * Web-Apps öffnen eine Anleitung zum Home-Bildschirm; Profile sind optional.
 * Für Windows öffnet der Store den neuesten
 * Installer aus den GitHub-Releases; für die Apple Watch die Anleitung zum
 * Siri-Kurzbefehl. Katalog und Versionen kommen live aus GitHub.
 */

const base = import.meta.env.BASE_URL
const appRoot = new URL(base, location.origin).href
/** Profile nur von Netlify: GitHub Pages liefert sie mit falschem Dateityp aus. */
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
    actions.push({ label: 'Im Browser öffnen', href: appRoot })
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
  if (owned && app.kind === 'self') link.href = appRoot
  link.addEventListener('click', event => {
    event.stopPropagation()
    addToLibrary(app.id)
  })
  return link
}

// ─────────────────────────────────────────────────────────────
// Entdecken
// ─────────────────────────────────────────────────────────────

const iconOf = (app: AppEntry) => `${base}${app.icon ?? 'icons/icon-192.png'}`

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
  const link = el('a', { className: 'get small', href: `${appRoot}#skill=${encodeURIComponent(skill.id)}`, textContent: 'Hinzufügen' })
  return el(
    'article',
    { className: 'tile skill' },
    el('div', { className: 'tile-art letter', textContent: skill.name.slice(0, 1) }),
    el('h3', { textContent: skill.name }),
    el('p', { textContent: skill.category }),
    el('div', { className: 'tile-foot' }, el('span', { className: 'price', textContent: 'für James' }), link)
  )
}

function renderDiscover(): void {
  const featured = catalog.apps.filter(a => a.tagline)
  $('hero').replaceChildren(...featured.map(heroCard))
  $('apps-rail').replaceChildren(...catalog.apps.map(appTile))
  $('skills-rail').replaceChildren(...catalog.skills.map(skillTile))
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
// Detailseite
// ─────────────────────────────────────────────────────────────

let detailRevision = 0
const detail = $<HTMLDialogElement>('detail')
detail.addEventListener('close', () => { detailRevision++ })
$('detail-close').addEventListener('click', () => detail.close())

function openDetail(app: AppEntry): void {
  const revision = ++detailRevision
  $('detail-status').textContent = ''
  $('detail-qr').hidden = ios
  if (!ios) renderQr($('app-qr'), app.kind === 'guide' ? new URL(app.url!, appRoot).href : `${appRoot}store/?app=${encodeURIComponent(app.id)}`)
  $('detail-hero').style.setProperty('--accent', app.accent ?? '#2f86ef')
  $<HTMLImageElement>('detail-icon').src = iconOf(app)
  $('detail-name').textContent = app.name
  $('detail-tagline').textContent = app.tagline ?? ''
  $('detail-chips').replaceChildren(
    el('span', { className: 'chip', textContent: app.platform }),
    el('span', { className: 'chip', textContent: app.kind === 'self' ? 'Web-App' : app.kind === 'guide' ? 'Kurzbefehl-Anleitung' : 'Windows-Installer' }),
    el('span', { className: 'chip', textContent: 'Kostenlos' }),
    ...(app.watch ? [el('span', { className: 'chip', textContent: 'Apple Watch' })] : [])
  )
  $('detail-text').textContent = app.description
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
    })
  )
  const facts = $('detail-facts')
  facts.replaceChildren(el('dt', { textContent: 'Preis' }), el('dd', { textContent: 'Kostenlos' }), el('dt', { textContent: 'Plattform' }), el('dd', { textContent: app.platform }))
  const known = versions.get(app.id)
  if (known) facts.append(el('dt', { textContent: 'Version' }), el('dd', { textContent: known }))
  if (app.repo && !known) {
    void latestRelease(app.repo, app.asset)
      .then(release => {
        versions.set(app.id, release.version)
        if (revision !== detailRevision || !detail.open) return
        facts.append(el('dt', { textContent: 'Version' }), el('dd', { textContent: `${release.version} · ${dateDe(release.date)}` }))
        if (release.sizeMb) facts.append(el('dt', { textContent: 'Größe' }), el('dd', { textContent: `${release.sizeMb} MB` }))
        const primary = $('detail-actions').querySelector<HTMLAnchorElement>('.get')
        if (primary) primary.href = release.url
      })
      .catch(() => undefined)
  }
  detail.showModal()
  detail.scrollTop = 0
}

// ─────────────────────────────────────────────────────────────
// Suche und Bibliothek
// ─────────────────────────────────────────────────────────────

function row(title: string, subtitle: string, icon: string | null, action: HTMLElement, onOpen?: () => void): HTMLElement {
  const art = icon ? el('img', { src: icon, alt: '' }) : el('div', { className: 'letter', textContent: title.slice(0, 1) })
  const item = el('article', { className: 'row' }, el('div', { className: 'row-art' }, art), el('div', { className: 'row-text' }, el('h3', { textContent: title }), el('p', { textContent: subtitle })), action)
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
    ...skills.map(s =>
      row(s.name, `Fähigkeit · ${s.category}`, null, el('a', { className: 'get small', href: `${appRoot}#skill=${encodeURIComponent(s.id)}`, textContent: 'Hinzufügen' }))
    )
  )
  if (!apps.length && !skills.length) $('search-results').append(el('p', { className: 'empty', textContent: 'Nichts gefunden. Versuche iPhone, Watch oder eine Fähigkeit.' }))
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

fetchCatalog(base)
  .then(result => {
    catalog = result
    renderDiscover()
    const wanted = new URLSearchParams(location.search).get('app')
    const app = wanted && catalog.apps.find(a => a.id === wanted)
    if (app) openDetail(app)
  })
  .catch(error => {
    $('hero').replaceChildren(el('p', { className: 'empty', textContent: error instanceof Error ? error.message : String(error) }))
  })
void renderNews()

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register(`${base}sw.js`).catch(() => undefined)
}
