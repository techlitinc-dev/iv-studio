// The planning assistant (Phase 5): turns the director's brief into a proposed Shot Contract. The writer
// proposes — fills gaps, never changes what the director fixed — and the house cleaners (contract.js,
// beats.js) enforce the contract's rules on the answer, with one repair round when the draft breaks them.
// Locked paths are restored over the answer, not trusted. The proposal is a diff for the director to
// approve; only then does the compiler (beats.js) turn the contract into the prompt the model reads. The
// prompt writer stays a compiler and an assistant, not the director.
import { askWriter } from './filmcraft.js'
import { cleanBeats, compileBeats } from './beats.js'
import { SHOT_SIZES } from './camera.js'
import {
  cleanIntent,
  cleanLocks,
  cleanMotionStyle,
  DEFAULT_MOTION_STYLE,
  LOCK_FIELDS,
  MOTION_STYLES,
  MOTION_PRINCIPLES,
  SHOT_ROLES,
  motionPhrase,
  motionTags
} from './contract.js'

const FRAMINGS = Object.keys(SHOT_SIZES)
const STYLES = Object.keys(MOTION_STYLES)
const first = (v) => String(v ?? '').trim().split(/\s+/)[0] || 'Someone'

// The writer's answer shape: a Shot Contract plus a word about the choices.
export const PLANNER_SCHEMA = {
  type: 'object',
  properties: {
    contract: {
      type: 'object',
      properties: {
        intent: {
          type: 'object',
          properties: {
            purpose: { type: 'string' },
            objective: { type: 'string' },
            obstacle: { type: 'string' },
            reveals: { type: 'string' },
            turn: { type: 'string' },
            emotion: { type: 'object', properties: { start: { type: 'string' }, end: { type: 'string' } } },
            relation: { type: 'object', properties: { prev: { type: 'string' }, next: { type: 'string' } } },
            role: { type: 'string' }
          }
        },
        locks: { type: 'object', properties: Object.fromEntries(LOCK_FIELDS.map((f) => [f, { type: 'boolean' }])) },
        motion_style: { type: 'string' },
        beats: {
          type: 'array',
          maxItems: 5,
          items: {
            type: 'object',
            properties: {
              from: { type: 'number' },
              to: { type: 'number' },
              camera: { type: 'string' },
              action: { type: 'string' },
              dialogue: { type: 'string' },
              expression: { type: 'string' },
              lighting: { type: 'string' },
              sound: { type: 'string' },
              framing: { type: 'string' },
              eyeline: { type: 'string' },
              motion_principles: { type: 'array', items: { type: 'string' } }
            }
          }
        }
      }
    },
    reply: { type: 'string' }
  },
  required: ['contract', 'reply']
}

const principlesByStyle = () =>
  STYLES.map((s) => `- ${s}: ${motionTags(s).map((id) => `${id} (${motionPhrase(id, s)})`).join('; ')}`).join('\n')

const SYSTEM = `You are the planning assistant inside a film studio. Turn the director's brief into a Shot Contract: the structured direction — intent, locks, a motion style, timed beats — that a compiler turns into the shot's prompt. You propose; the director decides. The contract's rules are hard: an answer that breaks them is refused and sent back.

The rules:
- Fill gaps; never change what the brief or the current contract already fixes. Paths the director locked are restored over your answer — leave them exactly as given.
- intent: the shot's purpose, the character's objective and obstacle, what it reveals, its turn, where the feeling starts and ends, and its role (${Object.keys(SHOT_ROLES).join(', ')}). Write these because the validator and the take review read them — only what the brief truly implies, no padding. A field you have nothing for is left out — never an empty string.
- Beats: up to 5, from/to in seconds inside the shot, end after start, no overlaps, and every boundary on a quarter second (0.25, 0.5, 0.75, 1, 1.25…) so it lands on a whole frame. Together they span the shot; the last ends at its end. One moment per beat: a beat asked to do two things lands neither.
- Each beat: camera as plain cinematography words ("Wide shot; slow dolly in"), the action, and only what the brief implies — expression, eyeline (who or what is looked at), dialogue (the exact words, only when the brief speaks them), lighting, sound. framing, when useful, is one of: ${FRAMINGS.join(', ')}.
- motion_style is one of: ${STYLES.join(', ')}. Direct motion only when the movement itself matters, and only from that style's principles (at most 4 on one beat):
${principlesByStyle()}
- locks: which of ${LOCK_FIELDS.join(', ')} must hold across the take (true) and which may change (false). Default: everything holds.
Answer as JSON: "contract" is the Shot Contract; "reply" is one or two sentences on the choices you made.`

