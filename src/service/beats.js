// Timed beats (the Shot Control Timeline): a shot's direction split into moments instead of one large prompt.
// Stored on the render request as beats: [{from, to, camera, action}] (seconds, from Create's Timeline field),
// kept with the shot in plan.request, and compiled into the prompt as a timeline block — no new model or
// ComfyUI nodes: the model reads the beats as part of its brief, and the take review (review.js) judges the
// take against them.

export const MAX_BEATS = 5
// what one beat can direct (tracks-lite): each compiled into its timeline line when filled
export const BEAT_FIELDS = ['camera', 'action', 'dialogue', 'expression', 'lighting', 'sound']

const num = (v) => Math.round(Number(v) * 10) / 10
const fmt = (v) => (Number.isInteger(v) ? String(v) : v.toFixed(1))

// The beats cleaned for a shot of `seconds`: rows with nothing directed dropped, the rest clamped to the
// shot and sorted. Throws (plan.js shows it with the other request errors) when more than MAX_BEATS are
// directed, a beat's end isn't after its start, or two beats overlap. No beats given -> [].
export function cleanBeats(given, seconds) {
  const rows = (Array.isArray(given) ? given : [])
    .map((b) => {
      // sparse: a beat keeps only the fields it directs, so old two-field beats stay exactly as they were
      const row = { from: num(b?.from), to: num(b?.to) }
      for (const f of BEAT_FIELDS) {
        const v = String(b?.[f] ?? '').trim()
        if (v) row[f] = v
      }
      return row
    })
    .filter((b) => BEAT_FIELDS.some((f) => b[f]))
  if (!rows.length) return []
  if (rows.length > MAX_BEATS) throw new Error(`A shot takes up to ${MAX_BEATS} timed beats.`)
  if (rows.some((b) => !(b.from >= 0) || !(b.to > b.from))) throw new Error('Each beat needs a start and an end in seconds, the end after the start.')
  const inShot = rows.map((b) => ({ ...b, from: Math.min(b.from, seconds), to: Math.min(b.to, seconds) })).filter((b) => b.to - b.from >= 0.5).sort((a, b) => a.from - b.from)
  for (let i = 1; i < inShot.length; i++) if (inShot[i].from < inShot[i - 1].to) throw new Error(`Beats overlap at ${fmt(inShot[i].from)}s: a beat starts where the one before ends, or later.`)
  return inShot
}

// One beat as a timeline line: camera, action, expression, lighting, then sound and dialogue, each only
// when directed. Dialogue keeps its own <d> tag when the person wrote one (a subject, a language), else
// it's wrapped so the model, the speech checks and the take review all hear it as spoken words.
const beatLine = (b) => {
  const parts = [b.camera, b.action, b.expression, b.lighting].filter(Boolean)
  if (b.sound) parts.push(`Sound: ${b.sound}`)
  if (b.dialogue) parts.push(/<d>/.test(b.dialogue) ? b.dialogue : `Dialogue: <d>${b.dialogue}</d>`)
  return parts.join('. ')
}

// The prompt block for cleaned beats: the timeline, then what holds across it — the timeline's locks
// (character, look, place, style) and camera direction (one take, no cuts, no reversed angles), said to the model.
export function compileBeats(beats) {
  return [
    `Shot timeline (${fmt(beats[0].from)}s to ${fmt(beats[beats.length - 1].to)}s, one continuous take with no cuts and no camera angle reversals):`,
    ...beats.map((b) => `${fmt(b.from)}-${fmt(b.to)}s: ${beatLine(b)}.`),
    'The character, wardrobe, location, visual style and camera direction stay the same across the whole timeline.'
  ].join('\n')
}

// The prompt the model reads: the brief, then its timeline. No beats -> the prompt unchanged.
export const withBeats = (prompt, beats) => (beats?.length ? `${String(prompt || '').trim()}\n\n${compileBeats(beats)}` : prompt)
