// The Shot Contract: the structured intent above the prompt (Phase 1 of the directing architecture).
// A shot carries intent (why the shot exists and what changes in it) and locks (what must not change),
// alongside its timed beats (beats.js). The planner proposes these, the validator (later phase) checks
// them, the prompt compiler (beats.js) turns them into the brief's words, and the take review reads the
// same contract — the prompt writer stays a compiler, not the director. Pure, so the window, the MCP
// server and the tests share it. zod schemas are the shape; the cleaners throw the worded errors the
// window shows with the other request errors.
import { z } from 'zod'

// What a shot is for, in the cut (director's taxonomy; the validator's pacing rules read this later).
export const SHOT_ROLES = {
  coverage: 'essential coverage',
  transition: 'a transition',
  reaction: 'a reaction',
  pause: 'a visual pause'
}

// What a lock true holds across the take. An explicit false means the compiler says it may change;
// absent means the house rule (it stays the same) is left untouched.
export const LOCK_FIELDS = ['character_identity', 'wardrobe', 'location', 'look', 'loras']
export const LOCK_LABELS = {
  character_identity: "the character's identity",
  wardrobe: 'the wardrobe',
  location: 'the location',
  look: 'the visual style',
  loras: 'the LoRA styles'
}

// Motion and performance vocabulary (the Motion and Performance section), tag -> the words compiled into
// The Motion and Performance vocabulary. Each principle's line is what the beat's prompt says; where a
// style plays the principle differently the line is per style — live-action reads them subtly (small
// wind-ups, restraint), anime and stylized 3D read them hard (big anticipation, squash-and-stretch,
// pose-to-pose). "only" gates a principle to the styles that have it: live-action has no squash-and-stretch
// or smears. Tags outside this list are dropped, like cleanCamera's unknown picks.
export const MOTION_STYLES = {
  live_action: {
    label: 'Live-action',
    mode: 'Movement throughout: naturalistic — physical weight, real inertia, small gestures, breathing and blinks; nothing cartoonish.'
  },
  anime: {
    label: 'Anime / 2D',
    mode: 'Movement throughout: drawn animation — strong anticipation, squash-and-stretch, pose-to-pose timing, smears and holds.'
  },
  stylized_3d: {
    label: 'Stylized 3D',
    mode: 'Movement throughout: stylized 3D animation — clear anticipation, follow-through, measured exaggeration, pose-to-pose timing.'
  }
}
export const DEFAULT_MOTION_STYLE = 'live_action'
export const MAX_PRINCIPLES = 4

const LA = 'live_action'
const AN = 'anime'
const TREED = 'stylized_3d'
export const MOTION_PRINCIPLES = {
  anticipation: {
    label: 'Anticipation',
    line: { [LA]: 'a small wind-up before the move', [AN]: 'a big readable wind-up before the move', [TREED]: 'a clear wind-up before the move' }
  },
  staging: { label: 'Staging', line: 'a readable silhouette and clear staging' },
  timing: { label: 'Timing', line: 'deliberate timing rather than even spacing' },
  slow_in_out: { label: 'Slow in / out', line: 'slow in and slow out of the move' },
  arcs: { label: 'Arcs', line: 'the move travelling an arc rather than a straight line' },
  follow_through: {
    label: 'Follow-through',
    line: { [LA]: 'follow-through settling naturally after the move', [AN]: 'loose follow-through and overlap after the move', [TREED]: 'follow-through carrying past the move' }
  },
  secondary_action: {
    label: 'Secondary action',
    line: { [LA]: 'small secondary motion in hair, cloth and hands', [AN]: 'loose secondary action overlapping the main move', [TREED]: 'secondary motion layered on the main move' }
  },
  weight: {
    label: 'Weight',
    line: { [LA]: 'physical weight and firm foot contact', [AN]: 'heavy weight with a settle after each move', [TREED]: 'visible weight, balance and gravity' }
  },
  inertia: { label: 'Inertia', line: 'inertia and momentum in the move' },
  exaggeration: {
    label: 'Exaggeration',
    line: { [LA]: 'restraint, never cartoonish', [AN]: 'bold exaggeration for readability', [TREED]: 'measured exaggeration for appeal' }
  },
  pose_clarity: {
    label: 'Pose clarity',
    line: { [LA]: 'the key poses reading clearly', [AN]: 'strong pose-to-pose key drawings', [TREED]: 'clear key poses with clean transitions' }
  },
  micro_expression: {
    label: 'Breathing & micro-expressions',
    line: { [LA]: 'breathing, a blink and small eye movements', [AN]: 'a held pose with one telling micro-expression', [TREED]: 'breathing, blinks and eye darts between poses' }
  },
  reaction_delay: {
    label: 'Reaction delay',
    line: { [LA]: 'a beat of delay before the reaction', [AN]: 'a held beat, then an explosive reaction', [TREED]: 'a short delay, then the reaction' }
  },
  hold: { label: 'Hold', line: 'a held moment of stillness' },
  squash_stretch: {
    label: 'Squash & stretch',
    only: [AN, TREED],
    line: { [AN]: 'squash-and-stretch on impact and take-off', [TREED]: 'soft squash-and-stretch on impact' }
  },
  smear: { label: 'Smear frames', only: [AN], line: 'smear frames on fast moves' },
  pose_to_pose: {
    label: 'Pose to pose',
    only: [AN, TREED],
    line: { [AN]: 'pose-to-pose timing with clean in-betweens', [TREED]: 'pose-to-pose timing between key poses' }
  },
  appeal: { label: 'Appeal', only: [AN, TREED], line: 'charming appeal in the poses' }
}

