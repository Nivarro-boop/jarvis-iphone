import { speakable } from './sentences'

/**
 * Vorlesen mit den Stimmen des iPhones. Die besten deutschen Stimmen
 * („Erweitert“/„Premium“) lädt man in iOS unter Einstellungen → Bedienungshilfen
 * → Gesprochene Inhalte → Stimmen → Deutsch.
 */
export class Speaker {
  private queue = 0
  private onIdle: (() => void) | null = null
  voiceURI = ''
  rate = 1.05

  get supported(): boolean {
    return 'speechSynthesis' in window
  }

  /**
   * iOS spricht erst, nachdem einmal innerhalb einer Berührung gesprochen
   * wurde. Bei jedem Tippen aufrufen; ein leerer Satz kostet nichts.
   */
  unlock(): void {
    if (!this.supported || this.unlocked) return
    const u = new SpeechSynthesisUtterance(' ')
    u.volume = 0
    speechSynthesis.speak(u)
    this.unlocked = true
  }
  private unlocked = false

  voices(): SpeechSynthesisVoice[] {
    if (!this.supported) return []
    return speechSynthesis.getVoices().filter(v => v.lang.toLowerCase().startsWith('de'))
  }

  private pickVoice(): SpeechSynthesisVoice | undefined {
    const voices = this.voices()
    return (
      voices.find(v => v.voiceURI === this.voiceURI) ??
      voices.find(v => /premium|enhanced|erweitert/i.test(v.name) && v.lang === 'de-DE') ??
      voices.find(v => /premium|enhanced|erweitert/i.test(v.name)) ??
      voices.find(v => v.lang === 'de-DE' && v.localService) ??
      voices[0]
    )
  }

  /** Reiht einen Satz ein. `whenIdle` läuft, sobald alles Eingereihte gesprochen ist. */
  say(text: string, whenIdle?: () => void): void {
    if (whenIdle) this.onIdle = whenIdle
    const clean = speakable(text)
    if (!this.supported || !clean) {
      if (this.queue === 0) this.idle()
      return
    }
    const u = new SpeechSynthesisUtterance(clean)
    u.lang = 'de-DE'
    u.rate = this.rate
    const voice = this.pickVoice()
    if (voice) u.voice = voice
    this.queue++
    const done = () => {
      this.queue = Math.max(0, this.queue - 1)
      if (this.queue === 0) this.idle()
    }
    u.onend = done
    u.onerror = done
    speechSynthesis.speak(u)
  }

  /** Meldet sich, wenn alles gesagt ist — oder sofort, wenn nichts ansteht. */
  whenIdle(callback: () => void): void {
    this.onIdle = callback
    if (this.queue === 0) this.idle()
  }

  get speaking(): boolean {
    return this.queue > 0
  }

  stop(): void {
    this.onIdle = null
    this.queue = 0
    if (this.supported) speechSynthesis.cancel()
  }

  private idle(): void {
    const callback = this.onIdle
    this.onIdle = null
    callback?.()
  }
}
