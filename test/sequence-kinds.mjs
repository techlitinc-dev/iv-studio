// Offline checks for the GitHub #38, #40 and #41 sequence fixes (no ComfyUI needed):
//  #38 a one take is plain (fl2va, prompts as written) or with references (ref2va; face, pictures, voice or
//      shot 1's voice carried into every shot, each shot opened by a line naming them), plus a first frame;
//  #40 a shot keeps the writer's idea and the sequence keeps its story;
//  #41 deleting a sequence removes its shot-by-shot project and records, so the Library and Dashboard drop it.
//   node test/sequence-kinds.mjs
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { checkPrompt } from '../src/service/graph.js'
import { bindLine, retakeGraph, SEQUENCE_DEFAULTS, takeGraph, takeKindOf, takeReferences, takeScript, validateSequence } from '../src/service/sequence.js'
import { Studio } from '../src/service/studio.js'

let passed = 0
const test = (name, fn) => {
  fn()
  passed++
  console.log(`ok - ${name}`)
}

const template = JSON.parse(fs.readFileSync('resources/workflows/iv_studio_api.json', 'utf8'))
const fl2va = template['201'].inputs.unet_name
const ref2va = template['301'].inputs.unet_name
const tess = { id: 'tess', name: 'Tess Marlow', lora: 'MiniMax H3\\tess\\tess.safetensors', strength: 0.8, trigger: 't3ss4' }
const written = 'integrated_multimodal_description: [Shot 1] Live-action. {char} sits and says <d>[English] Late again.</d>\n\noverall_soundscape: Rain on the roof.\n\nnon_diegetic_music: N/A'
const seq = { ...SEQUENCE_DEFAULTS, shots: [{ prompt: written }, { prompt: written }] }
const byType = (g, t) => Object.values(g).filter((n) => n.class_type === t)

// ---------- #38: the two kinds ----------
test('a new sequence is a plain take; an older one with a voice sample reads as a references take', () => {
  assert.equal(SEQUENCE_DEFAULTS.takeKind, 'plain')
  assert.equal(takeKindOf({ voiceRef: null }), 'plain')
  assert.equal(takeKindOf({ voiceRef: 'C:/v.wav' }), 'refs')
  assert.equal(takeKindOf({ voiceRef: 'C:/v.wav', takeKind: 'plain' }), 'plain')
})

test('a plain take: the model it is given, the prompts exactly as written, nothing carried', () => {
  const { graph } = takeGraph({ template, seq, character: tess, name: 't', unet: fl2va })
  assert.equal(graph.unet.inputs.unet_name, fl2va)
  assert.equal(graph.take.inputs.script, [written, written].map((t) => t.replaceAll('{char}', 't3ss4')).join('\n---\n'))
  assert.ok(!graph.take.inputs.voice_ref && !graph.take.inputs.reference_images && !graph.take.inputs.self_anchor_voice)
  assert.deepEqual(checkPrompt(graph), [])
})

test('a references take: pictures batched (Batch Images) into reference_images, the voice as voice_ref, each shot bound', () => {
  const { graph } = takeGraph({ template, seq, character: tess, name: 't', unet: ref2va, refs: { pictures: ['iv_studio/face.png', 'iv_studio/side.png'], voice: 'iv_studio/v.wav', selfVoice: false } })
  assert.equal(graph.unet.inputs.unet_name, ref2va)
  assert.equal(byType(graph, 'LoadImage').length, 2)
  assert.deepEqual(graph.take.inputs.reference_images, ['refs', 0])
  assert.deepEqual(graph.refs, { class_type: 'BatchImagesNode', inputs: { 'images.image0': ['ref1', 0], 'images.image1': ['ref2', 0] } })
  assert.deepEqual(graph.take.inputs.voice_ref, ['voice', 0])
  const shots = graph.take.inputs.script.split('\n---\n')
  assert.ok(shots.every((s) => s.startsWith("t3ss4 looks like the person in <Picture 1> and <Picture 2>. t3ss4's voice is the voice in <Audio 1>.\n\n[Shot 1]")))
  assert.ok(!/integrated_multimodal_description|overall_soundscape|non_diegetic_music/.test(graph.take.inputs.script), 'the node adds the sections itself')
  assert.ok(shots[0].endsWith('The sound: Rain on the roof.'))
  assert.deepEqual(checkPrompt(graph), [])
})

test("shot 1's voice: self_anchor_voice on, shot 1 names no voice, later shots do", () => {
  const { graph } = takeGraph({ template, seq, character: tess, name: 't', unet: ref2va, refs: { pictures: [], voice: null, selfVoice: true } })
  assert.equal(graph.take.inputs.self_anchor_voice, true)
  assert.ok(!graph.take.inputs.voice_ref)
  const [one, two] = graph.take.inputs.script.split('\n---\n')
  assert.ok(!one.includes('<Audio 1>') && two.startsWith("t3ss4's voice is the voice in <Audio 1>."))
})

