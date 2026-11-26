// The Shot Contract (src/service/contract.js): cleaning intent and locks, the structured beat fields
// (framing, camera as an object, eyeline, motion_principles), how they compile into the prompt, and how
// they ride a request through plan.js.  node test/contract.mjs
import assert from 'node:assert/strict'
import { cleanBeats, compileBeats, withBeats, beatLoad } from '../src/service/beats.js'
import { cleanIntent, cleanLocks, MOTION_PRINCIPLES, SHOT_ROLES, LOCK_FIELDS } from '../src/service/contract.js'
import { planPreviews, resolveFrames } from '../src/service/plan.js'

let n = 0
let failed = 0
const ok = (name, fn) => {
  n++
  try {
    fn()
    console.log('ok', name)
  } catch (err) {
    failed++
    console.log('FAIL', name, '-', err.message)
  }
}

const INTENT = {
  purpose: 'Meera realizes the temple gate was opened from inside',
  emotion: { start: 'uncertain', end: 'determined' },
  role: 'reaction',
  extra: 'stripped'
}

ok('intent cleans, trims and strips unknown keys; empty cleans to null', () => {
  assert.deepEqual(cleanIntent({ purpose: '  She decides  ', ...{}, emotion: { start: ' afraid ', end: ' resolved ' } }), { purpose: 'She decides', emotion: { start: 'afraid', end: 'resolved' } })
  assert.deepEqual(cleanIntent(INTENT), { purpose: INTENT.purpose, emotion: INTENT.emotion, role: 'reaction' })
  assert.equal(cleanIntent(null), null)
  assert.equal(cleanIntent({}), null)
  assert.equal(cleanIntent('words'), null)
})

ok('intent needs a known role and real words; a half emotion drops whole', () => {
  assert.equal(cleanIntent({ emotion: { start: 'calm' } }), null, 'an emotion with one end is not an emotion')
  assert.throws(() => cleanIntent({ role: 'explosion' }), /role is one of: coverage, transition, reaction, pause/)
  assert.throws(() => cleanIntent({ purpose: 'x'.repeat(301) }), /keep it under 300 characters/)
  assert.throws(() => cleanIntent({ emotion: { start: 5, end: 'calm' } }), /needs words/)
})

ok('relation keeps one side when only one is written', () => {
  assert.deepEqual(cleanIntent({ relation: { prev: 'the gate slam' } }), { relation: { prev: 'the gate slam' } })
  assert.equal(cleanIntent({ relation: {} }), null)
})

ok('blank fields mean not directed: they drop, they don\'t fail', () => {
  assert.deepEqual(cleanIntent({ purpose: 'She decides', obstacle: '', objective: '  ' }), { purpose: 'She decides' })
  assert.deepEqual(cleanIntent({ purpose: 'x', emotion: { start: 'afraid', end: '' } }), { purpose: 'x' }, 'a half emotion drops whole')
  assert.deepEqual(cleanIntent({ relation: { prev: '', next: 'the slam' } }), { relation: { next: 'the slam' } })
})

ok('locks keep booleans true and false, and nothing else', () => {
  assert.deepEqual(cleanLocks({ character_identity: true, wardrobe: false, loras: 'yes' }), { character_identity: true, wardrobe: false })
  assert.equal(cleanLocks({}), null)
  assert.equal(cleanLocks(null), null)
})

ok('the vocabularies are there for the planner and the validator', () => {
  assert.ok(Object.keys(MOTION_PRINCIPLES).length >= 12 && MOTION_PRINCIPLES.anticipation && MOTION_PRINCIPLES.hold)
  assert.deepEqual(Object.keys(SHOT_ROLES), ['coverage', 'transition', 'reaction', 'pause'])
  assert.deepEqual(LOCK_FIELDS, ['character_identity', 'wardrobe', 'location', 'look', 'loras'])
})

