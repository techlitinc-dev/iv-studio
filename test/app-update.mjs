// The update pop-up's logic (src/service/appupdate.js) with stand-ins for Studio, ComfyUI and the installer: what it
// says about ComfyUI, when it can't check, updating just Techlit Studio or ComfyUI and nodes first, a failure stopping the
// restart, and the note after the restart.
//   node test/app-update.mjs
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { AppUpdate, notesOf, outcome, summarize } from '../src/service/appupdate.js'
import { readRecord, writeRecord } from '../src/service/comfyupdate.js'

let n = 0
let failed = 0
const ok = async (name, fn) => {
  n++
  try {
    await fn()
    console.log('ok  ', name)
  } catch (err) {
    failed++
    console.log('FAIL', name, '-', err.message)
  }
}
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'ivs-appupdate-'))
const info = (over = {}) => ({
  manager: { present: true, version: 'V3.42' },
  comfyui: { current: 'v0.45.0', latest: 'v0.46.0', behind: true },
  packs: { installed: 12, withUpdates: [{ id: 'a', title: 'Alpha Pack' }, { id: 'b', title: 'Beta Pack' }] },
  desktop: false,
  ...over
})

await ok('summarize: ComfyUI and node packs with updates', () => {
  const s = summarize(info())
  assert.equal(s.kind, 'updates')
  assert.deepEqual(s.packs, ['Alpha Pack', 'Beta Pack'])
  assert.equal(s.text, 'ComfyUI v0.45.0 → v0.46.0 and 2 node packs have an update.')
  assert.equal(summarize(info({ packs: { installed: 12, withUpdates: [] } })).text, 'ComfyUI v0.45.0 → v0.46.0 has an update.')
  assert.equal(summarize(info({ comfyui: { current: 'v0.46.0', latest: 'v0.46.0', behind: false }, packs: { installed: 12, withUpdates: [{ id: 'a', title: 'Alpha Pack' }] } })).text, '1 node pack has an update.')
})
await ok('summarize: nothing new, no Manager, and the desktop app (packs only)', () => {
  const cur = summarize(info({ comfyui: { current: 'v0.46.0', latest: 'v0.46.0', behind: false }, packs: { installed: 12, withUpdates: [] } }))
  assert.equal(cur.kind, 'current')
  assert.equal(cur.text, 'ComfyUI v0.46.0 and your 12 node packs are up to date.')
  assert.equal(summarize({ manager: { present: false } }).kind, 'unavailable')
  const desk = summarize(info({ desktop: true }))
  assert.equal(desk.comfyui.behind, false)
  assert.equal(desk.text, '2 node packs have an update.')
  assert.equal(summarize(info({ desktop: true, packs: { installed: 3, withUpdates: [] } })).kind, 'current')
})
await ok('outcome: what the ComfyUI update did, for the note after the restart', () => {
  const r = outcome({ comfyuiBefore: 'v0.45.0', comfyuiAfter: 'v0.46.0', results: [{ pack: 'comfyui', status: 'updated' }, { pack: 'a', status: 'updated' }, { pack: 'b', status: 'updated' }, { pack: 'c', status: 'current' }] })
  assert.equal(r.ok, true)
  assert.equal(r.text, 'ComfyUI v0.45.0 → v0.46.0, 2 node packs updated. Undo it in Settings → Setup → ComfyUI updates.')
  const bad = outcome({ comfyuiBefore: 'v0.46.0', comfyuiAfter: 'v0.46.0', results: [{ pack: 'comfyui', status: 'current' }, { pack: 'x', status: 'failed', message: 'git error' }] })
  assert.equal(bad.ok, false)
  assert.match(bad.text, /ComfyUI was already current\. Didn’t update: x\./)
})

const make = ({ remote = false, up = true, local = true, comfyUpdates, updateComfy, busy = () => [], dataDir = tmp() } = {}) => {
  const calls = []
  const changes = []
  const studio = {
    comfy: { remote, url: 'http://127.0.0.1:8188' },
    comfyUpdates: comfyUpdates || (async () => (calls.push('check'), info())),
    updateComfy:
      updateComfy ||
      (async ({ onProgress }) => {
        calls.push('updateComfy')
        onProgress({ phase: 'snapshot' })
        onProgress({ phase: 'updating', done: 1, total: 3 })
        onProgress({ phase: 'restarting' })
        const record = { snapshot: 's1', at: new Date().toISOString(), comfyuiBefore: 'v0.45.0', comfyuiAfter: 'v0.46.0', results: [{ pack: 'comfyui', status: 'updated' }, { pack: 'a', status: 'updated' }] }
        writeRecord(dataDir, record)
        return record
      })
  }
  const u = new AppUpdate({ studio, comfyUp: async () => up, isLocal: () => local, busy, install: async () => calls.push('install'), dataDir, onChange: (s) => changes.push(s.status) })
  return { u, calls, changes, dataDir }
}

