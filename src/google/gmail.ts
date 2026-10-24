import { googleFetch } from './auth'

const BASE = 'https://gmail.googleapis.com/gmail/v1/users/me'
const MAX_BODY = 4000

interface Header {
  name: string
  value: string
}
interface Part {
  mimeType?: string
  body?: { data?: string }
  parts?: Part[]
  headers?: Header[]
}
interface GmailMessage {
  id: string
  threadId: string
  snippet?: string
  labelIds?: string[]
  payload?: Part
}

const header = (message: GmailMessage, name: string) =>
  message.payload?.headers?.find(h => h.name.toLowerCase() === name.toLowerCase())?.value ?? ''

export function decodeBase64Url(data: string): string {
  const binary = atob(data.replace(/-/g, '+').replace(/_/g, '/'))
  const bytes = Uint8Array.from(binary, c => c.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

export function encodeBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** Text einer Mail: lieber text/plain, sonst HTML ohne Tags. */
export function bodyText(part: Part | undefined): string {
  if (!part) return ''
  const plain = findPart(part, 'text/plain')
  if (plain?.body?.data) return decodeBase64Url(plain.body.data)
  const html = findPart(part, 'text/html')
  if (html?.body?.data) {
    return decodeBase64Url(html.body.data)
      .replace(/<(style|script)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<br\s*\/?>|<\/p>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n\s*\n+/g, '\n\n')
      .trim()
  }
  return ''
}

function findPart(part: Part, mime: string): Part | undefined {
  if (part.mimeType === mime && part.body?.data) return part
  for (const child of part.parts ?? []) {
    const hit = findPart(child, mime)
    if (hit) return hit
  }
  return undefined
}

export async function searchMail(query: string, count = 8, signal?: AbortSignal) {
  const params = new URLSearchParams({ q: query || 'in:inbox', maxResults: String(Math.min(20, Math.max(1, count))) })
  const list = (await (await googleFetch(`${BASE}/messages?${params}`, {}, signal)).json()) as { messages?: { id: string }[] }
  const ids = (list.messages ?? []).map(m => m.id)
  const messages = await Promise.all(
    ids.map(async id => {
      const meta = new URLSearchParams({ format: 'metadata' })
      for (const name of ['From', 'Subject', 'Date']) meta.append('metadataHeaders', name)
      return (await (await googleFetch(`${BASE}/messages/${id}?${meta}`, {}, signal)).json()) as GmailMessage
    })
  )
  return messages.map(m => ({
    id: m.id,
    von: header(m, 'From'),
    betreff: header(m, 'Subject'),
    datum: header(m, 'Date'),
    ungelesen: m.labelIds?.includes('UNREAD') ?? false,
    vorschau: m.snippet ?? ''
  }))
}

export async function readMail(id: string, signal?: AbortSignal) {
  const message = (await (await googleFetch(`${BASE}/messages/${encodeURIComponent(id)}?format=full`, {}, signal)).json()) as GmailMessage
  const text = bodyText(message.payload)
  return {
    von: header(message, 'From'),
    an: header(message, 'To'),
    betreff: header(message, 'Subject'),
    datum: header(message, 'Date'),
    text: text.slice(0, MAX_BODY),
    gekuerzt: text.length > MAX_BODY
  }
}

/** Betreff nach RFC 2047, damit Umlaute ankommen. */
function encodeHeader(value: string): string {
  return /^[\x20-\x7e]*$/.test(value) ? value : `=?UTF-8?B?${btoa(String.fromCharCode(...new TextEncoder().encode(value)))}?=`
}

export function buildMime(to: string, subject: string, body: string): string {
  return [
    `To: ${to}`,
    `Subject: ${encodeHeader(subject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    body
  ].join('\r\n')
}

export async function sendMail(to: string, subject: string, body: string, signal?: AbortSignal) {
  const response = await googleFetch(
    `${BASE}/messages/send`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ raw: encodeBase64Url(buildMime(to, subject, body)) }) },
    signal
  )
  const json = (await response.json()) as { id?: string }
  return { gesendet: true, id: json.id }
}
