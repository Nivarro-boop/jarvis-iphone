import qrcode from 'qrcode-generator'
import { fetchCatalog, type AppEntry, type Catalog, type Skill } from '../market/catalog'
import { latestRelease } from '../market/releases'
import { Orb, type OrbState } from '../ui/orb'
import { fetchRemote } from '../update'
import './site.css'

/**
 * Die Marktplatz-Website. Gleicher Katalog wie in der App
 * (`public/marketplace.json`), gleiche Versionsdatei — eine Quelle, zwei
 * Schaufenster. Alles wird beim Öffnen frisch aus GitHub gelesen.
 */

const REPO = 'Nivarro-boop/jarvis-iphone'
const base = import.meta.env.BASE_URL
const appUrl = new URL(base, location.origin).href
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, ...children: (Node | string)[]) => {
  const node = Object.assign(document.createElement(tag), props)
  node.append(...children)
  return node
}

const dateDe = (iso: string) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' })
}

// ─────────────────────────────────────────────────────────────
// Kugel und QR-Code
// ─────────────────────────────────────────────────────────────

const orb = new Orb($<HTMLCanvasElement>('orb'))
const demo: OrbState[] = ['idle', 'listening', 'thinking', 'speaking']
let step = 0
if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
  setInterval(() => orb.set(demo[++step % demo.length]), 2600)
}

function renderQr(target: HTMLElement, text: string): void {
  const qr = qrcode(0, 'M')
  qr.addData(text)
  qr.make()
  const size = qr.getModuleCount()
  let path = ''
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) if (qr.isDark(r, c)) path += `M${c} ${r}h1v1h-1z`
  }
  target.innerHTML = `<svg viewBox="-2 -2 ${size + 4} ${size + 4}" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges"><rect x="-2" y="-2" width="${size + 4}" height="${size + 4}" fill="#fff" rx="2"/><path d="${path}" fill="#05070b"/></svg>`
}
renderQr($('qr'), appUrl)

// ─────────────────────────────────────────────────────────────
// Apps
// ─────────────────────────────────────────────────────────────

function appCard(app: AppEntry): HTMLElement {
  const meta = el('p', { className: 'meta', textContent: 'Prüfe Version …' })
  const actions = el('div', { className: 'actions' })
  if (app.kind === 'self') {
    actions.append(el('a', { className: 'button primary', href: appUrl, textContent: 'Öffnen' }))
    void fetchRemote(base).then(remote => {
      meta.textContent = remote ? `Version ${remote.version} · ${dateDe(remote.date)}` : 'Web-App, immer aktuell'
    })
  } else if (app.repo) {
    void latestRelease(app.repo, app.asset)
      .then(release => {
        meta.textContent = `Version ${release.version} · ${dateDe(release.date)}${release.sizeMb ? ` · ${release.sizeMb} MB` : ''}`
        actions.append(
          el('a', { className: 'button', href: release.page, target: '_blank', rel: 'noopener', textContent: 'Was ist neu' }),
          el('a', { className: 'button primary', href: release.url, rel: 'noopener', textContent: 'Herunterladen' })
        )
        if (app.id === 'james-windows') {
          const hero = $<HTMLAnchorElement>('hero-windows')
          hero.href = release.url
          hero.textContent = `Für Windows laden · ${release.version}`
        }
      })
      .catch(error => {
        meta.textContent = error instanceof Error ? error.message : String(error)
        actions.append(el('a', { className: 'button', href: `https://github.com/${app.repo}/releases/latest`, target: '_blank', rel: 'noopener', textContent: 'Auf GitHub' }))
      })
  }
  return el(
    'article',
    { className: 'card app' },
    el('div', { className: 'card-top' }, el('h3', { textContent: app.name }), el('span', { className: 'tag', textContent: app.platform })),
    el('p', { textContent: app.description }),
    meta,
    actions
  )
}

// ─────────────────────────────────────────────────────────────
// Fähigkeiten mit Suche und Kategorien
// ─────────────────────────────────────────────────────────────

