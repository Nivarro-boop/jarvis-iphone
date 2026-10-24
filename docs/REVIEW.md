# Für eine zweite Meinung

Dieses Dokument richtet sich an einen Prüfer (Mensch oder KI, z. B. ChatGPT),
der das Projekt bewerten soll. Repository: https://github.com/Nivarro-boop/jarvis-iphone

## Ziel

Ein eigenständiger Sprachassistent fürs iPhone, später im App Store und
verkaufbar. Jetzt als Web-App, damit es ohne Apple-Entwicklerkonto testbar ist.

## Stand (Version 0.1)

- Fertig: Sprechen/Zuhören, Satz-für-Satz-Vorlesen, Gemini und OpenAI mit
  Streaming und Werkzeugen, Wetter, Wikipedia, Timer, Gedächtnis, Verlauf,
  Einstellungen, PWA-Installation, automatische Veröffentlichung über GitHub Pages.
- Geprüft: Typprüfung, 15 Unit-Tests, Produktionsbuild, kompletter Gesprächszug
  mit nachgebautem Gemini im Browser (iPhone-Größe).
- Nicht geprüft: echtes iPhone, echte Spracherkennung in Safari, echte
  Schlüssel bei Gemini/OpenAI.

## Fragen, zu denen eine Meinung hilft

1. **Weg in den App Store:** Capacitor um diese Web-App (Plan in
   `docs/APP-STORE.md`) – oder gleich nativ (Swift/SwiftUI) bzw. React Native/Expo?
2. **Geschäftsmodell:** Eigener Schlüssel der Nutzer ist für Endkunden zu
   kompliziert. Eigener Server mit Abo per In-App-Kauf – welcher schlanke Aufbau?
3. **Sprache:** Web Speech API in Safari vs. Aufnahme + Whisper/Gemini-Audio.
   Was ist auf iOS verlässlicher und günstiger?
4. **Echtzeit-Gespräch:** Lohnt sich eine Realtime-Sprachschnittstelle (OpenAI
   Realtime / Gemini Live) statt Erkennung → Text → Vorlesen?
5. **Sicherheit:** API-Schlüssel im localStorage – vertretbar für eine
   Testfassung?
6. **Funktionen:** Was fehlt am meisten, damit Leute das täglich nutzen
   (Kalender, Erinnerungen, Kurzbefehle/Siri, Nachrichten, Musik)?
7. **Code:** Struktur in `src/` – zu einfach, passend, oder fehlt eine Schicht?

## Wo anfangen

`README.md` → `docs/ARCHITEKTUR.md` → `src/main.ts` → `src/ai/agent.ts`.