await ok('check: done with a summary, said to the window, and not repeated for the same version', async () => {
  const { u, calls, changes } = make()
  const s = await u.check({ version: '1.1.19' })
  assert.equal(s.status, 'done')
  assert.equal(s.summary.kind, 'updates')
  assert.deepEqual(changes, ['checking', 'done'])
  await u.check({ version: '1.1.19' })
  assert.equal(calls.filter((c) => c === 'check').length, 1)
  await u.check({ version: '1.1.19', force: true })
  assert.equal(calls.filter((c) => c === 'check').length, 2)
  // two at once share one check
  const [a, b] = await Promise.all([u.check({ version: '1.1.20' }), u.check({ version: '1.1.20' })])
  assert.equal(a, b)
  assert.equal(calls.filter((c) => c === 'check').length, 3)
})
await ok('check: a cloud ComfyUI, one that is down, and a failing check never throw', async () => {
  assert.equal((await make({ remote: true }).u.check()).summary.reason, 'cloud')
  assert.equal((await make({ local: false }).u.check()).summary.reason, 'cloud')
  const down = await make({ up: false }).u.check()
  assert.equal(down.status, 'unavailable')
  assert.match(down.summary.text, /isn’t running/)
  const err = await make({ comfyUpdates: async () => { throw new Error('Manager timed out') } }).u.check()
  assert.equal(err.status, 'error')
  assert.equal(err.error, 'Manager timed out')
})
await ok('run: just Techlit Studio installs at once and leaves ComfyUI alone', async () => {
  const { u, calls } = make()
  const steps = []
  await u.run({ withComfy: false, version: '1.1.19', onProgress: (p) => steps.push(p.phase) })
  assert.deepEqual(calls, ['install'])
  assert.deepEqual(steps, ['installing'])
})
await ok('run: ComfyUI and nodes first, then Techlit Studio; the record remembers it for the note', async () => {
  const { u, calls, dataDir } = make()
  const steps = []
  await u.run({ withComfy: true, version: '1.1.19', onProgress: (p) => steps.push(p.phase) })
  assert.deepEqual(calls, ['updateComfy', 'install'])
  assert.deepEqual(steps, ['starting', 'snapshot', 'updating', 'restarting', 'installing'])
  const rec = readRecord(dataDir)
  assert.equal(rec.fromAppUpdate, '1.1.19')
  assert.equal(rec.snapshot, 's1')
  // after the restart: said once
  const note = u.notice()
  assert.equal(note.version, '1.1.19')
  assert.match(note.text, /ComfyUI v0\.45\.0 → v0\.46\.0, 1 node pack updated/)
  assert.equal(u.notice(), null)
})
await ok('run: a ComfyUI that is rendering, or a failed update, stops before Techlit Studio restarts', async () => {
  const rendering = make({ updateComfy: async () => { throw Object.assign(new Error('ComfyUI is rendering or has jobs queued. Update when it’s done.'), { code: 'rendering' }) } })
  await assert.rejects(rendering.u.run({ withComfy: true, version: '1.1.19' }), /rendering/)
  assert.deepEqual(rendering.calls, [])
  assert.equal(rendering.u.notice(), null)
  // something this process is doing (an export) stops both choices
  const exporting = make({ busy: () => ['an edit is exporting'] })
  await assert.rejects(exporting.u.run({ withComfy: false }), /an edit is exporting/)
  await assert.rejects(exporting.u.run({ withComfy: true }), /an edit is exporting/)
  assert.deepEqual(exporting.calls, [])
})
await ok("release notes: GitHub's HTML or Markdown as a few plain lines", () => {
  assert.equal(notesOf('<h2>What’s new</h2><ul><li>Keyframes: pictures in order become one video.</li><li>Fixed &amp; faster.</li></ul>'), 'What’s new\nKeyframes: pictures in order become one video.\nFixed & faster.')
  assert.equal(notesOf('## 1.1.19\n- One\n* Two\n\n'), '1.1.19\nOne\nTwo')
  assert.equal(notesOf([{ note: '<p>A</p>' }, { note: 'B' }]), 'A\nB')
  assert.equal(notesOf('- **Bold** and `code` and [a link](https://x.y)'), 'Bold and code and a link')
  assert.equal(notesOf(null), null)
  assert.equal(notesOf(Array.from({ length: 12 }, (_, i) => `- ${i}`).join('\n')).split('\n').length, 8)
})
await ok('notice: an update made from Settings (not with Techlit Studio) says nothing', async () => {
  const dataDir = tmp()
  writeRecord(dataDir, { snapshot: 's0', results: [] })
  assert.equal(make({ dataDir }).u.notice(), null)
})

console.log(`\n${n - failed} of ${n} passed`)
if (failed) process.exit(1)
