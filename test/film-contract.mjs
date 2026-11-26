// The Shot Contract, grouped by project (productions.js): shots own beats / motion_style / intent / locks,
// the drawer and agents edit them through editShot's whitelist, rendering carries them into the request
// (contractFor), the storyboard planner's schema has intent, and planShotContract plans against the shot's
// current contract.  node test/film-contract.mjs
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Productions, shotSchemaFor } from '../src/service/productions.js'
import { filmNameOf } from '../src/service/studio.js'

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

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ivs-film-contract-'))
const films = new Productions({ dataDir: dir, studio: () => null })
const p = films.create({ name: 'The Gate' })
films.patch(p.id, (q) => (q.scenes = [{ id: 's1', heading: 'EXT. GATE - DAY', shots: [{ id: 'a', action: 'Meera waits at the gate.', seconds: 6, prompt: '[Shot 1] Meera waits at the gate.' }] }]))

ok('editShot puts the contract on the shot, and it persists with the film', async () => {
  films.editShot(p.id, 's1', 'a', {
    intent: { purpose: 'she decides the gate is a way in', emotion: { start: 'uneasy', end: 'determined' }, role: 'reaction' },
    motion_style: 'anime',
    beats: [
      { from: 0, to: 3, camera: 'Wide shot', action: 'Meera waits at the gate', motion_principles: ['anticipation'] },
      { from: 3, to: 6, camera: 'Close-up', action: 'She decides to go in', motion_principles: ['hold'] }
    ],
    locks: { wardrobe: true, location: true }
  })
  const sh = films.find(films.get(p.id), 'a').sh
  assert.equal(sh.intent.role, 'reaction')
  assert.equal(sh.motion_style, 'anime')
  assert.equal(sh.beats.length, 2)
  assert.equal(sh.locks.wardrobe, true)
  const reloaded = films.get(p.id)
  assert.equal(films.find(reloaded, 'a').sh.beats[1].action, 'She decides to go in', 'survives the save')
})

ok('contractFor: nothing without a contract, the fields with one', async () => {
  assert.deepEqual(films.contractFor({}), {})
  const sh = films.find(films.get(p.id), 'a').sh
  const c = films.contractFor(sh)
  assert.equal(c.intent.purpose, 'she decides the gate is a way in')
  assert.equal(c.beats.length, 2)
  assert.equal(c.motion_style, 'anime')
  assert.deepEqual(c.locks, { wardrobe: true, location: true })
})

ok('the storyboard planner\'s schema offers intent per shot', async () => {
  const s = shotSchemaFor(30)
  const intent = s.properties.shots.items.properties.intent
  assert.equal(intent.type, 'object')
  assert.equal(intent.properties.role.type, 'string')
  assert.equal(intent.properties.emotion.properties.start.maxLength, 120)
})

const GOOD = {
  contract: {
    intent: { purpose: 'The gate stops being a wall and becomes a door', emotion: { start: 'held', end: 'decided' }, role: 'coverage' },
    motion_style: 'anime',
    beats: [
      { from: 0, to: 2.5, camera: 'Wide; slow push', action: 'Meera crosses the yard', motion_principles: ['anticipation'] },
      { from: 2.5, to: 6, camera: 'Medium; settles', action: 'She sees the open gate and decides', motion_principles: ['pose_to_pose', 'hold'] }
    ]
  },
  reply: 'Approach, then the decision.'
}

ok('planShotContract plans against the shot: its current contract and prompt are the fixed ground', async () => {
  const calls = []
  const ask = async (writer, opts) => (calls.push(opts), GOOD)
  const r = await films.planShotContract(p.id, 's1', 'a', { brief: 'make the decision land', ask })
  assert.equal(calls.length, 1)
  assert.match(calls[0].user, /make the decision land/)
  assert.match(calls[0].user, /she decides the gate is a way in/, 'the shot\'s current contract rides along')
  assert.equal(r.contract.beats.length, 2)
  assert.equal(r.contract.beats[1].motion_principles[0], 'pose_to_pose')
  assert.ok(r.changed.find((d) => d.where === 'intent.purpose'), 'the diff is against what the shot already has')
})

ok('the grammar read sees the shot\'s contract (grouped under the scene)', async () => {
  films.editShot(p.id, 's1', 'a', { beats: [{ from: 0, to: 1.2, camera: 'Wide', action: 'She glances', motion_principles: ['anticipation'] }] })
  const r = await films.checkGrammar(p.id, 's1', { advice: false })
  assert.ok(r.findings.find((f) => f.code === 'beat-frames'), 'the shot\'s beats reach the grammar check')
  assert.ok(r.findings.find((f) => f.code === 'motion-room'), 'a 1.2s beat with a principle is cramped')
})

ok('Clear takes the contract off the shot', async () => {
  films.editShot(p.id, 's1', 'a', { intent: null, locks: null, motion_style: null, beats: [] })
  const sh = films.find(films.get(p.id), 'a').sh
  assert.equal(sh.intent, null)
  assert.equal(sh.beats.length, 0)
  assert.deepEqual(films.contractFor(sh), {})
})

ok('a render project names its film: stored since the fix, or read off the film-shots name pattern', () => {
  assert.equal(filmNameOf({ film: { name: 'The Gate' } }), 'The Gate', 'stored on new projects')
  assert.equal(filmNameOf({ name: 'The Gate · EXT. GATE - DAY · 3' }), 'The Gate', 'old film-shot projects')
  assert.equal(filmNameOf({ name: 'The Gate · INT. TEMPLE - NIGHT · 12' }), 'The Gate')
  assert.equal(filmNameOf({ name: 'My Seq (sequence) · EXT. DOCK - DAY · 1' }), 'My Seq')
  assert.equal(filmNameOf({ name: 'A lake at dawn' }), null, 'a standalone shot has no film')
  assert.equal(filmNameOf({ name: 'Music · Storm' }), null)
})

fs.rmSync(dir, { recursive: true, force: true })

const done = async () => {
  console.log(`\n${n - failed} of ${n} passed`)
  process.exit(failed ? 1 : 0)
}
await done()
