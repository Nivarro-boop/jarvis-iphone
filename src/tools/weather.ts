/**
 * Wetter aus offenen Daten (Open-Meteo): kein Konto, kein Schlüssel.
 */

const CODES: Record<number, string> = {
  0: 'klar', 1: 'überwiegend klar', 2: 'teils bewölkt', 3: 'bedeckt',
  45: 'Nebel', 48: 'Raureifnebel',
  51: 'leichter Niesel', 53: 'Niesel', 55: 'starker Niesel', 56: 'gefrierender Niesel', 57: 'starker gefrierender Niesel',
  61: 'leichter Regen', 63: 'Regen', 65: 'starker Regen', 66: 'gefrierender Regen', 67: 'starker gefrierender Regen',
  71: 'leichter Schneefall', 73: 'Schneefall', 75: 'starker Schneefall', 77: 'Schneegriesel',
  80: 'leichte Schauer', 81: 'Schauer', 82: 'heftige Schauer', 85: 'Schneeschauer', 86: 'starke Schneeschauer',
  95: 'Gewitter', 96: 'Gewitter mit Hagel', 99: 'schweres Gewitter mit Hagel'
}

export function describeCode(code: number): string {
  return CODES[code] ?? 'unbekannt'
}

export interface Place {
  name: string
  lat: number
  lon: number
}

export async function geocode(name: string, signal?: AbortSignal): Promise<Place | null> {
  const url = `https://geocoding-api.open-meteo.com/v1/search?count=1&language=de&name=${encodeURIComponent(name)}`
  const response = await fetch(url, { signal })
  if (!response.ok) throw new Error(`Ortssuche fehlgeschlagen (${response.status}).`)
  const json = (await response.json()) as { results?: { name: string; latitude: number; longitude: number; country?: string }[] }
  const hit = json.results?.[0]
  return hit ? { name: hit.country ? `${hit.name}, ${hit.country}` : hit.name, lat: hit.latitude, lon: hit.longitude } : null
}

export function currentPosition(): Promise<Place> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) return reject(new Error('Dieses Gerät kann seinen Standort nicht teilen.'))
    navigator.geolocation.getCurrentPosition(
      p => resolve({ name: 'hier', lat: p.coords.latitude, lon: p.coords.longitude }),
      () => reject(new Error('Standort nicht freigegeben. Nenn mir einfach einen Ort.')),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 10 * 60_000 }
    )
  })
}

export async function weather(place: Place, signal?: AbortSignal) {
  const params = new URLSearchParams({
    latitude: String(place.lat),
    longitude: String(place.lon),
    current: 'temperature_2m,apparent_temperature,weather_code,wind_speed_10m,precipitation',
    daily: 'temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code',
    timezone: 'auto',
    forecast_days: '3'
  })
  const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, { signal })
  if (!response.ok) throw new Error(`Wetterdienst nicht erreichbar (${response.status}).`)
  const json = (await response.json()) as {
    current: { temperature_2m: number; apparent_temperature: number; weather_code: number; wind_speed_10m: number; precipitation: number }
    daily: { time: string[]; temperature_2m_max: number[]; temperature_2m_min: number[]; precipitation_probability_max: number[]; weather_code: number[] }
  }
  const days = ['heute', 'morgen', 'übermorgen']
  return {
    ort: place.name,
    jetzt: {
      temperatur: Math.round(json.current.temperature_2m),
      gefuehlt: Math.round(json.current.apparent_temperature),
      lage: describeCode(json.current.weather_code),
      wind_kmh: Math.round(json.current.wind_speed_10m),
      niederschlag_mm: json.current.precipitation
    },
    vorhersage: json.daily.time.map((_, i) => ({
      tag: days[i] ?? json.daily.time[i],
      max: Math.round(json.daily.temperature_2m_max[i]),
      min: Math.round(json.daily.temperature_2m_min[i]),
      regenrisiko_prozent: json.daily.precipitation_probability_max[i],
      lage: describeCode(json.daily.weather_code[i])
    }))
  }
}
