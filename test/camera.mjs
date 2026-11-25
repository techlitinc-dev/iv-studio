// Structured cinematography (src/service/camera.js): the pick cleaned, the camera sentence, and the
// prompt with the camera in front.  node test/camera.mjs
import assert from 'node:assert/strict'
import { ANGLES, cameraText, cleanCamera, MOVEMENTS, PACES, SHOT_SIZES, withCamera } from '../src/service/camera.js'
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

ok('every list has words for its ids', () => {
  for (const list of [SHOT_SIZES, ANGLES, MOVEMENTS, PACES]) for (const [id, text] of Object.entries(list)) assert.ok(id && text, id)
})

ok('the pick keeps known values only; pace needs a move that isn’t static', () => {
  assert.equal(cleanCamera(null), null)
  assert.equal(cleanCamera({ size: 'huge', pace: 'slow' }), null)
  assert.deepEqual(cleanCamera({ size: 'wide', movement: 'static', pace: 'slow' }), { size: 'wide', movement: 'static' })
  assert.deepEqual(cleanCamera({ movement: 'dolly', pace: 'slow' }), { movement: 'dolly', pace: 'slow' })
})

ok('the camera sentence reads like a cinematographer wrote it', () => {
  assert.equal(cameraText({ size: 'wide', angle: 'eye-level', movement: 'dolly', pace: 'slow' }), 'Wide shot, at eye level, slow dolly in')
  assert.equal(cameraText({ movement: 'handheld' }), 'The shot, handheld')
  assert.equal(cameraText({ size: 'close' }), 'Close-up')
  assert.equal(cameraText(null), null)
})

ok('the prompt gets the camera sentence in front, and stays put without one', () => {
  assert.equal(withCamera('She waits.', null), 'She waits.')
  assert.equal(withCamera('She waits.', { size: 'close' }), 'Close-up.\nShe waits.')
})

ok('a request’s camera reaches the graph prompt and the plan, cleaned', () => {
  const plan = planPreviews({ prompt: 'She waits at the door.', character: 'none', camera: { size: 'close', movement: 'dolly', pace: 'slow', junk: 1 } }, [])
  assert.ok(plan.values['87'].startsWith('Close-up, slow dolly in.\nShe waits at the door.'))
  assert.deepEqual(plan.request.camera, { size: 'close', movement: 'dolly', pace: 'slow' })
  const plain = planPreviews({ prompt: 'She waits.', character: 'none' }, [])
  assert.equal(plain.values['87'], 'She waits.')
  assert.equal(plain.request.camera, null)
})

console.log(`\n${n - failed} of ${n} passed`)
process.exit(failed ? 1 : 0)