ok('a beat takes framing, a structured camera, an eyeline and motion principles', () => {
  const b = cleanBeats(
    [
      { from: 0, to: 2, framing: 'wide', camera: { movement: 'dolly', speed: 'slow', motivation: "Meera's attention" }, action: 'Meera approaches the temple gate', motion_principles: ['Anticipation', 'weight', 'slow_in_out'] },
      { from: 2, to: 5, action: 'She notices the kite string', eyeline: ' the kite string ', motion_principles: ['arcs', 'follow_through', 'secondary_action'] }
    ],
    8
  )
  assert.deepEqual(b[0], { from: 0, to: 2, framing: 'wide', camera: { movement: 'dolly', speed: 'slow', motivation: "Meera's attention" }, action: 'Meera approaches the temple gate', motion_principles: ['anticipation', 'weight', 'slow_in_out'] })
  assert.deepEqual(b[1], { from: 2, to: 5, action: 'She notices the kite string', eyeline: 'the kite string', motion_principles: ['arcs', 'follow_through', 'secondary_action'] })
  assert.equal(beatLoad(b[0]), 4)
  assert.equal(beatLoad(b[1]), 3)
})

ok('unknown picks drop or refuse, like cleanCamera: framing, movement, speed; principles cap at four', () => {
  assert.throws(() => cleanBeats([{ from: 0, to: 2, framing: 'intimate' }], 8), /Unknown framing "intimate"/)
  assert.throws(() => cleanBeats([{ from: 0, to: 2, camera: { movement: 'hover' } }], 8), /Unknown camera movement "hover"/)
  assert.throws(() => cleanBeats([{ from: 0, to: 2, camera: { speed: 'frantic' } }], 8), /Unknown camera speed "frantic"/)
  assert.throws(() => cleanBeats([{ from: 0, to: 2, action: 'x', motion_principles: ['anticipation', 'arcs', 'weight', 'hold', 'timing'] }], 8), /up to 4 motion principles/)
  const b = cleanBeats([{ from: 0, to: 2, action: 'x', motion_principles: ['anticipation', 'bogus', 'ANTICIPATION'] }], 8)
  assert.deepEqual(b[0].motion_principles, ['anticipation'])
})

ok('a beat with only an eyeline stays; one with nothing directed still falls away', () => {
  assert.deepEqual(cleanBeats([{ from: 0, to: 2, eyeline: 'the kite string' }], 8), [{ from: 0, to: 2, eyeline: 'the kite string' }])
  assert.deepEqual(cleanBeats([{ from: 0, to: 2 }], 8), [])
  assert.deepEqual(cleanBeats([{ from: 0, to: 2, motion_principles: ['bogus'] }], 8), [])
})

