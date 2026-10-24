import { beforeEach, describe, expect, it } from 'vitest'
import { accessToken, completeSignIn, validClientId } from '../src/google/auth'
import { bodyText, buildMime, decodeBase64Url, encodeBase64Url } from '../src/google/gmail'

describe('Gmail-Hilfen', () => {
  it('kodiert Umlaute verlustfrei in base64url', () => {
    const text = 'Grüße aus Wien – ½ €'
    const encoded = encodeBase64Url(text)
    expect(encoded).not.toMatch(/[+/=]/)
    expect(decodeBase64Url(encoded)).toBe(text)
  })

  it('baut eine Mail mit kodiertem Betreff', () => {
    const mime = buildMime('anna@example.com', 'Grüße', 'Hallo Anna')
    expect(mime).toContain('To: anna@example.com\r\n')
    expect(mime).toMatch(/Subject: =\?UTF-8\?B\?.+\?=/)
    expect(mime.endsWith('\r\n\r\nHallo Anna')).toBe(true)
  })

  it('liest Text aus verschachtelten Teilen, zur Not aus HTML', () => {
    const plain = { mimeType: 'multipart/alternative', parts: [{ mimeType: 'text/plain', body: { data: encodeBase64Url('Klartext') } }] }
    expect(bodyText(plain)).toBe('Klartext')
    const html = { mimeType: 'text/html', body: { data: encodeBase64Url('<p>Hallo<br>Welt</p><script>x()</script>') } }
    expect(bodyText(html)).toBe('Hallo\nWelt')
  })
})

describe('Google-Anmeldung', () => {
  beforeEach(() => localStorage.clear())

  it('erkennt Client-IDs', () => {
    expect(validClientId('123-abc.apps.googleusercontent.com')).toBe(true)
    expect(validClientId('https://evil.example')).toBe(false)
  })

  it('übernimmt das Token nur mit passendem state und entfernt es aus der Adresse', () => {
    localStorage.setItem('james.google.state', JSON.stringify('s1'))
    history.replaceState(null, '', '/#access_token=tok&expires_in=3600&state=s1')
    expect(completeSignIn()).toEqual({ ok: true })
    expect(location.hash).toBe('')
    expect(accessToken()).toBe('tok')
  })

  it('lehnt fremde Rückleitungen ab', () => {
    localStorage.setItem('james.google.state', JSON.stringify('s1'))
    expect(completeSignIn('#access_token=boese&state=anders')).toEqual({ ok: false, error: expect.stringContaining('nicht von dieser App') })
    expect(accessToken()).toBeNull()
    expect(completeSignIn('#skill=koch')).toBeNull()
  })
})
