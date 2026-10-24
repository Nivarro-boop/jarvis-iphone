# James – Jarvis fürs iPhone

Ein eigenständiger Sprachassistent fürs iPhone. Kugel antippen, sprechen,
James antwortet laut. Kein Rechner nötig, kein eigener Server, kein Konto bei
uns: Die App läuft komplett im iPhone und spricht direkt mit der gewählten KI.

**Ausprobieren:** https://nivarro-boop.github.io/jarvis-iphone/ in Safari
öffnen → Teilen → **Zum Home-Bildschirm**. Danach startet James wie eine App,
im Vollbild und mit eigenem Symbol.

Schwesterprojekt: [James-Jarvis für Windows](https://github.com/Nivarro-boop/James-Jarvis).
Das hier ist bewusst eigenständig und teilt keinen Code.

## Was James kann

- **Sprechen und zuhören.** Spracherkennung über die Diktierfunktion von iOS,
  Antworten mit den Systemstimmen. Er spricht schon, während die Antwort noch
  entsteht (Satz für Satz).
- **Gesprächsmodus.** Nach der Antwort hört er gleich wieder zu.
- **Wetter** für jeden Ort oder den aktuellen Standort (Open-Meteo, offene Daten).
- **Nachschlagen** in der deutschen Wikipedia.
- **Timer**, solange die App offen ist.
- **Gedächtnis.** „Merk dir, dass …“ – bleibt auf dem iPhone, jederzeit löschbar.
- **Zwei KI-Anbieter:** Google Gemini (kostenloser Schlüssel) oder OpenAI.
  Modelle werden aus dem eigenen Konto geladen.
- Tippen geht immer, auch ohne Mikrofon.
- **Marktplatz** (Symbol oben): Fähigkeiten wie Kochassistent, Englisch-Trainer,
  Fokus-Coach, Quizmaster mit einem Tipp installieren; dazu die Apps der
  James-Familie (Windows-Installer immer in der neuesten Fassung aus den
  GitHub-Releases) und die Neuigkeiten der aktuellen Version.

## Immer aktuell – direkt aus GitHub

Jeder Push auf `main` wird geprüft, gebaut und nach GitHub Pages veröffentlicht.
Der Build legt eine `version.json` mit Versionsnummer (`0.2.<Lauf>`), Commit
und den letzten Änderungen daneben.

- Die App fragt beim Start, beim Zurückkehren und alle 30 Minuten nach.
- Direkt nach dem Start aktualisiert sie sich still; mitten im Gebrauch zeigt
  sie „Neue Version … · Aktualisieren“, damit kein Gespräch abreißt.
- Installierte Fähigkeiten werden auf die neueste Fassung im Katalog gezogen.

## Eine Fähigkeit hinzufügen

`public/marketplace.json` bearbeiten (direkt auf GitHub oder per Pull Request),
Eintrag unter `skills` anlegen und bei Änderungen `version` erhöhen:

```json
{
  "id": "gaertner",
  "name": "Gartenhelfer",
  "version": "1.0.0",
  "category": "Alltag",
  "description": "Was wann gepflanzt, gegossen und geschnitten wird.",
  "instructions": "Wenn es um Garten oder Pflanzen geht: …",
  "examples": ["Wann schneide ich Rosen?"],
  "author": "Hans"
}
```

Nach dem Merge steht sie nach etwa einer Minute bei allen im Marktplatz.
Fähigkeiten sind nur Text (Anweisungen für James); es läuft kein fremder Code.

## Einrichten

1. Kostenlosen Gemini-Schlüssel holen: https://aistudio.google.com/apikey
2. In James auf „Schlüssel einfügen“ tippen und einfügen.
3. Optional: bessere Stimme in iOS laden (Einstellungen → Bedienungshilfen →
   Gesprochene Inhalte → Stimmen → Deutsch → eine „Erweitert“-Stimme).

## Entwickeln

```bash
npm install
npm run dev        # http://localhost:5173, im WLAN auch vom iPhone erreichbar
npm test           # Unit-Tests (Vitest)
npm run build      # Typprüfung + Produktionsbuild nach dist/
```

Spracherkennung braucht HTTPS oder localhost. Zum Testen am iPhone deshalb die
veröffentlichte Seite nehmen oder einen HTTPS-Tunnel.


## Aufbau

| Pfad | Inhalt |
| --- | --- |
| `src/main.ts` | Ablauf: zuhören → fragen → vorlesen, Zustände |
| `src/ai/` | Neutrales Gesprächsformat, Adapter für Gemini und OpenAI, Werkzeugschleife |
| `src/speech/` | Spracherkennung, Vorlesen, Zerlegen in Sätze |
| `src/tools/` | Wetter, Wikipedia, Merken, Timer |
| `src/ui/` | Kugel (Canvas), Einstellungen, Verlauf, Timer, Marktplatz |
| `src/market/` | Katalog, installierte Fähigkeiten, GitHub-Releases |
| `src/update.ts` | Selbst-Update über `version.json` |
| `public/marketplace.json` | Der Katalog des Marktplatzes |
| `src/store.ts` | Einstellungen, Verlauf, Gedächtnis (localStorage) |
| `public/` | Manifest, Service Worker, Symbole |
| `docs/` | Architektur, Weg in den App Store, offene Fragen |

Mehr: [docs/ARCHITEKTUR.md](docs/ARCHITEKTUR.md),
[docs/APP-STORE.md](docs/APP-STORE.md), [docs/REVIEW.md](docs/REVIEW.md).

## Datenschutz

Schlüssel, Verlauf und Gedächtnis liegen nur im Speicher dieser Web-App auf dem
iPhone. Gesendet wird nur an: den gewählten KI-Anbieter (Frage, Verlauf,
Gemerktes), Apples Spracherkennung (Diktat), Open-Meteo (Ort) und Wikipedia
(Suchbegriff).

## Rechte

Alle Rechte vorbehalten. Der Code ist zum Ansehen und Prüfen öffentlich, aber
nicht zur Weiterverwendung freigegeben.
