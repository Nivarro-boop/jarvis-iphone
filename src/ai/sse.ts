/**
 * Liest Server-Sent Events aus einer fetch-Antwort und liefert den Inhalt
 * jeder `data:`-Zeile. Beide Anbieter streamen so.
 */
export async function* readSse(body: ReadableStream<Uint8Array>, signal?: AbortSignal): AsyncGenerator<string> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let data: string[] = []
  try {
    while (true) {
      if (signal?.aborted) return
      const { value, done } = await reader.read()
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true })
      let newline: number
      while ((newline = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newline).replace(/\r$/, '')
        buffer = buffer.slice(newline + 1)
        if (line === '') {
          if (data.length) yield data.join('\n')
          data = []
        } else if (line.startsWith('data:')) {
          data.push(line.slice(5).replace(/^ /, ''))
        }
      }
      if (done) {
        if (buffer.startsWith('data:')) data.push(buffer.slice(5).replace(/^ /, ''))
        if (data.length) yield data.join('\n')
        return
      }
    }
  } finally {
    reader.releaseLock()
  }
}
