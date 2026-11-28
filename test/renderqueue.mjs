// The overnight render queue (src/service/renderqueue.js): which shots join, the two modes, the scene-grouped
// selection, one-at-a-time order, errors skip ahead, cancel stops — with a fake studio/productions, no ComfyUI.
//   node test/renderqueue.mjs
import assert from 'node:assert/strict'
import { RenderQueue, estimate } from '../src/service/renderqueue.js'

let n = 0
const ok = async (name, fn) => {
  n++
  try {
    await fn()
    console.log('ok', name)
  } catch (err) {
    console.log('FAIL', name, '-', err.message)
    process.exitCode = 1
  }
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

// a film: two sequences; shots in different states (pending, filmed with takes, cut, no prompt, continues)
const FEATURE = { id: 'f1', name: 'Night Film', sequences: [{ id: 's1', title: 'Opening', order: 1 }, { id: 's2', title: 'Chase', order: 2 }] }
const PRODS = {
  s1: {
    name: 'Opening',
    scenes: [
      {
        id: 'sc1',
        heading: 'EXT. GATE - DAY',
        location: 'Gate',
        shots: [
          { id: 'a', prompt: 'A waits.', seconds: 5 },
          { id: 'e', prompt: 'E follows.', continues: true, seconds: 5 },
          { id: 'b', prompt: 'B filmed already.', projectId: 'pB' },
          { id: 'c', prompt: '', seconds: 5 },
          { id: 'd', prompt: 'D cut.', cut: true }
        ]
      }
    ]
  },
  s2: { name: 'Chase', scenes: [{ id: 'sc2', heading: 'INT. CAR - NIGHT', location: 'Car', shots: [{ id: 'f', prompt: 'F drives.', seconds: 8 }] }] }
}
// what the shot's jobs say (productions.shotState): b has takes and picked take 2, nothing finished
const STATES = { pB: { status: 'pick', candidates: [{ n: 1 }, { n: 2 }], picked: 2 } }

function fake({ failOn = null } = {}) {
  const calls = []
  const productions = {
    get: (id) => PRODS[id],
    shotState: (sh) => STATES[sh.projectId] || { status: 'ready' },
    patch: (id, fn) => {
      const q = PRODS[id]
      fn(q)
      calls.push(['patch', id, q.settings?.speed])
    },
    filmShots: async (seqId, [shotId], opts) => {
      calls.push(['film', seqId, shotId, opts.previews])
      return [{ id: `job_${shotId}` }]
    },
    finish: async (seqId, shotId, candidate) => {
      calls.push(['finish', seqId, shotId, candidate])
      return { id: `fin_${shotId}` }
    }
  }
  const studio = {
    refreshJob: async (jobId) => {
      if (failOn && jobId === `job_${failOn}`) return { status: 'error', error: 'out of memory' }
      return { status: 'success', progress: { value: 8, max: 8 } }
    },
    cancelJob: async (jobId) => calls.push(['cancel', jobId])
  }
  const features = { get: () => FEATURE }
  const rq = new RenderQueue({ studio: () => studio, productions: () => productions, features: () => features, onEvent: () => {} })
  return { rq, calls, PRODS }
}
const runOut = async (rq) => {
  for (const end = Date.now() + 5000; Date.now() < end && rq.running; await wait(20));
}

await ok('previz pending: prompts without takes, in story order, with their scenes; the rest stay out', async () => {
  const { rq } = fake()
  const items = rq.pending('feature', 'f1')
  assert.deepEqual(items.map((i) => i.shotId), ['a', 'e', 'f'], 'a, then e (its predecessor a is queued), then f; b has takes')
  assert.equal(items[0].title, 'Gate · shot 1')
  assert.equal(items[0].sceneTitle, 'Gate')
  assert.equal(items[0].sceneId, 'sc1')
  assert.equal(items[2].seqTitle, 'Chase')
})

await ok('final pending: filmed shots join too, marked hasTakes with their picked take', async () => {
  const { rq } = fake()
  const items = rq.pending('feature', 'f1', 'final')
  assert.deepEqual(items.map((i) => i.shotId), ['a', 'e', 'b', 'f'])
  const b = items.find((i) => i.shotId === 'b')
  assert.equal(b.hasTakes, true)
  assert.equal(b.picked, 2)
})

await ok('previz mode renders one shot after another, takes and quality saved on the sequences', async () => {
  const { rq, calls } = fake()
  await rq.start({ kind: 'feature', id: 'f1', mode: 'previz', takes: 3, speed: 'fast' })
  await runOut(rq)
  const films = calls.filter(([c]) => c === 'film').map(([, , shotId]) => shotId)
  assert.deepEqual(films, ['a', 'e', 'f'], 'strictly one after another, in order')
  assert.ok(calls.filter(([c]) => c === 'patch').every(([, , speed]) => speed === 'fast'), 'the quality preset saved on every sequence')
  assert.equal(rq.state().done, 3)
  assert.equal(rq.state().failed, 0)
})

await ok('final mode: new shots are hunted then finished; filmed shots go straight to their picked take’s finish', async () => {
  const { rq, calls } = fake()
  await rq.start({ kind: 'feature', id: 'f1', mode: 'final', takes: 1, speed: 'balanced' })
  await runOut(rq)
  const seq = calls.filter(([c]) => c === 'film' || c === 'finish').map(([c, , id, extra]) => `${c}:${id}${c === 'finish' ? `:${extra}` : ''}`)
  assert.deepEqual(seq, ['film:a', 'finish:a:1', 'film:e', 'finish:e:1', 'finish:b:2', 'film:f', 'finish:f:1'])
})

await ok('the shot selection: only the picked shots render', async () => {
  const { rq, calls } = fake()
  await rq.start({ kind: 'feature', id: 'f1', mode: 'previz', shotIds: ['f'], takes: 2, speed: 'balanced' })
  await runOut(rq)
  assert.deepEqual(calls.filter(([c]) => c === 'film').map(([, , shotId]) => shotId), ['f'])
  await assert.rejects(() => rq.start({ kind: 'feature', id: 'f1', mode: 'previz', shotIds: ['nope'], takes: 2, speed: 'balanced' }), /Pick at least one shot/)
})

await ok('a failed shot is recorded and the night goes on', async () => {
  const { rq } = fake({ failOn: 'e' })
  await rq.start({ kind: 'feature', id: 'f1', mode: 'previz', takes: 2, speed: 'balanced' })
  await runOut(rq)
  const s = rq.state()
  assert.equal(s.done, 2)
  assert.equal(s.failed, 1)
  assert.equal(s.items.find((i) => i.shotId === 'e').status, 'error')
  assert.equal(s.items.find((i) => i.shotId === 'f').status, 'done', 'the shot after the failure still rendered')
})

await ok('cancel marks the rest cancelled and stops the loop', async () => {
  const { rq } = fake()
  await rq.start({ kind: 'feature', id: 'f1', mode: 'previz', takes: 2, speed: 'balanced' })
  rq.cancel()
  await runOut(rq)
  assert.equal(rq.state().running, false)
  assert.ok(rq.state().items.every((i) => ['cancelled', 'done', 'error'].includes(i.status)))
})

await ok('a project queues on its own, without a feature around it', async () => {
  const { rq, calls } = fake()
  const items = rq.pending('project', 's2')
  assert.deepEqual(items.map((i) => i.shotId), ['f'])
  assert.equal(items[0].seqTitle, 'Chase')
  await rq.start({ kind: 'project', id: 's2', mode: 'previz', takes: 1, speed: 'low' })
  await runOut(rq)
  assert.deepEqual(calls.filter(([c]) => c === 'film').map(([, , shotId]) => shotId), ['f'])
  assert.deepEqual(calls.filter(([c]) => c === 'patch').map(([, id, speed]) => [id, speed]), [['s2', 'low']], 'the preset saved on the project itself')
})

await ok('retakes: shots with takes join and are hunted again, in both modes', async () => {
  const { rq } = fake()
  const items = rq.pending('feature', 'f1', 'previz', true)
  assert.deepEqual(items.map((i) => i.shotId), ['a', 'e', 'b', 'f'], 'b joins the previz night too')
  const { rq: rq2, calls } = fake()
  await rq2.start({ kind: 'feature', id: 'f1', mode: 'final', retakes: true, takes: 1, speed: 'balanced' })
  await runOut(rq2)
  const seq = calls.filter(([c]) => c === 'film' || c === 'finish').map(([c, , id]) => `${c}:${id}`)
  assert.deepEqual(seq, ['film:a', 'finish:a', 'film:e', 'finish:e', 'film:b', 'finish:b', 'film:f', 'finish:f'], 'b is re-hunted, not finished from its old takes')
})

await ok('the board shows every scene and every shot, with only the renderable ones queueable', async () => {
  const { rq } = fake()
  const items = rq.board('feature', 'f1', 'previz')
  assert.deepEqual(items.map((i) => i.shotId), ['a', 'e', 'b', 'c', 'd', 'f'], 'all six shots, in story order')
  assert.deepEqual(items.filter((i) => i.queueable).map((i) => i.shotId), ['a', 'e', 'f'])
  assert.equal(items.find((i) => i.shotId === 'b').status, 'pick', 'filmed, shown as it is')
  assert.equal(items.find((i) => i.shotId === 'c').hasPrompt, false)
  assert.equal(items.find((i) => i.shotId === 'd').status, 'cut')
  const fin = rq.board('feature', 'f1', 'final')
  assert.deepEqual(fin.filter((i) => i.queueable).map((i) => i.shotId), ['a', 'e', 'b', 'f'], 'final mode: b joins too')
})

await ok('the estimate: hunts for shots without takes, a finish per shot in final mode', async () => {
  const items = [{ hasTakes: false }, { hasTakes: false }, { hasTakes: true }]
  assert.equal(estimate(items, 'fast', 'previz').seconds, 2 * 60)
  assert.equal(estimate(items, 'fast', 'final').seconds, 2 * 60 + 3 * 116)
  assert.deepEqual(estimate(items, 'fast', 'final'), { seconds: 2 * 60 + 3 * 116, hunts: 2, finishes: 3 })
})

console.log(`\n${n} checks`)
