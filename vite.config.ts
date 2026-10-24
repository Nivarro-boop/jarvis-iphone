import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vitest/config'
// @ts-expect-error – reines JavaScript ohne Typen
import { webClipProfile } from './scripts/webclip.mjs'

/**
 * Jeder Build kennt seine Version, und `version.json` liegt daneben. Die App
 * vergleicht beides und weiß so, wann auf GitHub eine neuere Fassung liegt.
 *
 * Auf GitHub Actions zählt die Laufnummer die letzte Stelle hoch:
 * 0.2.0 in package.json → 0.2.<Lauf>.
 */
function git(command: string): string {
  try {
    return execSync(`git ${command}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    return ''
  }
}

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }
const [major, minor] = pkg.version.split('.')
const run = process.env.GITHUB_RUN_NUMBER
const build = {
  version: run ? `${major}.${minor}.${run}` : `${pkg.version}-dev`,
  sha: (process.env.GITHUB_SHA ?? git('rev-parse HEAD')).slice(0, 7) || 'lokal',
  date: new Date().toISOString(),
  notes: git('log -n 8 --pretty=%s')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
}

/** Die App-Adresse für das Installationsprofil — immer die veröffentlichte. */
const APP_URL = process.env.APP_URL ?? 'https://nivarro-boop.github.io/jarvis-iphone/'

function versionFile(): Plugin {
  return {
    name: 'james-version',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify(build, null, 2) })
      this.emitFile({
        type: 'asset',
        fileName: 'james.mobileconfig',
        source: webClipProfile({ url: APP_URL, iconFile: fileURLToPath(new URL('./public/icons/apple-touch-icon.png', import.meta.url)) })
      })
    }
  }
}

// GitHub Pages liefert unter /jarvis-iphone/ aus; lokal reicht "/".
export default defineConfig({
  base: process.env.PAGES_BASE ?? '/',
  define: { __BUILD__: JSON.stringify(build) },
  plugins: [versionFile()],
  build: {
    target: 'safari16',
    sourcemap: true,
    // App, Marktplatz-Website, Installationsseite und Datenschutz – ein Build, ein Deploy.
    rollupOptions: {
      input: {
        app: fileURLToPath(new URL('./index.html', import.meta.url)),
        marktplatz: fileURLToPath(new URL('./marktplatz/index.html', import.meta.url)),
        datenschutz: fileURLToPath(new URL('./datenschutz/index.html', import.meta.url)),
        installieren: fileURLToPath(new URL('./installieren/index.html', import.meta.url)),
        uhr: fileURLToPath(new URL('./uhr/index.html', import.meta.url)),
        store: fileURLToPath(new URL('./store/index.html', import.meta.url))
      }
    }
  },
  test: { environment: 'jsdom' }
})
