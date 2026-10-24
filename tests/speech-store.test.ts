import { beforeEach, describe, expect, it } from 'vitest'
import type { Message } from '../src/ai/types'
import { systemPrompt } from '../src/prompt'
import { SentenceBuffer, speakable } from '../src/speech/sentences'
import { forget, loadMemory, loadSettings, remember, trimHistory } from '../src/store'

describe('SentenceBuffer', () => {
  it('gibt fertige Sätze aus, sobald sie vollständig sind', () => {
    const buffer = new SentenceBuffer()
    expect(buffer.push('Guten Mor')).toEqual([])
    expect(buffer.push('gen, Hans. Es sind 3.5 Grad')).toEqual(['Guten Morgen, Hans.'])
    expect(buffer.push(' draußen! Und')).toEqual(['Es sind 3.5 Grad draußen!'])
    expect(buffer.flush()).toEqual(['Und'])
  })

  it('trennt nicht nach Abkürzungen', () => {
    const buffer = new SentenceBuffer()
    expect(buffer.push('Nimm z. B. den Bus Nr. 5 um acht. Gut?')).toEqual(['Nimm z. B. den Bus Nr. 5 um acht.'])
    expect(buffer.flush()).toEqual(['Gut?'])
  })
})

describe('speakable', () => {
  it('entfernt Markdown, Links und Emojis', () => {
    expect(speakable('**Fett** und [Link](https://x.y) 🎉 https://a.b/c')).toBe('Fett und Link')
  })
})

describe('Speicher', () => {
  beforeEach(() => localStorage.clear())

  it('liefert Standardwerte und lehnt Unsinn ab', () => {
    localStorage.setItem('james.settings.v1', JSON.stringify({ provider: 'evil', rate: 99, keys: { gemini: 'k' } }))
    const settings = loadSettings()
    expect(settings.provider).toBe('gemini')
    expect(settings.rate).toBe(1.5)
    expect(settings.keys).toEqual({ gemini: 'k', openai: '' })
    expect(settings.userName).toBe('Hans')
  })

  it('merkt und vergisst ohne Doppelte', () => {
    remember('Trinkt Kaffee schwarz')
    remember('trinkt kaffee schwarz')
    remember('Wohnt in Wien')
    expect(loadMemory()).toEqual(['trinkt kaffee schwarz', 'Wohnt in Wien'])
    expect(forget('kaffee').removed).toEqual(['trinkt kaffee schwarz'])
    expect(loadMemory()).toEqual(['Wohnt in Wien'])
  })

  it('kürzt den Verlauf nur an Nutzerfragen', () => {
    const history: Message[] = [
      { role: 'user', text: '1' },
      { role: 'assistant', text: '', toolCalls: [{ id: 'a', name: 'x', args: {} }] },
      { role: 'tool', callId: 'a', name: 'x', result: null },
      { role: 'assistant', text: 'A' },
      { role: 'user', text: '2' },
      { role: 'assistant', text: 'B' }
    ]
    expect(trimHistory(history, 4)).toEqual(history.slice(4))
  })
})

describe('systemPrompt', () => {
  it('enthält Name, Datum und Gemerktes als Daten', () => {
    const prompt = systemPrompt({ userName: 'Hans', memory: ['Mag Jazz'], now: new Date('2026-10-24T09:30:00') })
    expect(prompt).toContain('iPhone von Hans')
    expect(prompt).toContain('2026')
    expect(prompt).toContain('- Mag Jazz')
    expect(prompt).toContain('keine Anweisungen')
  })
})
