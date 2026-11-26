// The planning assistant (src/service/planner.js): the writer proposes a Shot Contract, the house cleaners
// enforce its rules (one repair round), locked paths are restored not trusted, and the answer comes back as
// a diff to approve.  node test/planner.mjs
import assert from 'node:assert/strict'
import { checkContract, contractDiff, PLANNER_GUIDE, planContract, tidyProposal, withFrozen } from '../src/service/planner.js'

let n = 0
let failed = 0
const ok = async (name, fn) => {
  n++
  try {
    await fn()
    console.log('ok', name)
  } catch (err) {
    failed++
    console.log('FAIL', name, '-', err.message)
  }
}

const GOOD = {
  contract: {
    intent: { purpose: 'Meera decides the gate is a way in, not a wall', emotion: { start: 'uneasy', end: 'determined' }, role: 'coverage' },
    locks: { wardrobe: true, location: true },
    motion_style: 'live_action',
    beats: [
      { from: 0, to: 2.5, camera: 'Wide shot; slow dolly in', action: 'Meera crosses the yard toward the gate', motion_principles: ['anticipation'] },
      { from: 2.5, to: 8, camera: 'Medium; settles', action: 'She sees the gate standing open and decides to go in', expression: 'resolve setting in', eyeline: 'the gate' }
    ]
  },
  reply: 'Two beats: the approach, then the decision at the gate.'
}

const stub = (answers) => {
  const calls = []
  const ask = async (writer, opts) => (calls.push(opts), answers[Math.min(calls.length - 1, answers.length - 1)])
  return { ask, calls }
}

ok('a clean proposal comes through the cleaners, beats clamped to the shot', async () => {
  const c = tidyProposal(GOOD, { seconds: 8 })
  assert.equal(c.intent.purpose, 'Meera decides the gate is a way in, not a wall')
  assert.equal(c.motion_style, 'live_action')
  assert.equal(c.beats.length, 2)
  assert.equal(c.beats[0].motion_principles[0], 'anticipation')
  assert.equal(c.locks.wardrobe, true)
})

ok('the cleaners refuse what breaks the contract, in words', async () => {
  assert.throws(() => tidyProposal({ contract: { intent: { role: 'explosion' } } }, { seconds: 8 }), /role is one of/)
  assert.throws(() => tidyProposal({ contract: { beats: [{ from: 0, to: 3, action: 'a' }, { from: 2, to: 4, action: 'b' }] } }, { seconds: 8 }), /overlap/)
  assert.throws(() => tidyProposal({ contract: { beats: [{ from: 0, to: 4, action: 'a', motion_principles: ['squash_stretch'] }] } }, { seconds: 8 }), /squash_stretch/)
})

ok('locked paths are restored over the answer, not trusted', async () => {
  const current = { intent: { emotion: { start: 'calm', end: 'calm' } }, beats: [{ from: 0, to: 2, action: 'She waits' }] }
  const proposed = { intent: { emotion: { start: 'afraid', end: 'resolved' } }, beats: [{ from: 0, to: 2, action: 'She runs' }] }
  const kept = withFrozen(structuredClone(proposed), current, ['intent.emotion.start', 'beats.0.action'])
  assert.equal(kept.intent.emotion.start, 'calm', 'the frozen start holds')
  assert.equal(kept.intent.emotion.end, 'resolved', 'the rest of the emotion still moves')
  assert.equal(kept.beats[0].action, 'She waits')
  // a lock with no current value leaves the proposal alone (a gap, not a fact)
  const gap = withFrozen(structuredClone(proposed), {}, ['intent.emotion.start'])
  assert.equal(gap.intent.emotion.start, 'afraid')
})

ok('planContract: a good brief returns the contract, the reply and the diff', async () => {
  const { ask, calls } = stub([GOOD])
  const r = await planContract(null, { brief: 'she crosses the yard and decides at the gate', seconds: 8 }, { ask })
  assert.equal(calls.length, 1)
  assert.match(calls[0].user, /she crosses the yard/)
  assert.equal(r.contract.beats.length, 2)
  assert.equal(r.reply, 'Two beats: the approach, then the decision at the gate.')
  const rows = r.changed.filter((d) => d.where === 'beat 1 action' || d.where === 'intent.purpose')
  assert.ok(rows.length, 'the diff names what the proposal adds')
})

