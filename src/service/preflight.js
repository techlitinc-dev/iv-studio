// Pre-flight validation (the Director Workspace's Shot Manifest): the checks worth making before a GPU
// spins, beyond what plan.js already refuses. Pure — the app (render:preflight) hands in the two lookups
// that need a disk: whether a file is on this PC, and whether a LoRA is one Techlit Studio can find.
// Each issue is { level: 'error' | 'warn', text } — errors mean the render will fail or lose something,
// warns are judgement calls the person can wave through ("Render anyway").
import { cleanBeats, BEAT_FIELDS } from './beats.js'
import { spokenLines } from './ranking.js'

const base = (p) => String(p).replace(/\\/g, '/').split('/').pop()
// ~2.5 words a second is unhurried screen speech; each line also costs a breath
const speechSeconds = (lines) => lines.reduce((s, l) => s + l.split(/\s+/).filter(Boolean).length / 2.5 + 0.5, 0)

export function preflight(request, { fileExists = () => true, loraKnown = () => true } = {}) {
  const r = request || {}
  const issues = []
  const err = (text) => issues.push({ level: 'error', text })
  const warn = (text) => issues.push({ level: 'warn', text })

  if (!String(r.prompt || '').trim()) err('The prompt is empty.')
  let beats = []
  try {
    beats = cleanBeats(r.beats, r.seconds ?? 15)
  } catch (e) {
    err(e.message)
  }

  // files picked earlier that have moved or gone since
  for (const m of r.media || []) if (m?.file && !fileExists(m.file)) err(`${base(m.file)} isn't on this PC any more — pick it again.`)
  if (r.voiceLine && !fileExists(r.voiceLine)) err("The voice line's file isn't on this PC any more — pick it again.")

  // the shot's LoRAs: duplicates, ones no folder has, and heavy stacking
  const names = (r.extraLoras || []).map((l) => String(l?.name || '').replace(/\\/g, '/')).filter(Boolean)
  const dupes = [...new Set(names.filter((n, i) => names.indexOf(n) !== i))]
  if (dupes.length) warn(`The same LoRA twice (${dupes.map(base).join(', ')}): the second one does nothing.`)
  for (const n of names) if (!loraKnown(n)) warn(`${base(n)} isn't in any LoRA folder Techlit Studio can see, here or in the cloud.`)
  if (names.length > 4) warn(`${names.length} LoRAs on one shot is heavy stacking: past four they fight each other more than they add.`)

  // each beat: its line against its own seconds, and how much one moment is asked to do
  for (const [i, b] of beats.entries()) {
    const len = b.to - b.from
    if (b.dialogue) {
      const need = speechSeconds([b.dialogue.replace(/<\/?d>/g, '')])
      if (need > len) warn(`Beat ${i + 1} (${b.from}–${b.to}s): the line takes about ${Math.ceil(need)}s to say in ${len}s.`)
    }
    const directed = BEAT_FIELDS.filter((f) => b[f])
    if (directed.length >= 4 && len < 3) warn(`Beat ${i + 1} packs ${directed.length} directions into ${len}s: the model keeps what fits and drops the rest.`)
  }

  // all the spoken words — the prompt's lines and every beat's — against the shot's length
  const lines = [...spokenLines(String(r.prompt || '')), ...beats.map((b) => (b.dialogue || '').replace(/<\/?d>/g, '').trim()).filter(Boolean)]
  if (lines.length && r.seconds > 0) {
    const need = speechSeconds(lines)
    if (need > r.seconds) warn(`The lines take about ${Math.round(need)}s to say in a ${r.seconds}s shot: the last words will be rushed or cut.`)
  }
  return issues
}
