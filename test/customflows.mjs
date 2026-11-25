// My workflows: an API-format ComfyUI JSON becomes a form and a runnable job (src/service/customflows.js).
//   node test/customflows.mjs
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { CustomFlows, fillFlow, parseFlow } from '../src/service/customflows.js'

let n = 0
const ok = (name, fn) => (fn(), n++, console.log(`ok  ${name}`))

const WF = {
  '1': { class_type: 'UNETLoader', inputs: { unet_name: 'minimax_h3.safetensors', weight_dtype: 'default' }, _meta: { title: 'Load model' } },
  '2': { class_type: 'CLIPTextEncode', inputs: { clip: ['1', 0], text: 'a fox in the snow' }, _meta: { title: 'Prompt' } },
  '3': { class_type: 'KSampler', inputs: { model: ['1', 0], seed: 42, steps: 8, cfg: 1, denoise: 1 } },
  '4': { class_type: 'LoadImage', inputs: { image: 'example.png', upload: true } },
  '5': { class_type: 'PrimitiveBoolean', inputs: { value: true } },
  '6': { class_type: 'SaveImage', inputs: { images: ['3', 0], filename_prefix: 'out' } },
  '7': { class_type: 'VHS_LoadVideoPath', inputs: { video: '/tmp/clip.mp4', force_rate: 24 } }
}

ok('an API workflow reads as controls, needs and saves', () => {
  const w = parseFlow(WF)
  const kind = Object.fromEntries(w.params.map((p) => [p.key, p.kind]))
  assert.equal(kind['2.text'], 'prompt')
  assert.equal(kind['3.seed'], 'seed')
  assert.equal(kind['3.steps'], 'number')
  assert.equal(kind['1.unet_name'], 'model')
  assert.equal(kind['4.image'], 'picture')
  assert.equal(kind['7.video'], 'video')
  assert.equal(kind['5.value'], 'toggle')
  assert.ok(!('2.clip' in kind), 'links are not controls')
  assert.deepEqual(w.needs.models, [{ file: 'minimax_h3.safetensors', loader: 'UNETLoader' }])
  assert.ok(w.needs.classes.includes('KSampler') && w.needs.saves.includes('6'))
  assert.equal(w.params.find((p) => p.key === '2.text').title, 'Prompt', 'the node’s own title labels the control')
})

ok('the editor’s workflow file is refused with the way to the right one', () => {
  assert.throws(() => parseFlow({ nodes: [], links: [] }), /API format/)
  assert.throws(() => parseFlow('not json'), /isn't JSON/)
  assert.throws(() => parseFlow({ a: { nope: 1 } }), /API workflow/)
})

ok('a workflow that saves nothing is refused', () => {
  assert.throws(() => parseFlow({ '1': { class_type: 'KSampler', inputs: { seed: 1 } } }), /saves nothing/)
})

ok('the form’s values fill the graph, numbers and switches as themselves', () => {
  const w = parseFlow(WF)
  const g = fillFlow(w.graph, w.params, { '2.text': 'a red panda', '3.seed': '777', '3.steps': '12', '5.value': false, '4.image': '/home/x/pic.png' })
  assert.equal(g['2'].inputs.text, 'a red panda')
  assert.equal(g['3'].inputs.seed, 777)
  assert.equal(g['3'].inputs.steps, 12)
  assert.equal(g['5'].inputs.value, false)
  assert.equal(g['4'].inputs.image, '/home/x/pic.png', 'media goes in as given; the run stages local paths')
  assert.deepEqual(g['2'].inputs.clip, ['1', 0], 'links untouched')
  assert.equal(w.graph['2'].inputs.text, 'a fox in the snow', 'the saved graph is not changed')
})

await (async (name, fn) => (await fn(), n++, console.log(`ok  ${name}`)))('import, hide, run: media staged, a path loader swapped, the job queued', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ivs-flows-'))
  const pic = path.join(dir, 'me.png')
  fs.writeFileSync(pic, 'x')
  const sent = []
  const studio = {
    comfy: { upload: async (f, sub) => `${sub}/${path.basename(f)}`, objectInfo: async (cls) => (cls === 'KSampler' ? { KSampler: {} } : {}) },
    submitGraph: async (j) => (sent.push(j), { id: 'job1', ...j })
  }
  const flows = new CustomFlows({ dataDir: dir, studio: () => studio })
  const w = flows.importFlow({ name: 'Mine', json: JSON.stringify(WF) })
  assert.equal(flows.list().length, 1)
  const u = flows.update(w.id, { hidden: ['3.steps', 'nope.1'] })
  assert.deepEqual(u.hidden, ['3.steps'], 'unknown keys dropped')
  const check = await flows.check(w.id)
  assert.ok(check.missingClasses.includes('UNETLoader') && !check.missingClasses.includes('KSampler'))
  await flows.run(w.id, { '2.text': 'a wolf', '4.image': pic, '7.video': '/gone/clip.mp4' })
  const g = sent[0].graph
  assert.equal(g['2'].inputs.text, 'a wolf')
  assert.equal(g['4'].inputs.image, 'iv_studio/flows/me.png', 'picked media staged into ComfyUI’s input')
  assert.equal(g['7'].inputs.video, '/gone/clip.mp4', 'a path that isn’t on this PC is left for ComfyUI')
  assert.equal(sent[0].kind, 'flow')
  assert.ok(sent[0].plan.custom)
  const j2 = await flows.run(w.id, { '7.video': pic })
  assert.equal(sent[1].graph['7'].class_type, 'VHS_LoadVideo', 'a staged path loader becomes an upload loader')
  assert.equal(j2.id, 'job1')
  flows.delete(w.id)
  assert.equal(flows.list().length, 0)
  fs.rmSync(dir, { recursive: true, force: true })
})

console.log(`\n${n} passed`)
