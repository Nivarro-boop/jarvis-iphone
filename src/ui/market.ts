import { fetchCatalog, type AppEntry, type Catalog, type Skill } from '../market/catalog'
import { install, loadInstalled, syncWithCatalog, uninstall } from '../market/installed'
import { latestRelease } from '../market/releases'
import { applyUpdate, current, fetchRemote, isNewer } from '../update'

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, ...children: (Node | string)[]) => {
  const node = Object.assign(document.createElement(tag), props)
  node.append(...children)
  return node
}

const dateDe = (iso: string) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('de-DE', { day: 'numeric', month: 'short', year: 'numeric' })
}

/**
 * Marktplatz-Blatt: Fähigkeiten, Apps, Neuigkeiten. Holt den Katalog bei
 * jedem Öffnen frisch von GitHub Pages und zieht installierte Fähigkeiten
 * dabei gleich auf die neueste Fassung.
 */
export function setupMarket(options: { onChanged(): void }): { open(): void; refresh(): Promise<void> } {
  const dialog = document.getElementById('market') as HTMLDialogElement
  const status = document.getElementById('market-status') as HTMLElement
  const panes = {
    skills: document.getElementById('market-skills') as HTMLElement,
    apps: document.getElementById('market-apps') as HTMLElement,
    news: document.getElementById('market-news') as HTMLElement
  }
  let catalog: Catalog | null = null

  dialog.addEventListener('change', event => {
    const target = event.target as HTMLInputElement
    if (target.name !== 'market-tab') return
    for (const [name, pane] of Object.entries(panes)) pane.hidden = name !== target.value
  })

  function setStatus(text: string, tone: '' | 'ok' | 'bad' = ''): void {
    status.textContent = text
    status.className = `note${tone ? ` ${tone}` : ''}`
  }

  function renderSkills(): void {
    const installed = loadInstalled()
    const list = catalog?.skills ?? installed
    const categories = [...new Set(list.map(s => s.category))]
    panes.skills.replaceChildren(
      ...categories.flatMap(category => [
        el('h3', { className: 'category', textContent: category }),
        ...list.filter(s => s.category === category).map(skill => skillCard(skill, installed.find(i => i.id === skill.id)))
      ])
    )
  }

  function skillCard(skill: Skill, local: Skill | undefined): HTMLElement {
    const action = el('button', { type: 'button', className: local ? 'pill ghost' : 'pill', textContent: local ? 'Entfernen' : 'Installieren' })
    action.addEventListener('click', () => {
      if (local) {
        uninstall(skill.id)
        setStatus(`${skill.name} entfernt.`)
      } else {
        const result = install(skill)
        if (!result.ok) return setStatus(result.error ?? 'Ging nicht.', 'bad')
        setStatus(`${skill.name} installiert. Sag zum Beispiel: „${skill.examples[0] ?? skill.name}“`, 'ok')
      }
      options.onChanged()
      renderSkills()
    })
    return el(
      'article',
      { className: 'card' },
      el('div', { className: 'card-head' }, el('h3', { textContent: skill.name }), el('span', { className: local ? 'chip on' : 'chip', textContent: local ? `installiert · ${local.version}` : `v${skill.version}` })),
      el('p', { textContent: skill.description }),
      el('ul', { className: 'examples' }, ...skill.examples.slice(0, 3).map(e => el('li', { textContent: e }))),
      el('div', { className: 'card-actions' }, action)
    )
  }

  function renderApps(): void {
    panes.apps.replaceChildren(...(catalog?.apps ?? []).map(appCard))
  }

  function appCard(app: AppEntry): HTMLElement {
    const chip = el('span', { className: 'chip', textContent: app.platform })
    const info = el('p', { textContent: app.description })
    const meta = el('p', { textContent: 'Prüfe Version …' })
    const actions = el('div', { className: 'card-actions' })
    if (app.kind === 'self') {
      void fetchRemote().then(remote => {
        if (isNewer(remote) && remote) {
          meta.textContent = `Installiert: ${current.version}. Neu auf GitHub: ${remote.version}.`
          const button = el('button', { type: 'button', className: 'pill', textContent: 'Jetzt aktualisieren' })
          button.addEventListener('click', () => void applyUpdate())
          actions.replaceChildren(button)
        } else {
          meta.textContent = `Version ${current.version} · aktuell${current.date ? ` · ${dateDe(current.date)}` : ''}`
          chip.className = 'chip on'
        }
      })
    } else if (app.repo) {
      void latestRelease(app.repo, app.asset)
        .then(release => {
          meta.textContent = `Neueste Version ${release.version} · ${dateDe(release.date)}${release.sizeMb ? ` · ${release.sizeMb} MB` : ''}`
          const link = el('a', { className: 'pill', href: release.url, target: '_blank', rel: 'noopener', textContent: 'Herunterladen' })
          const page = el('a', { className: 'pill ghost', href: release.page, target: '_blank', rel: 'noopener', textContent: 'Details' })
          actions.replaceChildren(page, link)
        })
        .catch(error => {
          meta.textContent = error instanceof Error ? error.message : String(error)
        })
    }
    return el('article', { className: 'card' }, el('div', { className: 'card-head' }, el('h3', { textContent: app.name }), chip), info, meta, actions)
  }

  function renderNews(): void {
    panes.news.replaceChildren(
      el(
        'article',
        { className: 'card' },
        el('div', { className: 'card-head' }, el('h3', { textContent: `Version ${current.version}` }), el('span', { className: 'chip', textContent: current.sha })),
        el('p', { textContent: current.date ? `Gebaut am ${dateDe(current.date)}` : '' }),
        el('ul', { className: 'news' }, ...(current.notes.length ? current.notes : ['Keine Angaben']).map(n => el('li', { textContent: n }))),
        el(
          'div',
          { className: 'card-actions' },
          el('a', { className: 'pill ghost', href: 'https://github.com/Nivarro-boop/jarvis-iphone/commits/main', target: '_blank', rel: 'noopener', textContent: 'Alle Änderungen' })
        )
      )
    )
  }

  async function refresh(): Promise<void> {
    try {
      catalog = await fetchCatalog()
      const { updated } = syncWithCatalog(catalog)
      if (updated.length) {
        options.onChanged()
        const names = updated.map(s => `${s.name} ${s.version}`).join(', ')
        setStatus(`Aktualisiert: ${names}.`, 'ok')
      }
    } catch (error) {
      if (dialog.open) setStatus(error instanceof Error ? error.message : String(error), 'bad')
    }
    if (dialog.open) {
      renderSkills()
      renderApps()
    }
  }

  return {
    refresh,
    open() {
      setStatus('')
      renderSkills()
      renderNews()
      panes.apps.replaceChildren()
      dialog.showModal()
      void refresh()
    }
  }
}