test('a first frame goes to start_image, in either kind', () => {
  for (const refs of [null, { pictures: ['iv_studio/f.png'], voice: null }]) {
    const { graph } = takeGraph({ template, seq, character: tess, name: 't', refs, startImage: 'iv_studio/first.png' })
    assert.deepEqual(graph.take.inputs.start_image, ['start', 0])
    assert.equal(graph.start.inputs.image, 'iv_studio/first.png')
    assert.deepEqual(checkPrompt(graph), [])
  }
})

test('the older voiceRef argument still makes a references take', () => {
  const { graph } = takeGraph({ template, seq, character: tess, name: 't', voiceRef: 'iv_studio/v.wav' })
  assert.deepEqual(graph.take.inputs.voice_ref, ['voice', 0])
  assert.ok(graph.take.inputs.script.startsWith("t3ss4's voice is the voice in <Audio 1>."))
})

test('what a references take carries: the face first, at most 4 pictures, selfVoice only without a sample', () => {
  const r = takeReferences({ refs: { face: true, pictures: ['a', 'b', 'c', 'd'], selfVoice: true }, voiceRef: null }, 'face.png')
  assert.deepEqual(r.pictures, ['face.png', 'a', 'b', 'c'])
  assert.equal(r.selfVoice, true)
  assert.equal(takeReferences({ refs: { selfVoice: true }, voiceRef: 'v.wav' }).selfVoice, false)
  assert.equal(takeReferences({ refs: { face: false } }, 'face.png').count, 0)
  assert.equal(bindLine(null), '')
})

test('takeScript shows each shot as sent (no character: "The person")', () => {
  assert.deepEqual(takeScript({ ...seq, takeKind: 'plain' }, null), [written, written])
  const sent = takeScript({ ...seq, character: 'none', takeKind: 'refs' }, { pictures: ['x'], voice: null, selfVoice: false })
  assert.ok(sent[0].startsWith('The person looks like the person in <Picture 1>.'))
})

test('a references take with nothing to carry is refused, with a way out', () => {
  const s = { ...seq, character: 'tess', method: 'take', takeKind: 'refs', refs: { face: true, pictures: [], selfVoice: false }, voiceRef: null }
  assert.throws(() => validateSequence(s, [tess]), /needs at least one.*Or switch to Plain/)
  assert.equal(validateSequence(s, [tess], { face: 'face.png' }), tess)
  assert.equal(validateSequence({ ...s, takeKind: 'plain' }, [tess]), tess)
  assert.equal(validateSequence({ ...s, method: 'shots' }, [tess]), tess, 'shot by shot never needs references')
})

// ---------- a studio on a scratch data folder ----------
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ivs-seqkinds-'))
const studio = new Studio({ dataDir, resourcesDir: path.resolve('resources'), comfyUrl: 'http://127.0.0.1:1' })

test('saving keeps a shot idea, the story, the kind and clean references (#40, #38)', () => {
  const s = studio.createSequence({ name: 'Porch', character: 'none' })
  const saved = studio.saveSequence(s.id, {
    story: 'She waits on the porch, then the rain starts.',
    takeKind: 'refs',
    refs: { face: false, pictures: ['C:/a.png', '', 7, 'C:/b.png', 'C:/c.png', 'C:/d.png', 'C:/e.png'], selfVoice: 1 },
    startImage: 'C:/first.png',
    shots: [{ id: 'x1', prompt: 'p', idea: 'she looks up' }, { id: 'x2', prompt: '', idea: '' }]
  })
  assert.equal(saved.story, 'She waits on the porch, then the rain starts.')
  assert.equal(saved.shots[0].idea, 'she looks up')
  assert.ok(!('idea' in saved.shots[1]))
  assert.deepEqual(saved.refs, { face: false, pictures: ['C:/a.png', 'C:/b.png', 'C:/c.png', 'C:/d.png'], selfVoice: true })
  assert.equal(saved.startImage, 'C:/first.png')
  assert.equal(studio.saveSequence(s.id, { takeKind: 'anything' }).takeKind, 'plain')
})

test('the take setup: plain on fl2va, references on ref2va, Settings picks win, the script is in the view', () => {
  const s = studio.createSequence({ name: 'Kinds', character: 'none', shots: [{ id: 'k1', prompt: 'A door opens.', mode: 'text', media: [] }] })
  let t = studio.takeSetup(s)
  assert.equal(t.kind, 'plain')
  assert.equal(t.model, fl2va)
  assert.deepEqual(t.script, ['A door opens.'])
  t = studio.takeSetup({ ...s, takeKind: 'refs', voiceRef: 'C:/v.wav' })
  assert.equal(t.model, ref2va)
  assert.ok(t.script[0].startsWith("The person's voice is the voice in <Audio 1>."))
  studio.models = { takePlain: 'mine_fl2va.safetensors', take: 'mine_ref2va.safetensors' }
  assert.equal(studio.takeSetup(s).model, 'mine_fl2va.safetensors')
  assert.equal(studio.takeSetup({ ...s, takeKind: 'refs' }).model, 'mine_ref2va.safetensors')
  studio.models = {}
  assert.deepEqual(studio.sequenceView(s.id).take.script, ['A door opens.'])
})

