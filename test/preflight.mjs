// Pre-flight validation (src/service/preflight.js): the manifest panel's checks beyond what the plan refuses.
//  node test/preflight.mjs
import assert from 'node:assert/strict'
import { preflight } from '../src/service/preflight.js'

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

const GOOD = { prompt: 'Meera at the temple at dawn.', seconds: 8, beats: [], media: [], extraLoras: [] }
const levels = (issues) => issues.map((i) => i.level)

ok('a clean shot has nothing to say', () => {
  assert.deepEqual(preflight(GOOD), [])
})

ok('an empty prompt and bad beats are errors', () => {
  const issues = preflight({ prompt: '  ', seconds: 8, beats: [{ from: 3, to: 1, action: 'x' }] })
  assert.deepEqual(levels(issues), ['error', 'error'])
  assert.match(issues[0].text, /prompt is empty/)
  assert.match(issues[1].text, /end after the start/)
})

ok('picked files that have gone are errors, named by file', () => {
  const issues = preflight({ ...GOOD, media: [{ kind: 'picture', file: '/pics/temple.jpg' }], voiceLine: '/lines/a.wav' }, { fileExists: () => false })
  assert.deepEqual(levels(issues), ['error', 'error'])
  assert.match(issues[0].text, /temple\.jpg isn't on this PC/)
  assert.match(issues[1].text, /voice line/)
})

ok('a LoRA twice, an unknown LoRA and heavy stacking are warnings', () => {
  const loras = ['a.safetensors', 'a.safetensors', 'b.safetensors', 'c.safetensors', 'd.safetensors'].map((name) => ({ name, strength: 0.8 }))
  const issues = preflight({ ...GOOD, extraLoras: loras }, { loraKnown: (l) => l !== 'd.safetensors' })
  assert.deepEqual(levels(issues), ['warn', 'warn', 'warn'])
  assert.match(issues[0].text, /same LoRA twice \(a\.safetensors\)/)
  assert.match(issues[1].text, /d\.safetensors isn't in any LoRA folder/)
  assert.match(issues[2].text, /5 LoRAs on one shot/)
})

ok('lines too long for the shot are a warning, sized in seconds', () => {
  const long = `<d>[English] ${'word '.repeat(30)}</d>` // 30 words ≈ 12s + a breath, in an 8s shot
  const issues = preflight({ ...GOOD, prompt: `She speaks. ${long}` })
  assert.deepEqual(levels(issues), ['warn'])
  assert.match(issues[0].text, /about 13s to say in a 8s shot/)
  assert.deepEqual(preflight({ ...GOOD, prompt: 'She speaks. <d>[English] I see it.</d>' }), [])
})

ok('a beat’s line is checked against its own seconds, and counts toward the shot’s', () => {
  const beats = [{ from: 0, to: 4, action: 'she speaks', dialogue: 'word '.repeat(15).trim() }] // ≈ 6.5s of speech in a 4s beat
  const issues = preflight({ ...GOOD, beats })
  assert.deepEqual(levels(issues), ['warn'])
  assert.match(issues[0].text, /Beat 1 \(0–4s\): the line takes about 7s to say in 4s/)
  // a longer shot keeps the beat warning away but the shot's own budget can still trip
  const roomy = preflight({ ...GOOD, seconds: 15, beats: [{ from: 0, to: 8, dialogue: 'word '.repeat(15).trim() }] })
  assert.deepEqual(roomy, [])
})

ok('a beat asked to do everything at once is a warning', () => {
  const beats = [{ from: 0, to: 2, camera: 'wide', action: 'she runs', dialogue: 'go!', expression: 'wild', lighting: 'strobe' }]
  const issues = preflight({ ...GOOD, beats })
  assert.deepEqual(levels(issues), ['warn'])
  assert.match(issues[0].text, /Beat 1 packs 5 directions into 2s/)
})

console.log(`\n${n - failed} of ${n} passed`)
process.exit(failed ? 1 : 0)
