// The sequence look (the Director Workspace's inheritance, §7): the sequence's character, LoRAs, shape,
// size and shot length flow into every shot it renders shot by shot — studio.huntShot builds each shot's
// request from shotLook, and studio.shotKey re-keys a shot whose inherited look changed, so its old runs
// read as stale (the continuity recalculation). A field the sequence locks stays the sequence's own; any
// other field a shot may override, and its row shows what is inherited and what is overridden.
import { cleanSequenceLoras } from './sequence.js'

export const LOOK_FIELDS = ['character', 'loras', 'aspect', 'megapixels', 'shotSeconds']
export const LOOK_NAME = { character: 'Character', loras: 'LoRAs', aspect: 'Shape', megapixels: 'Size', shotSeconds: 'Shot length' }

// The look one shot renders with: the sequence's, plus the shot's own overrides where the sequence hasn't
// locked the field. `overridden` lists the fields the shot set itself (for the inherited/overridden display).
export function shotLook(seq, shot) {
  const locks = seq?.locks || {}
  const look = { character: seq?.character, loras: seq?.loras || [], aspect: seq?.aspect, megapixels: seq?.megapixels, shotSeconds: seq?.shotSeconds }
  const overridden = []
  for (const f of LOOK_FIELDS) {
    const v = shot?.look?.[f]
    if (!locks[f] && v !== undefined && v !== null) {
      look[f] = v
      overridden.push(f)
    }
  }
  return { ...look, overridden }
}

// A shot's own look, tidied for saving: known fields only, LoRAs cleaned like the sequence's. Null when empty.
export function cleanShotLook(look) {
  const out = {}
  for (const f of LOOK_FIELDS) if (look?.[f] !== undefined && look[f] !== null) out[f] = f === 'loras' ? cleanSequenceLoras(look[f]) : look[f]
  return Object.keys(out).length ? out : null
}

// The lock flags, tidied: known fields, set ones only.
export function cleanLocks(locks) {
  return Object.fromEntries(LOOK_FIELDS.filter((f) => locks?.[f]).map((f) => [f, true]))
}

// Which look fields a patch changes — the "this re-keys shots that already have renders" warning's list.
export const lookChanges = (seq, patch) => LOOK_FIELDS.filter((f) => f in (patch || {}) && JSON.stringify(patch[f] ?? null) !== JSON.stringify(seq?.[f] ?? null))
