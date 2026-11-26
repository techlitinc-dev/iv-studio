// Timed beats (the Shot Control Timeline): a shot's direction split into moments instead of one large prompt.
// Stored on the render request as beats: [{from, to, ...}] (seconds, from Create's Timeline field), kept
// with the shot in plan.request, and compiled into the prompt as a timeline block — no new model or
// ComfyUI nodes: the model reads the beats as part of its brief, and the take review (review.js) judges the
// take against them. A beat's fields (tracks-lite): the six free-text ones (camera as words, action,
// dialogue, expression, lighting, sound) plus the structured Shot Contract ones — framing (a shot size),
// camera as {movement, speed, motivation}, eyeline (who or what is looked at) and motion_principles
// (tags from the Motion and Performance vocabulary, contract.js). Old two-field beats stay as they were.
import { MOVEMENTS, PACES, SHOT_SIZES } from './camera.js'
import { cleanLocks, DEFAULT_MOTION_STYLE, LOCK_FIELDS, LOCK_LABELS, MAX_PRINCIPLES, MOTION_PRINCIPLES, MOTION_STYLES, motionPhrase } from './contract.js'

export const MAX_BEATS = 5
// what one beat can direct as free text: each compiled into its timeline line when filled
export const BEAT_FIELDS = ['camera', 'action', 'dialogue', 'expression', 'lighting', 'sound']

const num = (v) => Math.round(Number(v) * 10) / 10
const fmt = (v) => (Number.isInteger(v) ? String(v) : v.toFixed(1))
const str = (v) => String(v ?? '').trim()

// How much one beat directs (preflight's packing check): the free-text fields, plus one each for a framing
// pick, a structured camera, an eyeline and a motion-principles pick. Legacy beats count as they always did.
export const beatLoad = (b) =>
  BEAT_FIELDS.filter((f) => (f === 'camera' ? typeof b.camera === 'string' && b.camera : b[f])).length +
  (b.framing ? 1 : 0) +
  (typeof b.camera === 'object' ? 1 : 0) +
  (b.eyeline ? 1 : 0) +
  (b.motion_principles?.length ? 1 : 0)

// The beat's camera field: words, as written before, or the structured {movement, speed, motivation}
// (camera.js's vocabularies), compiled into "slow dolly in, motivated by ...".
const cleanBeatCamera = (v) => {
  if (typeof v === 'string') {
    const s = str(v)
    return s ? { camera: s } : {}
  }
  if (!v || typeof v !== 'object') return {}
  const out = {}
  const movement = str(v.movement)
  if (movement) {
    if (!MOVEMENTS[movement]) throw new Error(`Unknown camera movement "${movement}". Use ${Object.keys(MOVEMENTS).join(', ')}.`)
    out.movement = movement
  }
  const speed = str(v.speed)
  if (speed) {
    if (!PACES[speed]) throw new Error(`Unknown camera speed "${speed}". Use ${Object.keys(PACES).join(', ')}.`)
    out.speed = speed
  }
  const motivation = str(v.motivation)
  if (motivation) out.motivation = motivation
  return Object.keys(out).length ? { camera: out } : {}
}

// The beat's motion_principles: tags from contract.js's vocabulary, de-duplicated; tags outside it drop,
// as cleanCamera drops unknown picks. A tag the shot's motion style doesn't have is an error, said in words
// (a planner picks squash_stretch for live-action and should hear why not). At most MAX_PRINCIPLES.
const cleanPrinciples = (given, style) => {
  const tags = [...new Set((Array.isArray(given) ? given : []).map((p) => str(p).toLowerCase()))].filter((p) => MOTION_PRINCIPLES[p])
  if (tags.length > MAX_PRINCIPLES) throw new Error(`A beat takes up to ${MAX_PRINCIPLES} motion principles.`)
  for (const t of tags) {
    const only = MOTION_PRINCIPLES[t].only
    if (only?.length && !only.includes(style)) {
      throw new Error(`"${t}" is a ${only.map((s) => MOTION_STYLES[s].label).join(' / ')} move; motion_style "${style}" (${MOTION_STYLES[style].label}) doesn't have it.`)
    }
  }
  return tags
}

// The beats cleaned for a shot of `seconds`: rows with nothing directed dropped, the rest clamped to the
// shot and sorted. Throws (plan.js shows it with the other request errors) when more than MAX_BEATS are
// directed, a beat's end isn't after its start, or two beats overlap. No beats given -> [].
export function cleanBeats(given, seconds, { motionStyle = DEFAULT_MOTION_STYLE } = {}) {
  const rows = (Array.isArray(given) ? given : [])
    .map((b) => {
      // sparse: a beat keeps only the fields it directs, so old two-field beats stay exactly as they were
      const row = { from: num(b?.from), to: num(b?.to) }
      for (const f of BEAT_FIELDS) {
        const v = str(b?.[f])
        if (v) row[f] = v
      }
      const framing = str(b?.framing)
      if (framing) {
        if (!SHOT_SIZES[framing]) throw new Error(`Unknown framing "${framing}". Use ${Object.keys(SHOT_SIZES).join(', ')}.`)
        row.framing = framing
      }
      Object.assign(row, cleanBeatCamera(b?.camera))
      const eyeline = str(b?.eyeline)
      if (eyeline) row.eyeline = eyeline
      const principles = cleanPrinciples(b?.motion_principles, motionStyle)
      if (principles.length) row.motion_principles = principles
      return row
    })
    .filter((b) => Object.keys(b).length > 2) // from and to alone direct nothing
  if (!rows.length) return []
  if (rows.length > MAX_BEATS) throw new Error(`A shot takes up to ${MAX_BEATS} timed beats.`)
  if (rows.some((b) => !(b.from >= 0) || !(b.to > b.from))) throw new Error('Each beat needs a start and an end in seconds, the end after the start.')
  const inShot = rows.map((b) => ({ ...b, from: Math.min(b.from, seconds), to: Math.min(b.to, seconds) })).filter((b) => b.to - b.from >= 0.5).sort((a, b) => a.from - b.from)
  for (let i = 1; i < inShot.length; i++) if (inShot[i].from < inShot[i - 1].to) throw new Error(`Beats overlap at ${fmt(inShot[i].from)}s: a beat starts where the one before ends, or later.`)
  return inShot
}

