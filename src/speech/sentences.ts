/**
 * Zerlegt gestreamten Text in vorlesbare Sätze, damit James schon spricht,
 * während der Rest noch kommt. Abkürzungen wie „z. B.“ oder „Nr. 5“ und
 * Zahlen wie „3.5“ beenden keinen Satz.
 */
const ABBREVIATIONS = /(?:\b(?:z|u|d|o|s|v|bzw|ca|Nr|Dr|Hr|Fr|Str|usw|etc|ggf|evtl|inkl|bspw|vgl|Mio|Mrd|Tel|St|Prof)\.|\b[A-ZÄÖÜa-zäöü]\.)$/

export class SentenceBuffer {
  private buffer = ''

  /** Nimmt neuen Text auf und gibt fertige Sätze zurück. */
  push(text: string): string[] {
    this.buffer += text
    const sentences: string[] = []
    const pattern = /[.!?…:;]+["“”»)]*\s+|\n+/g
    let start = 0
    let match: RegExpExecArray | null
    while ((match = pattern.exec(this.buffer))) {
      const end = match.index + match[0].length
      const candidate = this.buffer.slice(start, end)
      const head = this.buffer.slice(start, match.index + 1)
      if (match[0].startsWith('.') && ABBREVIATIONS.test(head)) continue
      const clean = candidate.trim()
      if (clean.length >= 2) {
        sentences.push(clean)
        start = end
      }
    }
    this.buffer = this.buffer.slice(start)
    return sentences
  }

  /** Den Rest ausgeben, wenn der Strom endet. */
  flush(): string[] {
    const rest = this.buffer.trim()
    this.buffer = ''
    return rest ? [rest] : []
  }
}

/** Entfernt, was beim Vorlesen stört: Markdown, Links, Emojis. */
export function speakable(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[*_#`>|~]/g, '')
    .replace(/\p{Extended_Pictographic}/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
}
