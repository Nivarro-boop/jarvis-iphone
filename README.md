# James – Jarvis fürs iPhone

Marktplatz-Update: Installation über Safari steht im Vordergrund, Web-Clip-Profile
sind optional. Der Store zeigt QR-Codes am Rechner, unterscheidet Web-App,
Watch-Kurzbefehl und Windows-Installer und behauptet keinen erkannten
Installationsstatus. Die Bibliothek merkt ausgewählte Apps und Downloads.
Details: [Marktplatz-Prüfung](docs/MARKTPLATZ-INSTALLATION.md).

Ein eigenständiger Sprachassistent fürs iPhone. Kugel antippen, sprechen,
James antwortet laut. Kein Rechner nötig, kein eigener Server, kein Konto bei
uns: Die App läuft komplett im iPhone und spricht direkt mit der gewählten KI.

**Laden (alle Geräte):** https://james-marktplatz.netlify.app/laden – eine Seite
für iPhone, Windows und Apple Watch. Das eigene Gerät steht oben und ist
markiert; am iPhone folgen die drei Tipps (Teilen → Zum Home-Bildschirm,
Profil nur als Alternative), am PC ein QR-Code und
der Windows-Installer mit Version und Größe live aus den GitHub-Releases.
Dazu kurze Antworten auf die häufigsten Fragen (Kosten, Windows-Warnung,
Datenschutz, Koppeln). Gleiche Seite auf GitHub Pages:
https://nivarro-boop.github.io/jarvis-iphone/installieren/.

**James Store:** https://james-marktplatz.netlify.app – Store wie Epic/App Store
(Entdecken, Suche, Bibliothek), selbst als App installierbar. Am iPhone führt der Store zur Anleitung
für den Home-Bildschirm, am Rechner zeigt er QR-Codes.
Jede App und jede Fähigkeit hat eine Detailseite mit eigenem Link zum Teilen
(`/store/?app=james-windows`, `/store/?skill=koch`); Fähigkeiten lassen sich
nach Kategorie filtern. Installiert und verlinkt wird immer die
GitHub-Pages-Adresse, damit Fähigkeiten im Speicher der installierten App
landen. In James selbst reicht „Installiere den Kochassistenten“.
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
  QR-Code am PC (Menü → iPhone & Apple Watch), Adresse in James unter Einstellungen → PC koppeln einfügen.
- Tippen geht immer, auch ohne Mikrofon.
- **Einstellungen wie in iOS:** oben der Stand („James ist bereit“ oder was
  fehlt), darunter „Auf dem iPhone“ (KI, Stimme, Gmail & Kalender, Du &
  Gedächtnis) und „Mit dem PC“ (Koppeln, Windows-Installer). Jede Zeile zeigt
  ihren Stand und öffnet ihre Seite.
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
