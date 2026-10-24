import './site.css'

// Kopierknöpfe: Am iPhone tippt sich eine JSON-Vorlage schlecht ab.
for (const button of document.querySelectorAll<HTMLButtonElement>('button[data-copy]')) {
  button.addEventListener('click', async () => {
    const source = document.getElementById(button.dataset.copy ?? '')
    if (!source) return
    try {
      await navigator.clipboard.writeText(source.textContent ?? '')
      button.textContent = 'kopiert'
    } catch {
      button.textContent = 'bitte markieren und kopieren'
    }
  })
}
