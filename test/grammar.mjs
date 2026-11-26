// The film-grammar validator (src/service/grammar.js): deterministic findings from staging geometry, the
// Shot Contract and the frame grid; overrides marking a break intentional; the writer-advice tidy; and the
// Productions integration (checkGrammar / grammarOverride, deterministic tier only — no writer in tests).
// node test/grammar.mjs
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { grammarCheck, tidyGrammarAdvice } from '../src/service/grammar.js'
import { defaultStage } from '../src/service/staging.js'
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

// two people, Dev screen-right of Meera, camera on the scene side of the line
const sideA = () => defaultStage(['Meera', 'Dev'])
// the same room from the other side: the pair swaps screen sides (the 180° rule broken)
const sideB = () => {
  const s = defaultStage(['Meera', 'Dev'])
  s.camera = { ...s.camera, x: 0, y: 3, facing: 180 }
  return s
}

const shot = (name, patch = {}) => ({ name, seconds: 5, ...patch })

ok('the 180° rule between staged neighbours: a swap warns, an on-screen arc excuses it', async () => {
  const r = grammarCheck({ heading: 'Gate', shots: [shot('1.1', { stage: sideA() }), shot('1.2', { stage: sideB() })] })
  const axis = r.findings.filter((f) => f.code === 'axis')
  assert.equal(axis.length, 1)
  assert.match(axis[0].issue, /swap sides/)
  assert.deepEqual(axis[0].shots, ['1.1', '1.2'])
  assert.equal(axis[0].level, 'warn')
  const excused = grammarCheck({ heading: 'Gate', shots: [shot('1.1', { stage: { ...sideA(), camera: { ...sideA().camera, move: 'arc-left' } } }), shot('1.2', { stage: sideB() })] })
  assert.equal(excused.findings.filter((f) => f.code === 'axis').length, 0)
})

ok('a matching pair across the cut stays quiet', async () => {
  const r = grammarCheck({ heading: 'Gate', shots: [shot('1', { stage: sideA() }), shot('2', { stage: sideA() })] })
  assert.equal(r.findings.length, 0)
})

ok('eyelines: a look at nobody in the scene is a warn; a look off-frame is an idea', async () => {
  const typo = sideA()
  typo.people[0].lookAt = 'Teas'
  const r = grammarCheck({ shots: [shot('1', { stage: typo })] })
  const unknown = r.findings.find((f) => f.code === 'eyeline-unknown')
  assert.ok(unknown)
  assert.match(unknown.issue, /looks at Teas/)
  const off = sideA()
  off.people[1].x = 5 // Dev stands out of frame, Meera still looks at him
  const r2 = grammarCheck({ shots: [shot('1', { stage: off })] })
  const offframe = r2.findings.find((f) => f.code === 'eyeline-offframe')
  assert.ok(offframe)
  assert.equal(offframe.level, 'info')
  assert.match(offframe.issue, /out of frame/)
})

ok('exits and entrances: out past one side, picked up past the other, warns', async () => {
  const out = sideA()
  out.people = out.people.filter((p) => p.name === 'Meera')
  out.people[0].to = { x: 3, y: 1 } // leaves past screen-right
  const back = defaultStage(['Meera'])
  back.people[0].x = -3 // picked up past screen-left
  const r = grammarCheck({ shots: [shot('1', { stage: out }), shot('2', { stage: back })] })
  const exit = r.findings.find((f) => f.code === 'exit-side')
  assert.ok(exit)
  assert.match(exit.issue, /doubling back/)
})

ok('beats: between-frame boundaries and cramped motion principles warn', async () => {
  const r = grammarCheck({ shots: [shot('1', { seconds: 8, beats: [{ from: 0, to: 1.2, camera: 'x' }, { from: 1.2, to: 5, camera: 'y', motion_principles: ['anticipation'] }] })] })
  assert.ok(r.findings.find((f) => f.code === 'beat-frames'), 'a 1.2s boundary lands between frames')
  assert.equal(r.findings.filter((f) => f.code === 'motion-room').length, 0, 'a principle inside a 3.8s beat has room')
  const clean = grammarCheck({ shots: [shot('1', { seconds: 8, beats: [{ from: 0, to: 2.5, camera: 'x', motion_principles: ['anticipation'] }] })] })
  assert.equal(clean.findings.length, 0)
  const cramped = grammarCheck({ shots: [shot('1', { seconds: 8, beats: [{ from: 0, to: 1.25, camera: 'x', motion_principles: ['anticipation'] }] })] })
  assert.ok(cramped.findings.find((f) => f.code === 'motion-room'))
  assert.equal(cramped.findings.filter((f) => f.code === 'beat-frames').length, 0, '1.25s sits on a whole frame')
})

