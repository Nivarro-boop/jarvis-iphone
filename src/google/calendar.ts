import { googleFetch } from './auth'

const BASE = 'https://www.googleapis.com/calendar/v3/calendars/primary/events'

interface CalendarEvent {
  summary?: string
  location?: string
  start?: { dateTime?: string; date?: string }
  end?: { dateTime?: string; date?: string }
}

const zone = () => Intl.DateTimeFormat().resolvedOptions().timeZone

function startOfDay(offsetDays: number): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + offsetDays)
  return d
}

export async function listEvents(fromDay: number, days: number, signal?: AbortSignal) {
  const params = new URLSearchParams({
    timeMin: startOfDay(fromDay).toISOString(),
    timeMax: startOfDay(fromDay + Math.max(1, Math.min(14, days))).toISOString(),
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '25',
    timeZone: zone()
  })
  const json = (await (await googleFetch(`${BASE}?${params}`, {}, signal)).json()) as { items?: CalendarEvent[] }
  return (json.items ?? []).map(e => ({
    titel: e.summary ?? '(ohne Titel)',
    beginn: e.start?.dateTime ?? e.start?.date ?? '',
    ende: e.end?.dateTime ?? e.end?.date ?? '',
    ganztaegig: !e.start?.dateTime,
    ort: e.location
  }))
}

/** Lokale Zeit „2026-10-24T15:00“ (ohne Zone) in der Zeitzone des iPhones eintragen. */
export async function createEvent(title: string, start: string, minutes: number, location: string | undefined, signal?: AbortSignal) {
  const begin = new Date(start)
  if (Number.isNaN(begin.getTime())) throw new Error('Ungültiger Beginn. Format: 2026-10-24T15:00')
  const end = new Date(begin.getTime() + Math.max(5, Math.min(24 * 60, minutes)) * 60_000)
  const local = (d: Date) => {
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`
  }
  const response = await googleFetch(
    BASE,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        summary: title,
        ...(location ? { location } : {}),
        start: { dateTime: local(begin), timeZone: zone() },
        end: { dateTime: local(end), timeZone: zone() }
      })
    },
    signal
  )
  const json = (await response.json()) as { htmlLink?: string }
  return { eingetragen: true, link: json.htmlLink }
}