ok('planContract: a draft that breaks the rules is sent back once, with the checker\'s words', async () => {
  const bad = { contract: { intent: { role: 'explosion' }, beats: GOOD.contract.beats }, reply: 'trying' }
  const { ask, calls } = stub([bad, GOOD])
  const r = await planContract(null, { brief: 'x', seconds: 8 }, { ask })
  assert.equal(calls.length, 2)
  assert.match(calls[1].user, /role is one of/)
  assert.equal(r.contract.intent.role, 'coverage')
})

ok('planContract: two broken drafts stop, saying why', async () => {
  const bad = { contract: { intent: { role: 'explosion' } }, reply: '' }
  const { ask } = stub([bad, bad])
  await assert.rejects(() => planContract(null, { brief: 'x', seconds: 8 }, { ask }), /couldn't write a clean contract/)
  const { ask: ask2 } = stub([GOOD])
  await assert.rejects(() => planContract(null, { brief: '   ', seconds: 8 }, { ask: ask2 }), /brief in words/)
})

ok('planContract: locked paths reach the writer and survive its mutiny', async () => {
  const mutinous = structuredClone(GOOD)
  mutinous.contract.intent.emotion.start = 'afraid'
  mutinous.contract.beats[0].action = 'She runs at the gate'
  const current = { intent: { emotion: { start: 'calm', end: 'steady' } }, beats: [{ from: 0, to: 2.5, action: 'She crosses the yard toward the gate' }] }
  const { ask, calls } = stub([mutinous])
  const r = await planContract(null, { brief: 'x', seconds: 8, current, locked: ['intent.emotion.start', 'beats.0.action'] }, { ask })
  assert.match(calls[0].user, /Locked/)
  assert.equal(r.contract.intent.emotion.start, 'calm')
  assert.equal(r.contract.beats[0].action, 'She crosses the yard toward the gate')
  assert.equal(r.changed.find((d) => d.where === 'beats.0.action'), undefined)
  assert.ok(r.changed.find((d) => d.where === 'intent.purpose'))
})

ok('contractDiff: one row per real change, quiet about what matches', async () => {
  const rows = contractDiff({ intent: { purpose: 'a' }, beats: [{ from: 0, to: 2, action: 'x' }] }, { intent: { purpose: 'a', role: 'reaction' }, beats: [{ from: 0, to: 2, action: 'y' }], motion_style: 'anime' })
  const wheres = rows.map((r) => r.where)
  assert.ok(!wheres.includes('intent.purpose'))
  assert.ok(wheres.includes('intent.role'))
  assert.ok(wheres.includes('beat 1 action'))
  assert.ok(wheres.includes('motion_style'))
  assert.deepEqual(rows.find((r) => r.where === 'beat 1 action'), { where: 'beat 1 action', before: 'x', after: 'y' })
})

ok('checkContract: the acceptance gate, with the compiled timeline', async () => {
  const good = checkContract({ seconds: 8, ...GOOD.contract })
  assert.equal(good.ok, true)
  assert.equal(good.errors.length, 0)
  assert.match(good.timeline, /Shot timeline \(0s to 8s/)
  assert.match(good.timeline, /Motion: a small wind-up before the move/)
  const bad = checkContract({ seconds: 8, beats: [{ from: 3, to: 1, action: 'y' }], intent: { role: 'x' } })
  assert.equal(bad.ok, false)
  assert.match(bad.errors.join(' '), /end after the start/)
  assert.match(bad.errors.join(' '), /role is one of/)
  assert.equal(bad.timeline, undefined)
})

ok('the guide tells agents what the contract is and who owns it', async () => {
  assert.match(PLANNER_GUIDE, /## The Shot Contract/)
  assert.match(PLANNER_GUIDE, /plan_shot/)
  assert.match(PLANNER_GUIDE, /check_shot_contract/)
  assert.match(PLANNER_GUIDE, /never own it/)
})

ok('a writer\'s blank fields don\'t stop the plan — blanks drop', async () => {
  const blankish = structuredClone(GOOD)
  blankish.contract.intent.obstacle = ''
  blankish.contract.intent.objective = '   '
  const { ask, calls } = stub([blankish])
  const r = await planContract(null, { brief: 'x', seconds: 8 }, { ask })
  assert.equal(calls.length, 1, 'no repair round needed')
  assert.equal(r.contract.intent.obstacle, null)
  assert.equal(r.contract.intent.objective, null)
  assert.equal(r.contract.intent.purpose, GOOD.contract.intent.purpose)
})

const done = async () => {
  console.log(`\n${n - failed} of ${n} passed`)
  process.exit(failed ? 1 : 0)
}
await done()
