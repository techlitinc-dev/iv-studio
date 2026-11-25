// Long headings render small: a header that carries a long text (a film's name, a character's, an agent's title)
// wraps huge in the display face, so any h1–h3 over LONG characters gets the h-long class and studio.css shrinks
// it (zoom, so each kind of header keeps its own size and the Accessibility text size still applies). The app sets
// header texts from data everywhere, so a watcher tags them all instead of a class in every component.
const LONG = 42
const SELECTOR = 'h1, h2, h3'

function tagAll() {
  for (const h of document.querySelectorAll(SELECTOR)) {
    const long = (h.textContent || '').trim().length > LONG
    if (long !== h.classList.contains('h-long')) h.classList.toggle('h-long', long)
  }
}

export function watchLongHeadings() {
  let queued = false
  const schedule = () => {
    if (queued) return
    queued = true
    requestAnimationFrame(() => {
      queued = false
      tagAll()
    })
  }
  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true, characterData: true })
  tagAll()
}
