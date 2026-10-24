# Architektur

Statische Web-App ohne Framework und ohne Laufzeit-Abhängigkeiten: TypeScript,
Vite, etwa 13 kB JavaScript (gzip). Kein Backend.

## Ablauf eines Gesprächszugs

1. Tippen auf Kugel oder Mikrofon → `Listener` (Web Speech API, `de-DE`).
   Zwischenstände erscheinen als Untertitel.
2. Endgültiger Text → `runTurn` (`src/ai/agent.ts`).
3. `runTurn` streamt die Antwort des Anbieters. Textstücke gehen sofort an die
   Anzeige und an `SentenceBuffer`, der fertige Sätze an `Speaker` gibt.
4. Wünscht das Modell ein Werkzeug, führt `runTool` es aus, das Ergebnis geht
   als Werkzeugantwort zurück, und es wird erneut gefragt. Höchstens fünf
   Runden; in der letzten werden keine Werkzeuge mehr angeboten.
5. Verlauf wird gekürzt (immer an einer Nutzerfrage) und gespeichert.
6. Im Gesprächsmodus startet nach dem letzten gesprochenen Satz wieder das Zuhören.

Antippen während Denken oder Sprechen bricht alles ab (`AbortController`,
`speechSynthesis.cancel`).

## Anbieter

`src/ai/types.ts` definiert ein neutrales Format (`Message`, `ToolCall`,
`StreamEvent`). Adapter:

- `gemini.ts` – `streamGenerateContent?alt=sse`, Schlüssel im Header
  `x-goog-api-key`. Die Antwortteile des Modells werden unverändert (`raw`)
  aufbewahrt und zurückgeschickt, weil neuere Gemini-Modelle Signaturen an
  Werkzeugaufrufen erwarten.
- `openai.ts` – Chat Completions mit `stream: true`; Werkzeugaufrufe kommen in
  Bruchstücken und werden nach `index` zusammengesetzt.

Beide liefern auch die Modellliste des Kontos; `pickModel` wählt ein schnelles,
aktuelles Modell, falls das gespeicherte fehlt.

## Systemprompt

`src/prompt.ts`: Persönlichkeit, Regeln für gesprochene Antworten (kurz, kein
Markdown), Datum/Uhrzeit/Zeitzone, Gemerktes ausdrücklich als Daten markiert.

## Speicher

`localStorage`, alles mit try/catch (privater Modus). Schlüssel liegen dort im
Klartext – in einer Web-App gibt es keinen sichereren Ort. In der nativen
Fassung wandern sie in den Schlüsselbund.

## Service Worker

`public/sw.js`: Seiten zuerst aus dem Netz, sonst aus dem Zwischenspeicher;
Dateien unter `/assets/` (mit Hash) aus dem Zwischenspeicher. Fremde Adressen
(KI, Wetter, Wikipedia) werden nie zwischengespeichert.

## Tests

`tests/` mit Vitest und jsdom: SSE-Leser, beide Adapter mit nachgebautem
`fetch`, Werkzeugschleife, Satzzerlegung, Speicher, Prompt.
