// The sequence look (src/service/look.js): what a shot inherits, what it overrides, the locks, and the
// look-change warning's field list.  node test/look.mjs
import assert from 'node:assert/strict'
import { cleanLocks, cleanShotLook, lookChanges, LOOK_FIELDS, LOOK_NAME, shotLook } from '../src/service/look.js'

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

const SEQ = { character: 'tess', loras: [{ name: 'style.safetensors', strength: 0.8 }], aspect: '16:9', megapixels: 0.9, shotSeconds: 10 }

ok('a shot with no look of its own inherits everything', () => {
  const look = shotLook(SEQ, {})
  assert.equal(look.character, 'tess')
  assert.equal(look.aspect, '16:9')
  assert.equal(look.megapixels, 0.9)
  assert.equal(look.shotSeconds, 10)
  assert.deepEqual(look.loras, SEQ.loras)
  assert.deepEqual(look.overridden, [])
})

ok('overrides win where the sequence hasn’t locked the field', () => {
  const shot = { look: { character: 'none', shotSeconds: 15, aspect: '9:16' } }
  const look = shotLook(SEQ, shot)
  assert.equal(look.character, 'none')
  assert.equal(look.shotSeconds, 15)
  assert.equal(look.aspect, '9:16')
  assert.deepEqual(look.overridden.sort(), ['aspect', 'character', 'shotSeconds'])
  // locked: the sequence's own value holds, and the field isn't listed as overridden
  const locked = shotLook({ ...SEQ, locks: { character: true } }, shot)
  assert.equal(locked.character, 'tess')
  assert.ok(!locked.overridden.includes('character'))
})

ok('every field has a name, and null overrides mean inherit', () => {
  for (const f of LOOK_FIELDS) assert.ok(LOOK_NAME[f], f)
  assert.deepEqual(shotLook(SEQ, { look: { character: null } }).overridden, [])
})

ok('a shot’s saved look keeps known fields only, LoRAs cleaned like the sequence’s', () => {
  assert.equal(cleanShotLook(null), null)
  assert.equal(cleanShotLook({}), null)
  assert.equal(cleanShotLook({ nonsense: 1 }), null)
  const look = cleanShotLook({ character: 'tess', loras: [{ name: 'a.safetensors', strength: 5 }, { name: '' }], junk: true })
  assert.equal(look.character, 'tess')
  assert.equal(look.loras.length, 1)
  assert.equal(look.loras[0].strength, 2, 'strength clamped like the sequence’s')
  assert.ok(!('junk' in look))
})

ok('locks keep known, set fields only', () => {
  assert.deepEqual(cleanLocks({ character: true, junk: true, aspect: false }), { character: true })
  assert.deepEqual(cleanLocks(null), {})
})

ok('lookChanges names only the fields a patch really changes', () => {
  assert.deepEqual(lookChanges(SEQ, { character: 'tess' }), [])
  assert.deepEqual(lookChanges(SEQ, { character: 'none', name: 'x', shotSeconds: 15 }).sort(), ['character', 'shotSeconds'])
  assert.deepEqual(lookChanges(SEQ, { loras: [{ name: 'style.safetensors', strength: 0.8 }] }), [])
})

console.log(`\n${n - failed} of ${n} passed`)
process.exit(failed ? 1 : 0)
