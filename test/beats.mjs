// Timed beats (src/service/beats.js): cleaning a shot's timeline, compiling it into the prompt, and how a
// request's beats reach the graph and the plan.  node test/beats.mjs
import assert from 'node:assert/strict'
import { cleanBeats, compileBeats, MAX_BEATS, withBeats } from '../src/service/beats.js'
import { planPreviews } from '../src/service/plan.js'

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

const BEATS = [
  { from: 0, to: 2, camera: 'Wide shot; slow dolly forward', action: 'Meera stands outside the temple, hesitant' },
  { from: 2, to: 5, camera: 'Medium shot; camera stops', action: 'She notices the kite string and reaches toward it' },
  { from: 5, to: 8, camera: 'Slow push toward her face', action: 'Her expression changes from uncertainty to determination' }
]

ok('no beats, empty rows and non-arrays clean to nothing', () => {
  assert.deepEqual(cleanBeats(null, 8), [])
  assert.deepEqual(cleanBeats([], 8), [])
  assert.deepEqual(cleanBeats([{ from: 0, to: 4, camera: '', action: '' }], 8), [])
})

ok('beats are trimmed, sorted and clamped to the shot', () => {
  const b = cleanBeats([{ from: 4, to: 20, camera: ' B ', action: '' }, { from: 0, to: 4, camera: 'A', action: ' x ' }], 8)
  assert.deepEqual(b, [
    { from: 0, to: 4, camera: 'A', action: 'x' },
    { from: 4, to: 8, camera: 'B' } // the empty action stays off the beat
  ])
})

ok('a beat clamped under half a second falls away; the rest stay', () => {
  const b = cleanBeats([{ from: 0, to: 5, action: 'stays' }, { from: 7.8, to: 9, action: 'gone' }], 8)
  assert.deepEqual(b.map((x) => x.action), ['stays'])
})

ok('too many beats, a backwards beat and an overlap are said in words', () => {
  assert.throws(() => cleanBeats(Array.from({ length: MAX_BEATS + 1 }, (_, i) => ({ from: i, to: i + 1, action: 'x' })), 15), /up to 5 timed beats/)
  assert.throws(() => cleanBeats([{ from: 4, to: 2, action: 'x' }], 8), /end after the start/)
  assert.throws(() => cleanBeats([{ from: 0, to: 3, action: 'x' }, { from: 2, to: 5, action: 'y' }], 8), /overlap at 2s/)
})

ok('the compiled block is the timeline, one take, and the locks', () => {
  const text = compileBeats(cleanBeats(BEATS, 8))
  assert.match(text, /^Shot timeline \(0s to 8s, one continuous take with no cuts and no camera angle reversals\):/)
  assert.match(text, /\n0-2s: Wide shot; slow dolly forward\. Meera stands outside the temple, hesitant\./)
  assert.match(text, /\n5-8s: Slow push toward her face\. Her expression changes from uncertainty to determination\./)
  assert.match(text, /stay the same across the whole timeline\.$/)
})

ok('a beat directs dialogue, expression, lighting and sound too; empty fields stay off the beat', () => {
  const b = cleanBeats([{ from: 0, to: 4, camera: ' Close-up ', action: '', dialogue: ' मैं यहीं हूँ ', expression: ' calm ', lighting: '', sound: ' a temple bell ' }], 8)
  assert.deepEqual(b, [{ from: 0, to: 4, camera: 'Close-up', dialogue: 'मैं यहीं हूँ', expression: 'calm', sound: 'a temple bell' }])
  const text = compileBeats(b)
  assert.match(text, /\n0-4s: Close-up\. calm\. Sound: a temple bell\. Dialogue: <d>मैं यहीं हूँ<\/d>\./)
})

ok('dialogue written with its own tag passes through untouched', () => {
  const text = compileBeats(cleanBeats([{ from: 0, to: 4, dialogue: 'Meera says <d>[Hindi] मैं यहीं हूँ</d> softly' }], 8))
  assert.match(text, /\n0-4s: Meera says <d>\[Hindi\] मैं यहीं हूँ<\/d> softly\./)
})

ok('withBeats appends the block, and leaves a beatless prompt alone', () => {
  assert.equal(withBeats('A lake at dawn.', []), 'A lake at dawn.')
  const p = withBeats('A lake at dawn.', cleanBeats(BEATS, 8))
  assert.ok(p.startsWith('A lake at dawn.\n\nShot timeline'))
})

ok('a request’s beats reach the graph prompt and stay on the plan, cleaned', () => {
  const plan = planPreviews({ prompt: 'Meera at the temple.', character: 'none', seconds: 8, beats: [...BEATS, { from: 0, to: 0, camera: '', action: '' }] }, [])
  assert.match(plan.values['87'], /^Meera at the temple\.\n\nShot timeline \(0s to 8s/)
  assert.equal(plan.request.beats.length, 3)
  assert.deepEqual(plan.request.beats[1], BEATS[1])
  const plain = planPreviews({ prompt: 'Meera at the temple.', character: 'none' }, [])
  assert.equal(plain.values['87'], 'Meera at the temple.')
  assert.deepEqual(plain.request.beats, [])
})

ok('bad beats stop the plan with the other request errors', () => {
  assert.throws(() => planPreviews({ prompt: 'x', character: 'none', seconds: 8, beats: [{ from: 3, to: 1, action: 'y' }] }, []), /end after the start/)
})

console.log(`\n${n - failed} of ${n} passed`)
process.exit(failed ? 1 : 0)