// ---------- #41: deleting a sequence ----------
const writeJob = (j) => {
  fs.mkdirSync(path.join(dataDir, 'jobs'), { recursive: true })
  fs.writeFileSync(studio.jobFile(j.id), JSON.stringify({ status: 'success', outputs: [], createdAt: new Date().toISOString(), ...j }))
}
const video = (name) => {
  const p = path.join(dataDir, name)
  fs.writeFileSync(p, 'x')
  return { kind: 'final', path: p, url: `http://127.0.0.1:1/view?filename=${name}` }
}

test('a deleted sequence leaves nothing in the Library: its shots, its takes and their records go', () => {
  const s = studio.createSequence({ name: 'Gone soon', method: 'shots', character: 'none', shots: [{ id: 'g1', prompt: 'first', mode: 'text', media: [] }] })
  const project = studio.createProject('Gone soon (sequence)', s.id)
  writeJob({ id: 'GP', kind: 'previews', projectId: project.id, plan: { request: { mode: 'text', character: 'none' } }, outputs: [video('gp.mp4')] })
  writeJob({ id: 'GT', kind: 'take', sequenceId: s.id, outputs: [{ kind: 'master', path: path.join(dataDir, 'take.mp4') }] })
  const saved = studio.getSequence(s.id)
  studio.writeSequence({ ...saved, projectId: project.id, jobs: ['GT'], versions: [{ id: 'v1', kind: 'take', label: 'Take 1', jobId: 'GT', createdAt: new Date().toISOString() }] })
  fs.writeFileSync(path.join(dataDir, 'take.mp4'), 'x')
  const p = studio.getProject(project.id)
  fs.writeFileSync(studio.projectFile(project.id), JSON.stringify({ ...p, jobs: ['GP'] }))
  assert.ok(studio.library().some((i) => i.sequenceId === s.id), 'listed before')
  studio.deleteSequence(s.id)
  assert.ok(!studio.library().some((i) => i.sequenceId === s.id || i.set === `sequence:${s.id}`), 'gone after')
  assert.ok(!fs.existsSync(studio.projectFile(project.id)) && !fs.existsSync(studio.jobFile('GT')) && !fs.existsSync(studio.jobFile('GP')))
  assert.ok(fs.existsSync(path.join(dataDir, 'gp.mp4')) && fs.existsSync(path.join(dataDir, 'take.mp4')), 'the videos stay on disk')
})

test('a sequence deleted by an older version (its project left behind) is skipped too', () => {
  const s = studio.createSequence({ name: 'Old delete', method: 'shots', character: 'none' })
  const project = studio.createProject('Old delete (sequence)', s.id)
  writeJob({ id: 'OP', kind: 'previews', projectId: project.id, plan: { request: { mode: 'text', character: 'none' } }, outputs: [video('op.mp4')] })
  fs.writeFileSync(studio.projectFile(project.id), JSON.stringify({ ...studio.getProject(project.id), jobs: ['OP'] }))
  fs.rmSync(studio.sequenceFile(s.id))
  assert.ok(!studio.library().some((i) => i.sequenceId === s.id))
})

// ---------- lip-sync: the retake graph mouths new audio (studio.lipsyncFile) ----------
test('lip-sync: the new audio rides as the retake’s performance', () => {
  const { graph: g } = retakeGraph({ template, seq: { ...SEQUENCE_DEFAULTS }, character: null, name: 'ls', sourcePath: 'C:/in/clip.mp4', prompt: 'The person speaks.', start: 0, end: 8, mode: 'video', seed: 4242, voiceAudio: 'iv_studio/line.wav' })
  assert.equal(g.voice.class_type, 'LoadAudio')
  assert.deepEqual(g.retake.inputs.audio, ['voice', 0], 'the new audio, not the source’s')
  assert.equal(g.retake.inputs.mode, 'video only (keep the performance)')
  assert.deepEqual(g.save.inputs.audio, ['retake', 1], 'the output carries the mouthed audio')
})
test('lip-sync: without new audio the retake keeps the source’s own', () => {
  const { graph: g } = retakeGraph({ template, seq: { ...SEQUENCE_DEFAULTS }, character: null, name: 'rt', sourcePath: 'C:/in/clip.mp4', prompt: 'x', start: 0, end: 5, mode: 'both', seed: 1 })
  assert.equal(g.voice, undefined)
  assert.deepEqual(g.retake.inputs.audio, ['src', 2])
})
await assert.rejects(studio.lipsyncFile({ name: 'x', sourcePath: 'nope.mp4', audio: null, start: 0, end: 5 }), /Pick the audio/)
await assert.rejects(studio.lipsyncFile({ name: 'x', sourcePath: 'nope.mp4', audio: 'a.wav', start: 5, end: 5 }), /end after it starts/)
await assert.rejects(studio.lipsyncFile({ name: 'x', sourcePath: 'nope.mp4', audio: 'a.wav', start: 0, end: 20 }), /15 seconds/)
passed++
console.log('ok - lip-sync checks its inputs before anything is staged')

fs.rmSync(dataDir, { recursive: true, force: true })
console.log(`\n${passed} passed`)
