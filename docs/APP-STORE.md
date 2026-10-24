# Von der Web-App in den App Store

Stand jetzt: James läuft als Web-App (PWA). Installieren über Safari → Teilen →
Zum Home-Bildschirm. Das kostet nichts und braucht keine Prüfung durch Apple.

Für den App Store (Apples „Marktplatz“) fehlen drei Dinge: ein Entwicklerkonto,
eine native Hülle und eine Prüfung durch Apple.

## 1. Entwicklerkonto

- **Apple Developer Program**, 99 USD pro Jahr: https://developer.apple.com/programs/enroll/
- Als **Einzelperson** geht es mit Apple-ID und Ausweis. Im Store steht dann
  der eigene Name als Anbieter.
- Als **Firma** braucht es zusätzlich eine D-U-N-S-Nummer (kostenlos, dauert
  einige Tage). Im Store steht dann der Firmenname.
- Freischaltung dauert meist 1–2 Tage.

## 2. Native Hülle – ohne Mac

Empfehlung: **Capacitor**. Es packt genau diesen Web-Code (`dist/`) in eine
iOS-App. Der Code hier bleibt gleich.

Eine Stelle muss dabei ersetzt werden: In einer App-WebView (WKWebView) gibt es
die Spracherkennung von Safari nicht. Dafür kommen native Plugins dazu:

| Funktion | Web-App heute | In der App |
| --- | --- | --- |
| Zuhören | `webkitSpeechRecognition` | `@capacitor-community/speech-recognition` (Apple Speech) |
| Vorlesen | `speechSynthesis` | `@capacitor-community/text-to-speech` (bessere Stimmen, läuft zuverlässiger) |
| Schlüssel speichern | localStorage | Schlüsselbund (Keychain) |
| Timer im Hintergrund | geht nicht | lokale Mitteilungen (`@capacitor/local-notifications`) |

`src/speech/listen.ts` und `src/speech/speak.ts` sind schon so geschnitten,
dass nur diese zwei Dateien eine zweite Fassung brauchen.

Gebaut wird in der Cloud, weil Xcode nur auf macOS läuft:

- **Codemagic** (500 macOS-Minuten pro Monat gratis), oder
- **GitHub Actions** mit `macos`-Runner, oder
- **Expo EAS**, falls später auf React Native gewechselt wird.

Hochgeladen wird über einen App-Store-Connect-API-Schlüssel direkt nach
**TestFlight**. Von dort auf das eigene iPhone und an Tester.

## 3. Prüfung durch Apple

Worauf Apple bei so einer App schaut:

- **Mindestfunktion (Richtlinie 4.2):** Eine reine Webseite in einer Hülle wird
  oft abgelehnt. Native Spracherkennung, Vorlesen, Mitteilungen und Siri-Kurzbefehle
  machen den Unterschied.
- **Datenschutz:** Datenschutzerklärung als Webseite, Angaben im „App Privacy“-
  Formular (Audio geht an Apple, Text an den KI-Anbieter).
- **Bezahlen (3.1.1):** Wird ein Abo verkauft, muss es über Apples In-App-Kauf
  laufen (15–30 % an Apple). Eigene Schlüssel der Nutzer (wie jetzt) sind
  erlaubt, aber für normale Kunden zu kompliziert.
- **Name:** „Jarvis“ ist eine Marke von Marvel/Disney. Im Store deshalb
  **James** verwenden, nicht Jarvis.
- **KI-Inhalte:** Hinweis, dass Antworten von einer KI stammen, und eine
  Meldemöglichkeit für problematische Antworten.

## 4. Zum Verkaufen

Für zahlende Kunden ohne eigenen Schlüssel braucht es einen kleinen eigenen
Server, der die KI-Anfragen weiterreicht und Kontingente zählt. Dann: Abo per
In-App-Kauf, Server prüft den Kaufbeleg. Das ist der größte offene Baustein.

## Reihenfolge

1. Web-App weiter verbessern und auf dem iPhone testen (jetzt).
2. Apple Developer Program abschließen.
3. Capacitor-Hülle + native Sprach-Plugins, Build über Codemagic.
4. TestFlight auf eigenem iPhone.
5. Datenschutzseite, Screenshots, Store-Texte.
6. Zur Prüfung einreichen.
