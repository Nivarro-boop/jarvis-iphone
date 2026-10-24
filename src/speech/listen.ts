/**
 * Spracherkennung über die Diktierfunktion des iPhones (Web Speech API).
 * Safari reicht das Audio an Apples Erkennung weiter; dafür muss in iOS die
 * Diktierfunktion eingeschaltet sein.
 */

interface RecognitionResultEvent {
  resultIndex: number
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>
}

interface Recognition {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  onresult: ((event: RecognitionResultEvent) => void) | null
  onerror: ((event: { error: string }) => void) | null
  onend: (() => void) | null
  start(): void
  stop(): void
  abort(): void
}

type RecognitionConstructor = new () => Recognition

function constructor(): RecognitionConstructor | null {
  const w = window as unknown as { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export interface ListenHandlers {
  /** Zwischenstand, solange gesprochen wird. */
  onPartial(text: string): void
  /** Endgültiger Text; leer, wenn nichts verstanden wurde. */
  onFinal(text: string): void
  onError(message: string): void
}

export class Listener {
  private active: Recognition | null = null

  get supported(): boolean {
    return constructor() !== null
  }

  get listening(): boolean {
    return this.active !== null
  }

  start(handlers: ListenHandlers): void {
    const Ctor = constructor()
    if (!Ctor) {
      handlers.onError('Spracherkennung gibt es in diesem Browser nicht. Unten tippen geht immer.')
      return
    }
    this.abort()
    const recognition = new Ctor()
    recognition.lang = 'de-DE'
    recognition.continuous = false
    recognition.interimResults = true
    recognition.maxAlternatives = 1
    let finalText = ''
    let partial = ''
    let delivered = false
    const deliver = (text: string) => {
      if (delivered) return
      delivered = true
      handlers.onFinal(text.trim())
    }

    recognition.onresult = event => {
      let interim = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        if (result.isFinal) finalText += result[0].transcript
        else interim += result[0].transcript
      }
      partial = (finalText + interim).trim()
      handlers.onPartial(partial)
    }
    recognition.onerror = event => {
      if (event.error === 'aborted') return
      if (event.error === 'no-speech') return deliver('')
      delivered = true
      handlers.onError(describe(event.error))
    }
    recognition.onend = () => {
      if (this.active === recognition) this.active = null
      // Safari meldet das Ergebnis manchmal nie als endgültig; dann zählt der letzte Stand.
      deliver(finalText || partial)
    }
    this.active = recognition
    try {
      recognition.start()
    } catch {
      this.active = null
      handlers.onError('Das Mikrofon ist gerade belegt. Gleich noch einmal versuchen.')
    }
  }

  /** Zuhören beenden und auswerten, was bisher gesagt wurde. */
  stop(): void {
    this.active?.stop()
  }

  /** Zuhören abbrechen, ohne Ergebnis. */
  abort(): void {
    const recognition = this.active
    this.active = null
    if (recognition) {
      recognition.onend = null
      recognition.onresult = null
      recognition.abort()
    }
  }
}

function describe(code: string): string {
  switch (code) {
    case 'not-allowed':
      return 'Mikrofon nicht erlaubt. In iOS unter Einstellungen → Safari → Mikrofon (oder bei der App) freigeben.'
    case 'service-not-allowed':
      return 'Die Diktierfunktion ist aus. In iOS unter Einstellungen → Allgemein → Tastatur → Diktierfunktion einschalten.'
    case 'network':
      return 'Für die Spracherkennung braucht das iPhone Internet.'
    case 'audio-capture':
      return 'Kein Mikrofon gefunden.'
    default:
      return `Spracherkennung fehlgeschlagen (${code}).`
  }
}
