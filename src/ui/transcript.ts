import type { Message } from '../ai/types'

/** Zeigt den Verlauf als Gespräch; Werkzeugschritte bleiben unsichtbar. */
export function renderTranscript(list: HTMLElement, history: Message[]): void {
  list.replaceChildren()
  for (const message of history) {
    if (message.role === 'tool' || !('text' in message) || !message.text.trim()) continue
    const item = document.createElement('li')
    item.className = message.role
    item.textContent = message.text
    list.append(item)
  }
  requestAnimationFrame(() => list.lastElementChild?.scrollIntoView({ block: 'end' }))
}