// The structured beat's camera as words: "slow dolly in, motivated by Meera's attention". Speed means
// something only with a move that isn't static, as in camera.js.
const camPhrase = (c) => {
  if (typeof c !== 'object' || !c) return null
  const move = c.movement ? [c.speed && c.movement !== 'static' ? PACES[c.speed] : null, MOVEMENTS[c.movement]].filter(Boolean).join(' ') : null
  return [move, c.motivation ? `motivated by ${c.motivation}` : null].filter(Boolean).join(', ')
}

// One beat as a timeline line: framing and camera first, then action, expression, eyeline, the motion
// principles and lighting, then sound and dialogue, each only when directed. Motion principles compile in
// the shot's motion style's words (contract.js). Dialogue keeps its own <d> tag when the person wrote one
// (a subject, a language), else it's wrapped so the model, the speech checks and the take review all hear
// it as spoken words.
const beatLine = (b, style) => {
  const parts = [
    b.framing ? SHOT_SIZES[b.framing] : null,
    typeof b.camera === 'string' ? b.camera : null,
    camPhrase(b.camera),
    b.action,
    b.expression,
    b.eyeline ? `Eyeline: ${b.eyeline}` : null,
    b.motion_principles?.length ? `Motion: ${b.motion_principles.map((p) => motionPhrase(p, style)).join('; ')}` : null,
    b.lighting
  ].filter(Boolean)
  if (b.sound) parts.push(`Sound: ${b.sound}`)
  if (b.dialogue) parts.push(/<d>/.test(b.dialogue) ? b.dialogue : `Dialogue: <d>${b.dialogue}</d>`)
  return parts.join('. ')
}

// "a, b and c" — a list a sentence can speak.
const andList = (items) => (items.length > 1 ? `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}` : items[0])

// What holds across the timeline, from the contract's locks (contract.js): a lock left alone or true stays
// the same; an explicit false may change. No locks named -> the house sentence, unchanged since before the
// contract. The camera direction always holds — one take, no cuts, no reversed angles.
const LOCKED_ALL = 'The character, wardrobe, location, visual style and camera direction stay the same across the whole timeline.'
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1)
function locksLine(locks) {
  const l = cleanLocks(locks)
  if (!l || LOCK_FIELDS.every((f) => l[f] !== false)) return LOCKED_ALL
  const stay = LOCK_FIELDS.filter((f) => l[f] !== false).map((f) => LOCK_LABELS[f])
  const change = LOCK_FIELDS.filter((f) => l[f] === false).map((f) => LOCK_LABELS[f])
  const parts = []
  if (change.length) parts.push(`${cap(andList(change))} may change across the whole timeline.`)
  if (stay.length) parts.push(`${cap(andList([...stay, 'the camera direction']))} stay the same across the whole timeline.`)
  else parts.push('The camera direction stays the same across the whole timeline.')
  return parts.join(' ')
}

// The shot's intent (contract.js) as the block's opening: what the shot is for, and the emotional arc the
// performance must play, so the model reads purpose before timeline.
const intentLine = (intent) => {
  if (!intent) return null
  const parts = [intent.purpose ? `Shot purpose: ${intent.purpose.replace(/[.?!]+$/, '')}.` : null]
  if (intent.emotion) parts.push(`The feeling moves from ${intent.emotion.start} to ${intent.emotion.end}.`)
  return parts.filter(Boolean).join(' ')
}

// The prompt block for cleaned beats: the intent, the timeline — with the motion style's mode sentence when
// any beat directs motion principles, so the model feels the style's dial before the tags — then what holds
// across it all.
export function compileBeats(beats, { intent, locks, motionStyle = DEFAULT_MOTION_STYLE } = {}) {
  const motion = beats.some((b) => b.motion_principles?.length) ? MOTION_STYLES[motionStyle].mode : null
  return [
    intentLine(intent),
    `Shot timeline (${fmt(beats[0].from)}s to ${fmt(beats[beats.length - 1].to)}s, one continuous take with no cuts and no camera angle reversals):`,
    motion,
    ...beats.map((b) => `${fmt(b.from)}-${fmt(b.to)}s: ${beatLine(b, motionStyle)}.`),
    locksLine(locks)
  ].filter(Boolean).join('\n')
}

// The prompt the model reads: the brief, then its timeline. No beats -> the prompt unchanged.
export const withBeats = (prompt, beats, opts) => (beats?.length ? `${String(prompt || '').trim()}\n\n${compileBeats(beats, opts)}` : prompt)