// Dotted paths into the contract ('beats.0.action', 'intent.emotion.start').
const getPath = (o, p) => p.split('.').reduce((x, k) => x?.[/^\d+$/.test(k) ? Number(k) : k], o)
const setPath = (o, p, v) => {
  const ks = p.split('.')
  let t = o
  for (let i = 0; i < ks.length - 1; i++) {
    t = t?.[/^\d+$/.test(ks[i]) ? Number(ks[i]) : ks[i]]
    if (t == null) return
  }
  if (typeof t === 'object' && t !== null) t[ks[ks.length - 1]] = v
}

// The director's current values, restored over the writer's answer — a locked field is a fact, not a wish.
export function withFrozen(contract, current = {}, locked = []) {
  for (const path of locked) {
    const v = getPath(current, path)
    if (v !== undefined && v !== null && v !== '') setPath(contract, path, v)
  }
  return contract
}

// The writer's raw answer through the house cleaners: the contract's rules enforced, worded errors thrown
// (they become the repair note). Frozen paths stay for withFrozen, which runs after this.
export function tidyProposal(out, { seconds = 5 } = {}) {
  const c = out?.contract || {}
  const intent = cleanIntent(c.intent)
  const locks = cleanLocks(c.locks)
  const motionStyle = cleanMotionStyle(c.motion_style) || DEFAULT_MOTION_STYLE
  const beats = cleanBeats(c.beats, seconds, { motionStyle })
  return { intent, locks, motion_style: motionStyle, beats }
}

// The proposal against the current contract, one row per real change: { where, before, after }.
const BEAT_FIELDS = ['from', 'to', 'camera', 'action', 'expression', 'dialogue', 'eyeline', 'framing', 'lighting', 'sound', 'motion_principles']
const say = (v) => (v == null || v === '' ? '—' : Array.isArray(v) ? (v.length ? v.join(', ') : '—') : typeof v === 'object' ? JSON.stringify(v) : String(v))

export function contractDiff(current = {}, proposed = {}) {
  const rows = []
  const push = (where, before, after) => {
    if (say(before) !== say(after)) rows.push({ where, before: say(before), after: say(after) })
  }
  const ci = current.intent || {}
  const pi = proposed.intent || {}
  for (const k of ['purpose', 'objective', 'obstacle', 'reveals', 'turn', 'role']) push(`intent.${k}`, ci[k], pi[k])
  for (const k of ['start', 'end']) push(`intent.emotion.${k}`, ci.emotion?.[k], pi.emotion?.[k])
  for (const k of ['prev', 'next']) push(`intent.relation.${k}`, ci.relation?.[k], pi.relation?.[k])
  push('motion_style', current.motion_style, proposed.motion_style)
  for (const f of LOCK_FIELDS) push(`locks.${f}`, current.locks?.[f], proposed.locks?.[f])
  const cb = current.beats || []
  const pb = proposed.beats || []
  for (let i = 0; i < Math.max(cb.length, pb.length); i++) {
    for (const f of BEAT_FIELDS) push(`beat ${i + 1} ${f}`, cb[i]?.[f], pb[i]?.[f])
  }
  return rows
}