ok('pacing: a run of story shots with nowhere to breathe suggests a pause', async () => {
  const scene = (roles) => ({ shots: roles.map((role, i) => shot(String(i + 1), { intent: { role } })) })
  const r = grammarCheck(scene(['coverage', 'coverage', 'transition', 'coverage', 'coverage']))
  const breath = r.findings.find((f) => f.code === 'pacing-breath')
  assert.ok(breath)
  assert.equal(breath.level, 'info')
  assert.deepEqual(breath.shots, ['1', '2', '3', '4', '5'])
  assert.equal(grammarCheck(scene(['coverage', 'coverage', 'reaction', 'coverage', 'coverage'])).findings.length, 0)
  assert.equal(grammarCheck({ shots: [shot('1'), shot('2')] }).findings.length, 0, 'no intents, no pacing read')
})

ok('a scene that talks wall-to-wall warns against its running time', async () => {
  const line = (words) => `[Shot 1] She waits. <d>[English] ${words}</d>`
  const r = grammarCheck({
    shots: [shot('1', { seconds: 5, prompt: line('one two three four five six seven eight nine ten eleven twelve') }), shot('2', { seconds: 5, prompt: line('one two three four five six seven eight nine ten eleven twelve') })]
  })
  const full = r.findings.find((f) => f.code === 'speech-full')
  assert.ok(full)
  assert.match(full.issue, /wall-to-wall/)
})

ok('a break made on purpose moves to intentional, with the director\'s note', async () => {
  const r = grammarCheck({ shots: [shot('1.1', { stage: sideA(), overrides: { axis: 'the cross is the point' } }), shot('1.2', { stage: sideB() })] })
  assert.equal(r.findings.filter((f) => f.code === 'axis').length, 0)
  assert.equal(r.intentional.length, 1)
  assert.equal(r.intentional[0].note, 'the cross is the point')
})

ok('the writer\'s advice is tidied: levels, slugs, known shots only', async () => {
  const out = tidyGrammarAdvice(
    {
      findings: [
        { level: 'WARN', code: 'Motivated Camera!', shots: ['1', '9'], issue: 'The push in 1 has no reason.', fix: 'Tie it to her look.' },
        { level: 'info', shots: ['2'], issue: 'A hold would land the turn.', fix: '' },
        { level: 'warn', code: '', issue: '', fix: 'x' }
      ]
    },
    new Set(['1', '2'])
  )
  assert.deepEqual(out, [
    { level: 'warn', code: 'motivated-camera', shots: ['1'], issue: 'The push in 1 has no reason.', fix: 'Tie it to her look.' },
    { level: 'info', code: 'advice-2', shots: ['2'], issue: 'A hold would land the turn.', fix: '' }
  ])
})

ok('Productions: the grammar read is kept on the scene; an override re-checks without a writer', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ivs-grammar-'))
  const films = new Productions({ dataDir: dir, studio: () => null })
  const p = films.create({ name: 'The Gate' })
  films.patch(p.id, (q) => (q.scenes = [{ id: 's1', heading: 'EXT. GATE - DAY', shots: [{ id: 'a', seconds: 5, prompt: 'Wide. [Shot 1] Meera waits at the gate.', stage: sideA() }, { id: 'b', seconds: 5, prompt: 'Reverse. [Shot 1] Dev watches.', stage: sideB() }] }]))
  const r = await films.checkGrammar(p.id, 's1', { advice: false })
  assert.equal(r.findings.filter((f) => f.code === 'axis').length, 1)
  assert.equal(r.writer, null)
  assert.equal(films.get(p.id).scenes[0].grammar.findings.length, 1, 'kept on the scene')
  const again = films.grammarOverride(p.id, 's1', 'axis', ['1.1', '1.2'], 'crossing with her')
  assert.equal(again.findings.length, 0)
  assert.equal(again.intentional[0].code, 'axis')
  const saved = films.get(p.id).scenes[0].shots
  assert.equal(saved[0].overrides.axis, 'crossing with her')
  assert.equal(saved[1].overrides.axis, 'crossing with her')
  assert.equal(films.get(p.id).scenes[0].shots[0].staging, undefined, 'grammar touches no shot words')
  fs.rmSync(dir, { recursive: true, force: true })
})

const done = async () => {
  console.log(`\n${n - failed} of ${n} passed`)
  process.exit(failed ? 1 : 0)
}
await done()
