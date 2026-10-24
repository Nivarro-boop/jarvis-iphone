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
  target.innerHTML = `<svg viewBox="-4 -4 ${size + 8} ${size + 8}" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges" style="width:100%;height:auto;display:block;stroke:none"><rect x="-4" y="-4" width="${size + 8}" height="${size + 8}" fill="#fff" rx="2"/><path d="${path}" fill="#05070b"/></svg>`
}
