# James – Jarvis fürs iPhone

Ein eigenständiger Sprachassistent fürs iPhone. Kugel antippen, sprechen,
James antwortet laut. Kein Rechner nötig, kein eigener Server, kein Konto bei
uns: Die App läuft komplett im iPhone und spricht direkt mit der gewählten KI.

**Laden:** https://nivarro-boop.github.io/jarvis-iphone/installieren/ – zeigt am
iPhone die drei Tipps (James öffnen → Teilen → **Zum Home-Bildschirm**), am PC
einen QR-Code und den Windows-Installer. Danach startet James wie eine App,
im Vollbild und mit eigenem Symbol.

**James Store:** https://james-marktplatz.netlify.app – Store wie Epic/App Store
(Entdecken, Suche, Bibliothek), selbst als App installierbar. „Holen“ installiert
James am iPhone mit einem Profil (Erlauben → Einstellungen → Installieren).
Die Netlify-Site spiegelt GitHub Pages live; nur das Profil liegt dort selbst
(`npm run netlify`, Erklärung in `scripts/netlify-site.mjs`). Apple Watch:
https://james-marktplatz.netlify.app/uhr.

**Marktplatz auf GitHub Pages:** https://nivarro-boop.github.io/jarvis-iphone/marktplatz/
– alle Apps und Fähigkeiten, live aus GitHub, mit QR-Code zum Öffnen am iPhone.
„In James installieren“ öffnet die App direkt an der richtigen Stelle.

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
- **Gmail und Google-Kalender** direkt vom iPhone: Mails suchen, vorlesen,
  schreiben; Termine abfragen und eintragen. Senden und Eintragen nur nach
  Bestätigung auf dem Bildschirm. Läuft über das eigene Google-Projekt
  (Einstellungen → Google, Anleitung dort).
- **PC-Modus:** Oben zwischen „iPhone“ und „PC“ umschalten. Dann ist das
  iPhone Mikrofon, Lautsprecher und Fernbedienung für James am PC – mit allem,
  was der dort kann (Programme, Browser, Dateien, Mails). Koppeln über den
  QR-Code „Mit der James-App koppeln“ am PC (Einstellungen → Telefon).
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

Nach dem Merge steht sie nach etwa einer Minute bei allen im Marktplatz – in
der App und auf der Website. Ohne GitHub-Kenntnisse: auf der Website
„Fähigkeit vorschlagen“ (Formular als GitHub-Issue).
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
| `marktplatz/`, `src/site/` | Marktplatz-Website |
| `datenschutz/` | Datenschutzerklärung (auch für den App Store) |
| `installieren/` | „Runterladen“: Installationsweg je nach Gerät |
| `src/pc/`, `src/ui/pcmode.ts` | PC-Modus: Verbindung, Ton, Kopplung |
| `src/google/` | Google-Anmeldung, Gmail, Kalender |
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
