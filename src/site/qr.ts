import qrcode from 'qrcode-generator'

/** QR-Code als SVG mit hellem Rand — Kameras lesen ihn auch auf dunklen Seiten. */
export function renderQr(target: HTMLElement, text: string): void {
  const qr = qrcode(0, 'M')
  qr.addData(text)
  qr.make()
  const size = qr.getModuleCount()
  let path = ''
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) if (qr.isDark(r, c)) path += `M${c} ${r}h1v1h-1z`
  }
  target.innerHTML = `<svg viewBox="-2 -2 ${size + 4} ${size + 4}" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges"><rect x="-2" y="-2" width="${size + 4}" height="${size + 4}" fill="#fff" rx="2"/><path d="${path}" fill="#05070b"/></svg>`
}
