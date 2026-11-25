// A shot's direction (src/service/direction.js): the audio plan cleaned, the voice line kept in step
// with the dialogue track, and the request handed to Create.  node test/direction.mjs
import assert from 'node:assert/strict'
import { cleanAudioPlan, cleanDirection, directionRequest } from '../src/service/direction.js'

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

ok('the audio plan keeps clips with a file, known kinds, sane numbers', () => {
  const plan = cleanAudioPlan([
    { kind: 'music', file: '/m/dawn.mp3', name: ' Dawn ', start: -2, length: 12.34 },
    { kind: 'nonsense', file: '/s/bell.wav', start: 3.26, length: 0.1 },
    { kind: 'sfx', file: '' },
    'junk'
  ])
  assert.deepEqual(plan, [
    { kind: 'music', file: '/m/dawn.mp3', name: 'Dawn', start: 0, length: 12.3 },
    { kind: 'sfx', file: '/s/bell.wav', name: '', start: 3.3, length: 0.5 }
  ])
  assert.deepEqual(cleanAudioPlan(null), [])
})

ok('the first dialogue clip is the voice line the render lip-syncs to', () => {
  const d = cleanDirection({ prompt: 'x', seconds: 8, voiceLine: '/old.wav', audioPlan: [{ kind: 'voice', file: '/lines/a.wav', start: 0, length: 4 }] })
  assert.equal(d.voiceLine, '/lines/a.wav')
  const none = cleanDirection({ prompt: 'x', seconds: 8, voiceLine: '/old.wav', audioPlan: [{ kind: 'music', file: '/m.mp3', start: 0, length: 4 }] })
  assert.equal(none.voiceLine, '/old.wav')
})

ok('camera and beats go through their own cleaners; bad beats stay for the person to fix', () => {
  const d = cleanDirection({ prompt: 'x', seconds: 8, camera: { size: 'wide', junk: 1 }, beats: [{ from: 0, to: 4, camera: ' A ' }] })
  assert.deepEqual(d.camera, { size: 'wide' })
  assert.deepEqual(d.beats, [{ from: 0, to: 4, camera: 'A' }])
  const overlap = [{ from: 0, to: 5, action: 'a' }, { from: 3, to: 8, action: 'b' }]
  assert.deepEqual(cleanDirection({ prompt: 'x', seconds: 8, beats: overlap }).beats, overlap)
  assert.equal(cleanDirection(null), null)
})

ok('the request handed to Create drops the Director’s bookkeeping', () => {
  const d = cleanDirection({ prompt: 'x', seconds: 8, seed: 7, audioPlan: [{ kind: 'voice', file: '/a.wav', start: 0, length: 4 }] })
  const r = directionRequest(d)
  assert.equal(r.prompt, 'x')
  assert.equal(r.seed, 7)
  assert.equal(r.voiceLine, '/a.wav')
  assert.ok(!('audioPlan' in r) && !('updatedAt' in r))
})

console.log(`\n${n - failed} of ${n} passed`)
process.exit(failed ? 1 : 0)
