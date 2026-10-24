# James Store: kostenlose Einrichtung und QR-Codes

24.10.2026 · Änderungen im bestehenden Repository `Nivarro-boop/jarvis-iphone`.

Der Store bietet die iPhone-Web-App, Fähigkeiten für James, eine Anleitung für
Watch-Kurzbefehle und den Windows-Installer an. Das ist kein Apple-zugelassener
alternativer App-Marktplatz. Für diesen offiziellen Vertriebsweg gelten weiter
Apples Mitgliedschafts- und Notarisierungsanforderungen:
[Apple: Alternative Marketplace](https://developer.apple.com/help/app-store-connect/managing-alternative-distribution/create-a-marketplace-app),
[AltStore PAL: Voraussetzungen](https://github.com/altstoreio/FAQ/blob/main/developers/distribute-with-altstore-pal.md).

## Änderungen

- Auf dem iPhone steht Safari → Teilen → Zum Home-Bildschirm an erster Stelle.
  Ein Web-Clip-Profil bleibt optional und wird ausdrücklich als Website-Symbol
  beschrieben. Es schaltet weder native Apps noch Watch-Unterstützung frei.
- Die Anleitung unterstützt James und James Store getrennt. `?target=store`
  öffnet den Store und verwendet dessen eigenes Profil und Symbol.
- Am Rechner zeigt die App-Detailansicht einen großen QR-Code. Vier Module
  Ruhezone, quadratische Darstellung und ausgeschaltete geerbte SVG-Striche
  verhindern, dass allgemeine Symbolstile den QR-Code unlesbar machen.
- Bibliothekseinträge bedeuten eine Auswahl oder einen begonnenen Download.
  Der Store behauptet nicht, eine Installation oder die installierte Version
  aus dem Browser erkannt zu haben.
- Verspätete Windows-Release-Abfragen können keine inzwischen geöffnete andere
  App überschreiben. Leere Suchergebnisse werden erklärt; Tabs haben eine
  korrekte `aria-current`-Markierung.
- Die Watch-Anleitung verwendet strukturierte JSON-Felder für Diktate statt
  ungeschützt zusammengesetzter JSON-Zeichenketten und liest Listen schrittweise
  aus. Fehler ohne `candidates` sollen angezeigt werden. Die direkte Nutzung
  am echten Apple-Watch-Gerät wurde hier nicht bestätigt.
- Gesperrte Zwischenablage und beschädigte lokale Bibliotheksdaten führen nicht
  mehr zu einer falschen Erfolgsmeldung beziehungsweise kaputtem Bibliothekszustand.

## Prüfung

43 Tests bestanden; TypeScript-Prüfung und Vite-Produktionsbuild bestanden.
`npm ci` meldet keine bekannten Sicherheitslücken.

Zusätzliche Chrome-Prüfung mit Desktop (1280 × 850) und iPhone-Safari-Kennung
(390 × 844): Store laden, App-Detail mit lesbarem QR-Code, Store-Einrichtungslink,
korrektes Startziel, Safari-Schritte vor dem optionalen Profil, kein seitlicher
Überlauf und keine JavaScript-Fehler. Diese Browserprüfung ersetzt keine
Installation auf einem echten iPhone und keinen Watch-Gerätetest.

[Store](screenshots/marketplace/desktop.png) ·
[QR-Code](screenshots/marketplace/qr.png) ·
[iPhone-Einrichtung](screenshots/marketplace/iphone-install.png)

Veröffentlichung: Die vorhandene GitHub-Pages-Action prüft Pull Requests. Erst
nach dem Zusammenführen nach `main` veröffentlicht sie die neue Fassung.
Der Netlify-Store spiegelt laut vorhandener Konfiguration GitHub Pages.
Es wurden keine Apple-Konten, Developer-Mitgliedschaften oder nativen Builds erstellt.
