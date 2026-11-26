// The Prev step (src/service/productions.js): which shots need a cheap draft, which get finished in the
// finalize sweep, and the cut flag keeping removed shots out of everything.  node test/previz.mjs
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Productions } from '../src/service/productions.js'

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

const JOBS = {
  projA: [{ kind: 'previews', status: 'success', createdAt: '2026-01-02T00:00:00Z', outputs: [{ kind: 'preview', candidate: 1, path: '/takes/a1.mp4' }] }],
  projE: [
    { kind: 'previews', status: 'success', createdAt: '2026-01-02T00:00:00Z', outputs: [{ kind: 'preview', candidate: 1, path: '/takes/e1.mp4' }] },
    { kind: 'finish', status: 'success', createdAt: '2026-01-03T00:00:00Z', parent: null, outputs: [{ kind: 'final', path: '/finals/e.mp4' }] }
  ],
  projF: [{ kind: 'previews', status: 'error', createdAt: '2026-01-02T00:00:00Z', error: 'out of memory' }]
}
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ivs-previz-'))
const films = new Productions({ dataDir: dir, studio: () => ({ listJobs: (id) => JOBS[id] || [], getProject: () => null }) })
const p = films.create({ name: 'Previz Test' })
films.patch(p.id, (q) => (q.scenes = [{ id: 's1', heading: 'EXT. GATE - DAY', shots: [
  { id: 'a', action: 'Meera waits.', seconds: 5, prompt: '[Shot 1] A.', projectId: 'projA' },
  { id: 'b', action: 'A shot she cuts.', seconds: 5, prompt: '[Shot 1] B.', cut: true },
  { id: 'c', action: 'Not written yet.', seconds: 5, prompt: '' },
  { id: 'd', action: 'Fresh.', seconds: 5, prompt: '[Shot 1] D.' },
  { id: 'e', action: 'Finished.', seconds: 5, prompt: '[Shot 1] E.', projectId: 'projE' },
  { id: 'f', action: 'Failed.', seconds: 5, prompt: '[Shot 1] F.', projectId: 'projF' }
] }]))

ok('previzWanted: only shots with a prompt, no usable takes, not cut — failed shots retry', async () => {
  const v = films.get(p.id)
  assert.deepEqual(films.previzWanted(v), ['d', 'f'])
  films.editShot(p.id, 's1', 'd', { cut: true })
  assert.deepEqual(films.previzWanted(films.get(p.id)), ['f'], 'a cut shot is not drafted')
  films.editShot(p.id, 's1', 'd', { cut: false })
  assert.deepEqual(films.previzWanted(films.get(p.id)), ['d', 'f'])
})

ok('previzDrafts with nothing wanted touches no renderer and returns empty', async () => {
  films.editShot(p.id, 's1', 'd', { projectId: 'projA' })
  films.editShot(p.id, 's1', 'f', { projectId: 'projA' })
  assert.deepEqual(await films.previzDrafts(p.id), [])
})

ok('finalizeWanted: only shots with takes to finish — not cut, not finished', async () => {
  const v = films.get(p.id)
  assert.deepEqual(films.finalizeWanted(v), [{ shot: 'a', candidate: 1 }])
  films.editShot(p.id, 's1', 'a', { cut: true })
  assert.deepEqual(films.finalizeWanted(films.get(p.id)), [], 'a cut shot is never finished')
  films.editShot(p.id, 's1', 'a', { cut: false })
  assert.deepEqual(films.finalizeWanted(films.get(p.id)), [{ shot: 'a', candidate: 1 }])
})

ok('finalizeFilm with nothing to finish starts no jobs and reports empty', async () => {
  films.editShot(p.id, 's1', 'a', { cut: true })
  assert.deepEqual(await films.finalizeFilm(p.id), [])
})

ok('the cut flag round-trips through editShot', async () => {
  films.editShot(p.id, 's1', 'c', { cut: true })
  assert.equal(films.find(films.get(p.id), 'c').sh.cut, true)
  films.editShot(p.id, 's1', 'c', { cut: false })
  assert.equal(films.find(films.get(p.id), 'c').sh.cut, false)
})

fs.rmSync(dir, { recursive: true, force: true })

const done = async () => {
  console.log(`\n${n - failed} of ${n} passed`)
  process.exit(failed ? 1 : 0)
}
await done()