// brief: the director's words. current: the contract being extended. locked: dotted paths to keep. Returns
// { contract, reply, changed } — the diff the director approves. ask is injectable for the tests.
export async function planContract(writer, { brief, seconds = 5, prompt = '', current = {}, locked = [], cpu = false } = {}, { ask = askWriter } = {}) {
  const b = String(brief || '').trim()
  if (!b) throw new Error('Give the brief in words first — what the shot must do.')
  if (!(Number(seconds) > 0)) throw new Error('The shot needs a length in seconds.')
  const cur = { intent: null, locks: null, motion_style: null, beats: [], ...current }
  const frozen = locked.map((p) => `${p} (kept: ${say(getPath(cur, p))})`)
  const user = [
    `The shot: ${seconds} seconds.${prompt ? ` Its prompt so far: "${String(prompt).slice(0, 600)}"` : ''}`,
    current.beats?.length || current.intent || current.motion_style ? `The current contract:\n${JSON.stringify({ intent: cur.intent, locks: cur.locks, motion_style: cur.motion_style, beats: cur.beats })}` : '',
    locked.length ? `Locked — your answer is restored over these, so leave them exactly as given:\n${frozen.join('\n')}` : '',
    `DIRECTOR'S BRIEF:\n${b}`
  ]
    .filter(Boolean)
    .join('\n\n')
  let last = null
  for (let attempt = 0; attempt < 2; attempt++) {
    const out = await ask(writer, {
      system: SYSTEM,
      user: attempt ? `${user}\n\nYour last answer broke the contract's rules:\n${last}\nAnswer again with the whole JSON object, in the same shape, fixing exactly that.` : user,
      schema: PLANNER_SCHEMA,
      cpu,
      temperature: 0.5,
      ctx: 16376
    })
    try {
      const contract = withFrozen(tidyProposal(out, { seconds }), cur, locked)
      return { contract, reply: String(out?.reply || '').trim(), changed: contractDiff(cur, contract) }
    } catch (e) {
      last = e.message
    }
  }
  throw new Error(`The planner couldn't write a clean contract: ${last}`)
}

// A contract through the same cleaners, nothing proposed: what render_shot will accept, and the timeline
// block the compiler would add. For the MCP check_shot_contract tool and the tests.
export function checkContract({ seconds = 5, intent = null, locks = null, motion_style = null, beats = [] } = {}) {
  const errors = []
  let contract = null
  try {
    contract = tidyProposal({ contract: { intent, locks, motion_style, beats } }, { seconds })
  } catch (e) {
    errors.push(e.message)
  }
  return {
    ok: !errors.length,
    errors,
    ...(contract
      ? {
          contract,
          timeline: contract.beats.length ? compileBeats(contract.beats, { intent: contract.intent, locks: contract.locks, motionStyle: contract.motion_style }) : ''
        }
      : {})
  }
}

// What agents read before planning (get_guide topic "shot-contract").
export const PLANNER_GUIDE = `## The Shot Contract

The layer above the prompt. A shot's direction is structured intent — the studio compiles it into the H3 prompt, and the take review judges the take against it. You assist with it; you never own it. The director's locked fields are facts: fill gaps, never change them.

- intent: purpose, objective, obstacle, reveals, turn, emotion {start, end}, relation {prev, next}, role (${Object.keys(SHOT_ROLES).join(', ')}).
- locks: ${LOCK_FIELDS.join(', ')} — true holds across the take, false may change, absent keeps the house rule (everything holds).
- motion_style: ${STYLES.join(', ')} — how motion principles read (live-action subtle; anime and stylized 3D strong, with squash-and-stretch, smears, pose-to-pose).
- beats: up to 5 timed moments ({from, to} seconds, quarter-second boundaries, spanning the shot, no overlaps), each with camera words, action, and only what matters: expression, eyeline, dialogue (exact words), lighting, sound, framing (${FRAMINGS.join(', ')}), motion_principles (that style's tags, at most 4).
- Where it lives on a render request: beats, motion_style, intent, locks.

Tools: plan_shot (a brief in, a proposed contract out — it never changes locked paths), check_shot_contract (validate a contract and see its compiled timeline). After the director approves a plan, put beats/motion_style/intent/locks on the render request (render_shot) or the shot's run.`