let catalog: Catalog = { updated: '', skills: [], apps: [] }
let category = 'Alle'

function skillCard(skill: Skill): HTMLElement {
  return el(
    'article',
    { className: 'card skill', id: `skill-${skill.id}` },
    el('div', { className: 'card-top' }, el('h3', { textContent: skill.name }), el('span', { className: 'tag', textContent: skill.category })),
    el('p', { textContent: skill.description }),
    el('ul', { className: 'examples' }, ...skill.examples.slice(0, 3).map(e => el('li', { textContent: e }))),
    el(
      'div',
      { className: 'actions' },
      el('span', { className: 'meta', textContent: `v${skill.version} · ${skill.author}` }),
      el('a', { className: 'button primary small', href: `${appUrl}#skill=${encodeURIComponent(skill.id)}`, textContent: 'In James installieren' })
    )
  )
}

function renderSkills(): void {
  const query = $<HTMLInputElement>('search').value.trim().toLowerCase()
  const visible = catalog.skills.filter(
    s =>
      (category === 'Alle' || s.category === category) &&
      (!query || [s.name, s.description, s.category, ...s.examples].some(t => t.toLowerCase().includes(query)))
  )
  $('skills-list').replaceChildren(...visible.map(skillCard))
  $('skills-empty').hidden = visible.length > 0
}

function renderCategories(): void {
  const names = ['Alle', ...new Set(catalog.skills.map(s => s.category))]
  $('categories').replaceChildren(
    ...names.map(name => {
      const chip = el('button', { type: 'button', className: name === category ? 'chip active' : 'chip', textContent: name })
      chip.setAttribute('aria-pressed', String(name === category))
      chip.addEventListener('click', () => {
        category = name
        renderCategories()
        renderSkills()
      })
      return chip
    })
  )
}

$('search').addEventListener('input', renderSkills)

// ─────────────────────────────────────────────────────────────
// Neuigkeiten
// ─────────────────────────────────────────────────────────────

async function renderNews(): Promise<void> {
  const list = $('news-list')
  try {
    const response = await fetch(`https://api.github.com/repos/${REPO}/commits?per_page=8`, { headers: { Accept: 'application/vnd.github+json' } })
    if (!response.ok) throw new Error(String(response.status))
    const commits = (await response.json()) as { html_url: string; commit: { message: string; committer: { date: string } } }[]
    list.replaceChildren(
      ...commits.map(c =>
        el(
          'li',
          {},
          el('time', { dateTime: c.commit.committer.date, textContent: dateDe(c.commit.committer.date) }),
          el('a', { href: c.html_url, target: '_blank', rel: 'noopener', textContent: c.commit.message.split('\n')[0] })
        )
      )
    )
  } catch {
    // GitHub bremst: dann wenigstens die Notizen der aktuellen Fassung.
    const remote = await fetchRemote(base)
    list.replaceChildren(...(remote?.notes ?? ['Gerade nicht abrufbar.']).map(n => el('li', {}, el('span', { textContent: n }))))
  }
}

// ─────────────────────────────────────────────────────────────
// Start
// ─────────────────────────────────────────────────────────────

void fetchRemote(base).then(remote => {
  if (remote) $('hero-version').textContent = `James für iPhone ${remote.version} · aktualisiert am ${dateDe(remote.date)}`
})

fetchCatalog(base)
  .then(result => {
    catalog = result
    $('apps-list').replaceChildren(...catalog.apps.map(appCard))
    renderCategories()
    renderSkills()
    // Direktlink auf eine Fähigkeit, z. B. …/marktplatz/#skill-koch
    const target = location.hash && document.getElementById(location.hash.slice(1))
    if (target) target.scrollIntoView({ block: 'center' })
  })
  .catch(error => {
    $('skills-list').replaceChildren(el('p', { className: 'empty', textContent: error instanceof Error ? error.message : String(error) }))
  })

void renderNews()