ok('the compiled line leads with framing and camera, then action, eyeline and motion', () => {
  const text = compileBeats(
    cleanBeats([{ from: 0, to: 2, framing: 'wide', camera: { movement: 'dolly', speed: 'slow', motivation: "Meera's attention" }, action: 'Meera approaches the gate', eyeline: 'the gate', motion_principles: ['anticipation', 'slow_in_out'] }], 8)
  )
  assert.match(text, /\n0-2s: Wide shot\. slow dolly in, motivated by Meera's attention\. Meera approaches the gate\. Eyeline: the gate\. Motion: a small wind-up before the move; slow in and slow out of the move\./)
})

ok('a legacy words-only beat compiles exactly as it always did', () => {
  const text = compileBeats(cleanBeats([{ from: 0, to: 4, camera: 'Close-up', action: 'she waits' }], 8))
  assert.match(text, /\n0-4s: Close-up\. she waits\./)
  assert.match(text, /stay the same across the whole timeline\.$/)
})

ok('intent opens the block: purpose, then the feeling\'s arc', () => {
  const text = compileBeats(cleanBeats([{ from: 0, to: 4, action: 'x' }], 8), { intent: cleanIntent(INTENT) })
  assert.match(text, /^Shot purpose: Meera realizes the temple gate was opened from inside\. The feeling moves from uncertain to determined\.\nShot timeline/)
})

ok('locks: none named keeps the house sentence; an explicit false may change, the rest stay', () => {
  const beats = cleanBeats([{ from: 0, to: 4, action: 'x' }], 8)
  assert.match(compileBeats(beats), /The character, wardrobe, location, visual style and camera direction stay the same across the whole timeline\.$/)
  const line = compileBeats(beats, { locks: { wardrobe: false, look: false } })
  assert.match(line, /The wardrobe and the visual style may change across the whole timeline\./)
  assert.match(line, /The character's identity, the location, the LoRA styles and the camera direction stay the same across the whole timeline\.$/)
  const all = compileBeats(beats, { locks: { character_identity: false, wardrobe: false, location: false, look: false, loras: false } })
  assert.match(all, /The character's identity, the wardrobe, the location, the visual style and the LoRA styles may change across the whole timeline\. The camera direction stays the same across the whole timeline\.$/)
})

ok('withBeats passes the contract through; beatless prompts stay untouched', () => {
  const beats = cleanBeats([{ from: 0, to: 4, action: 'x' }], 8)
  const p = withBeats('A lake at dawn.', beats, { intent: cleanIntent(INTENT), locks: { wardrobe: false } })
  assert.ok(p.startsWith('A lake at dawn.\n\nShot purpose:'))
  assert.match(p, /The wardrobe may change across the whole timeline\. The character's identity, the location, the visual style, the LoRA styles and the camera direction stay the same across the whole timeline\.$/)
  assert.equal(withBeats('A lake at dawn.', [], { intent: cleanIntent(INTENT) }), 'A lake at dawn.')
})

ok('a request carries the contract through the plan into the prompt, cleaned', () => {
  const plan = planPreviews(
    {
      prompt: 'Meera at the temple.',
      character: 'none',
      seconds: 8,
      duration_frames: resolveFrames(8),
      intent: { purpose: 'Meera realizes the gate was opened from inside', emotion: { start: 'uncertain', end: 'determined' }, objective: 'get inside', obstacle: 'the locked gate' },
      locks: { character_identity: true, wardrobe: false, location: true, look: true, loras: true },
      beats: [{ from: 0, to: 2, framing: 'wide', camera: { movement: 'dolly', speed: 'slow', motivation: "Meera's attention" }, action: 'Meera approaches the temple gate', motion_principles: ['anticipation', 'weight', 'slow_in_out'] }]
    },
    []
  )
  assert.match(plan.values['87'], /^Meera at the temple\.\n\nShot purpose: Meera realizes the gate was opened from inside\. The feeling moves from uncertain to determined\.\nShot timeline/)
  assert.match(plan.values['87'], /Motion: a small wind-up before the move; physical weight and firm foot contact; slow in and slow out of the move\./)
  assert.match(plan.values['87'], /The wardrobe may change across the whole timeline\./)
  assert.deepEqual(plan.request.intent, { purpose: 'Meera realizes the gate was opened from inside', emotion: { start: 'uncertain', end: 'determined' }, objective: 'get inside', obstacle: 'the locked gate' })
  assert.deepEqual(plan.request.locks, { character_identity: true, wardrobe: false, location: true, look: true, loras: true })
})

ok('a request without a contract renders as before: null intent and locks, the house sentence', () => {
  const plan = planPreviews({ prompt: 'A lake at dawn.', character: 'none', seconds: 8, beats: [{ from: 0, to: 4, camera: 'Wide', action: 'it rests' }] }, [])
  assert.equal(plan.request.intent, null)
  assert.equal(plan.request.locks, null)
  assert.match(plan.values['87'], /The character, wardrobe, location, visual style and camera direction stay the same across the whole timeline\.$/)
})

ok('the contract\'s transport fields must match this studio: fps 24, frames on H3\'s grid', () => {
  assert.equal(resolveFrames(8), 192)
  assert.throws(() => planPreviews({ prompt: 'x', character: 'none', seconds: 8, fps: 30 }, []), /fps is 24/)
  assert.throws(() => planPreviews({ prompt: 'x', character: 'none', seconds: 8, duration_frames: 190 }, []), /isn't what 8s renders here \(192 frames on H3's grid\)/)
  let both = ''
  try {
    planPreviews({ prompt: 'x', character: 'none', seconds: 8, intent: { role: 'explosion' }, beats: [{ from: 3, to: 1, action: 'y' }] }, [])
  } catch (e) {
    both = e.message
  }
  assert.match(both, /role is one of/)
  assert.match(both, /end after the start/)
})

console.log(`\n${n - failed} of ${n} passed`)
process.exit(failed ? 1 : 0)