// The beat's compiled words for one principle in one style.
export const motionPhrase = (id, style = DEFAULT_MOTION_STYLE) => {
  const line = MOTION_PRINCIPLES[id]?.line
  return typeof line === 'string' ? line : line?.[style] || line?.[DEFAULT_MOTION_STYLE] || id
}

// The principles a style has: what the UI offers and cleanBeats accepts.
export const motionTags = (style = DEFAULT_MOTION_STYLE) => Object.keys(MOTION_PRINCIPLES).filter((id) => !MOTION_PRINCIPLES[id].only || MOTION_PRINCIPLES[id].only.includes(style))

const short = (label, max = 300) =>
  z
    .string({ required_error: `${label} needs words.`, invalid_type_error: `${label} needs words.` })
    .trim()
    .min(1, `${label} needs words.`)
    .max(max, `${label} is long: keep it under ${max} characters.`)

// An empty string means "not directed": the contract is sparse, like beats — a blank field drops instead of
// failing (writers leave "" for things they have nothing for; the UI clears fields the same way).
const sparseStr = (label, max = 300) => z.preprocess((v) => (typeof v === 'string' && !v.trim() ? undefined : v), short(label, max).optional())
const sparseEnd = (label) => z.preprocess((v) => (typeof v === 'string' && !v.trim() ? undefined : v), short(label, 120))

export const intentSchema = z.object({
  purpose: sparseStr('The shot\'s purpose'),
  objective: sparseStr('The character\'s objective'),
  obstacle: sparseStr('The character\'s obstacle'),
  reveals: sparseStr('What the shot reveals to the audience'),
  turn: sparseStr('The shot\'s turn'),
  emotion: z
    .preprocess(
      // a half emotion (one blank end) drops whole: a one-sided arc is noise to the take review
      (v) => (v && typeof v === 'object' && (!String(v.start ?? '').trim() || !String(v.end ?? '').trim()) ? undefined : v),
      z.object({ start: sparseEnd('Where the shot starts emotionally'), end: sparseEnd('Where the shot ends emotionally') }).optional()
    )
    .optional(),
  relation: z
    .object({
      prev: sparseStr('What the previous shot leaves', 200),
      next: sparseStr('What the next shot needs', 200)
    })
    .optional(),
  role: z
    .string()
    .trim()
    .max(40)
    .refine((v) => !v || v in SHOT_ROLES, { message: `role is one of: ${Object.keys(SHOT_ROLES).join(', ')}.` })
    .optional()
})

// The intent cleaned for a request: unknown keys stripped, empty fields dropped, null when nothing is
// directed (a shot without intent renders exactly as before). Throws worded errors, as cleanBeats does.
export function cleanIntent(given) {
  if (!given || typeof given !== 'object') return null
  const out = intentSchema.safeParse(given)
  if (!out.success) throw new Error(out.error.issues.map((i) => i.message).join(' '))
  const d = out.data
  const intent = {}
  for (const k of ['purpose', 'objective', 'obstacle', 'reveals', 'turn']) if (d[k]) intent[k] = d[k]
  if (d.emotion) intent.emotion = d.emotion
  if (d.relation && (d.relation.prev || d.relation.next)) {
    intent.relation = { ...(d.relation.prev ? { prev: d.relation.prev } : {}), ...(d.relation.next ? { next: d.relation.next } : {}) }
  }
  if (d.role) intent.role = d.role
  return Object.keys(intent).length ? intent : null
}

// The locks cleaned: booleans only (an explicit false is a real choice — the thing may change), anything
// else ignored; null when no lock is named.
export function cleanLocks(given) {
  if (!given || typeof given !== 'object') return null
  const locks = {}
  for (const f of LOCK_FIELDS) if (typeof given[f] === 'boolean') locks[f] = given[f]
  return Object.keys(locks).length ? locks : null
}

// The motion style cleaned (null when not named -> the caller's default). Unknown styles are an error, like
// an unknown aspect: a planner that asks for a style this studio doesn't play should hear it.
export function cleanMotionStyle(v) {
  const s = String(v ?? '').trim()
  if (!s) return null
  if (!MOTION_STYLES[s]) throw new Error(`Unknown motion_style "${s}". Use ${Object.keys(MOTION_STYLES).join(', ')}.`)
  return s
}
