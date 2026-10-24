import { failedFetch, friendlyHttpError, ProviderError, type ProviderId } from './types'

/**
 * Abschrift einer Aufnahme durch den gewählten KI-Anbieter (KI-Diktat).
 */

const PROMPT =
  'Schreibe wörtlich auf, was in dieser Aufnahme gesagt wird. Sprache meist Deutsch. ' +
  'Nur der gesprochene Text, ohne Anführungszeichen, ohne Kommentar. Ist nichts zu verstehen, antworte mit einem leeren Text.'

async function base64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let binary = ''
  const step = 0x8000
  for (let i = 0; i < bytes.length; i += step) binary += String.fromCharCode(...bytes.subarray(i, i + step))
  return btoa(binary)
}

const baseMime = (type: string) => (type.split(';')[0] || 'audio/mp4').trim()

export async function transcribeGemini(audio: Blob, apiKey: string, model: string, signal: AbortSignal): Promise<string> {
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: PROMPT }, { inlineData: { mimeType: baseMime(audio.type), data: await base64(audio) } }] }],
      generationConfig: { temperature: 0 }
    })
  }).catch(failedFetch('Gemini', signal))
  if (!response.ok) throw friendlyHttpError('Gemini', response.status, await response.text().catch(() => ''))
  const json = (await response.json()) as { candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[] }
  return (json.candidates?.[0]?.content?.parts ?? [])
    .filter(p => p.text && !p.thought)
    .map(p => p.text)
    .join('')
}

export async function transcribeOpenAi(audio: Blob, apiKey: string, signal: AbortSignal): Promise<string> {
  const form = new FormData()
  const ext = baseMime(audio.type).includes('webm') ? 'webm' : baseMime(audio.type).includes('ogg') ? 'ogg' : 'm4a'
  form.append('file', audio, `diktat.${ext}`)
  form.append('model', 'gpt-4o-mini-transcribe')
  form.append('language', 'de')
  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    signal,
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form
  }).catch(failedFetch('OpenAI', signal))
  if (!response.ok) throw friendlyHttpError('OpenAI', response.status, await response.text().catch(() => ''))
  const json = (await response.json()) as { text?: string }
  return json.text ?? ''
}

export function transcriber(provider: ProviderId, apiKey: string, model: string) {
  if (!apiKey) throw new ProviderError('Für das KI-Diktat fehlt der Schlüssel.')
  return (audio: Blob, signal: AbortSignal) =>
    provider === 'openai' ? transcribeOpenAi(audio, apiKey, signal) : transcribeGemini(audio, apiKey, model, signal)
}
