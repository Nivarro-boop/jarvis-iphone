/**
 * Baut das Installationsprofil (.mobileconfig) für die Ein-Tipp-Installation.
 *
 * Ein Profil mit einem „Web Clip“ legt James als Symbol auf den Home-Bildschirm
 * und startet ihn im Vollbild wie eine App — ohne App Store und ohne die
 * Schritte über „Teilen“. iOS zeigt dabei „Nicht signiert“, weil das Profil
 * nicht mit einem Apple-Zertifikat unterschrieben ist; das ist bei
 * selbstgebauten Profilen normal.
 *
 * Die Kennungen sind fest, damit eine neuere Fassung des Profils die alte
 * ersetzt statt ein zweites Symbol anzulegen.
 */
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

const escape = text => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** Feste UUID aus einem Namen: gleiche App, gleiches Profil, ersetzt statt doppelt. */
function stableUuid(name) {
  const h = createHash('sha1').update(name).digest('hex').toUpperCase()
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-A${h.slice(17, 20)}-${h.slice(20, 32)}`
}

export function webClipProfile({ url, iconFile, label = 'James', id = 'james', description }) {
  const ident = id === 'james' ? 'io.github.nivarro-boop.james' : `io.github.nivarro-boop.james.${id}`
  const clipUuid = id === 'james' ? '7D0E3A52-2C41-4B7E-9C1A-5A3E0B9F1C11' : stableUuid(`${id}.webclip`)
  const profileUuid = id === 'james' ? '3B6F2D8E-9A47-4C1D-8E55-2F7C4A1B6D20' : stableUuid(id)
  const about = description ?? 'Legt James, deinen Sprachassistenten, als App auf den Home-Bildschirm. Enthält nur das Symbol und die Adresse – keine Einstellungen, keine Zugriffe auf das iPhone.'
  const icon = readFileSync(iconFile).toString('base64').replace(/(.{76})/g, '$1\n')
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>PayloadContent</key>
  <array>
    <dict>
      <key>FullScreen</key>
      <true/>
      <key>IgnoreManifestScope</key>
      <false/>
      <key>Icon</key>
      <data>
${icon}
      </data>
      <key>IsRemovable</key>
      <true/>
      <key>Label</key>
      <string>${escape(label)}</string>
      <key>Precomposed</key>
      <true/>
      <key>URL</key>
      <string>${escape(url)}</string>
      <key>PayloadDisplayName</key>
      <string>${escape(label)} – Symbol auf dem Home-Bildschirm</string>
      <key>PayloadIdentifier</key>
      <string>${ident}.webclip</string>
      <key>PayloadType</key>
      <string>com.apple.webClip.managed</string>
      <key>PayloadUUID</key>
      <string>${clipUuid}</string>
      <key>PayloadVersion</key>
      <integer>1</integer>
    </dict>
  </array>
  <key>PayloadDescription</key>
  <string>${escape(about)}</string>
  <key>PayloadDisplayName</key>
  <string>${escape(label)}</string>
  <key>PayloadIdentifier</key>
  <string>${ident}</string>
  <key>PayloadOrganization</key>
  <string>James</string>
  <key>PayloadRemovalDisallowed</key>
  <false/>
  <key>PayloadType</key>
  <string>Configuration</string>
  <key>PayloadUUID</key>
  <string>${profileUuid}</string>
  <key>PayloadVersion</key>
  <integer>1</integer>
</dict>
</plist>
`
}
