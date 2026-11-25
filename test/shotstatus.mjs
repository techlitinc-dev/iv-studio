// Shot statuses and labels (src/service/shotstatus.js): the one state a shot shows, and the manual label's
// cleanup.  node test/shotstatus.mjs
import assert from 'node:assert/strict'
import { cleanLabel, SHOT_MARKS, SHOT_STATES, shotState, STATE_NAME } from '../src/service/shotstatus.js'

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

const job = (status, outputs = []) => ({ status, outputs })
const take = job('success', [{ kind: 'preview' }])

ok('every state has a name, and every mark is a state', () => {
  for (const s of SHOT_STATES) assert.ok(STATE_NAME[s], s)
  for (const m of SHOT_MARKS) assert.ok(SHOT_STATES.includes(m), m)
})

ok('an open job beats everything: the shot is rendering', () => {
  assert.equal(shotState({ status: 'locked' }, [take, job('running')]), 'rendering')
  assert.equal(shotState(null, [job('queued')]), 'rendering')
})

ok('else the person’s mark, then the work to review, then drafting', () => {
  assert.equal(shotState({ status: 'approved' }, [take]), 'approved')
  assert.equal(shotState({ status: 'ready' }, []), 'ready')
  assert.equal(shotState({ status: null }, [take]), 'review')
  assert.equal(shotState({ status: null }, [job('error')]), 'drafting')
  assert.equal(shotState({}, []), 'drafting')
  // a success with no watchable output (a failed enhance, a text job) isn't "review"
  assert.equal(shotState(null, [job('success', [])]), 'drafting')
})

ok('a label is tidied to letters, digits, dot, dash and underscore, 24 at most', () => {
  assert.equal(cleanLabel('  SC_04_SH_03A '), 'SC_04_SH_03A')
  assert.equal(cleanLabel('sc 04/sh:03a'), 'sc_04_sh_03a')
  assert.equal(cleanLabel('x'.repeat(40)).length, 24)
  assert.equal(cleanLabel('   '), null)
  assert.equal(cleanLabel(null), null)
})

console.log(`\n${n - failed} of ${n} passed`)
process.exit(failed ? 1 : 0)
