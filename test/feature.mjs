// Features: a feature film's acts, sequences and the master assembly cut.   node test/feature.mjs
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Features, actPlan, featureEstimate } from '../src/service/feature.js'
import { Productions } from '../src/service/productions.js'
import { applyOps, clipLength } from '../src/service/timeline.js'
import { DEFAULT_TRACKS } from '../src/service/timeline.js'

let n = 0
const ok = (name, fn) => (fn(), n++, console.log(`ok  ${name}`))
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'iv-feature-'))

// The real Productions (create/get/write touch nothing else), plus a minimal Edits fake with its files.
const productions = new Productions({ dataDir: tmp, edits: null, localCopy: async (f) => f.path || f })
const editDir = path.join(tmp, 'edits')
fs.mkdirSync(editDir, { recursive: true })
let seq = 0
const durations = {}
const edits = {
  create(name) {
    return { id: `e${++seq}`, name, clips: [], media: {}, tracks: DEFAULT_TRACKS, markers: [], settings: {}, createdAt: new Date().toISOString() }
  },
  get(id) {
    const e = JSON.parse(fs.readFileSync(path.join(editDir, `${id}.json`), 'utf8'))
    return e
  },
  write(e) {
    fs.writeFileSync(path.join(editDir, `${e.id}.json`), JSON.stringify(e))
  },
  addMedia(file, source = {}) {
    return { id: `m${++seq}`, path: file, kind: 'video', duration: durations[file] ?? 5, ...source }
  }
}
// A sequence edit holding the given media files as V1 clips in order, built through the real timeline ops.
function cutWith(files) {
  const e = edits.create('cut')
  const media = {}
  const ops = []
  let at = 0
  for (const f of files) {
    const m = edits.addMedia(f)
    media[m.id] = m
    ops.push({ op: 'add_clip', media: m.id, track: 'V1', start: at })
    at += m.duration
  }
  const r = applyOps({ ...e, media }, ops)
  Object.assign(e, { clips: r.clips, media: r.media, tracks: r.tracks })
  edits.write(e)
  return e
}
const features = new Features({ dataDir: tmp, productions: () => productions, edits: () => edits })

ok('three acts are planned and their minutes sum to the target', () => {
  const acts = actPlan(120)
  assert.equal(acts.length, 3)
  assert.deepEqual(acts.map((a) => a.minutes), [30, 60, 30])
  const odd = actPlan(121)
  assert.deepEqual(odd.map((a) => a.minutes), [30.3, 60.5, 30.2])
  assert.equal(odd.reduce((t, a) => t + a.minutes, 0), 121)
})

ok('a feature is created with its brief and default acts', () => {
  const f = features.create({ name: 'Long Way North', logline: 'A lighthouse keeper walks home.', targetMinutes: 150 })
  assert.equal(f.name, 'Long Way North')
  assert.equal(f.targetMinutes, 150)
  assert.deepEqual(f.acts.map((a) => a.minutes), [37.5, 75, 37.5])
  assert.equal(f.sequences.length, 0)
  assert.ok(features.list().some((x) => x.id === f.id))
  features.remove(f.id)
  assert.ok(!features.list().some((x) => x.id === f.id))
})

ok('a bad aspect or length is refused', () => {
  assert.throws(() => features.create({ aspect: '2:1' }), /aspect must be/)
  assert.throws(() => features.create({ targetMinutes: 1 }), /targetMinutes must be/)
  assert.throws(() => features.create({ targetMinutes: 500 }), /targetMinutes must be/)
})

ok('productions attach to an act and run in order; a duplicate is refused', () => {
  const f = features.create({ name: 'Saga', targetMinutes: 90 })
  const a1 = f.acts[0].id
  const a2 = f.acts[1].id
  const p1 = productions.create({ name: 'Reel 1' })
  const p2 = productions.create({ name: 'Reel 2' })
  features.attach(f.id, p1.id, { actId: a1 })
  features.attach(f.id, p2.id, { actId: a2 })
  const got = features.get(f.id)
  assert.deepEqual(features.order(got).map((s) => s.title), ['Reel 1', 'Reel 2'])
  assert.throws(() => features.attach(f.id, p1.id, { actId: a1 }), /already a sequence/)
  assert.throws(() => features.attach(f.id, p2.id, { actId: 'nope' }), /No act nope/)
  // attaching marked the productions as reels of a feature
  assert.equal(productions.get(p1.id).kind, 'feature')
  features.detach(f.id, p1.id)
  assert.equal(productions.get(p1.id).kind, 'short')
  assert.deepEqual(features.order(features.get(f.id)).map((s) => s.id), [p2.id])
})

ok('replacing the acts drops sequences whose act is gone', () => {
  const f = features.create({ name: 'Two Acts', targetMinutes: 60 })
  const p = productions.create({ name: 'Reel A' })
  features.attach(f.id, p.id, { actId: f.acts[0].id })
  features.setActs(f.id, [{ title: 'One', minutes: 25 }, { title: 'Two', minutes: 35 }])
  const got = features.get(f.id)
  assert.equal(got.acts.length, 2)
  assert.equal(got.sequences.length, 0)
  assert.throws(() => features.setActs(f.id, []), /at least one act/)
  assert.throws(() => features.setActs(f.id, [{ title: 'Broken', minutes: 0 }]), /length in minutes/)
})

ok('stats roll shots and footage up per act and overall', () => {
  const f = features.create({ name: 'Counter', targetMinutes: 10 })
  const p = productions.create({ name: 'Counted' })
  // a production mid-pipeline: one finished shot, one with previews only, one unfilmed
  p.scenes = [
    { heading: 'INT. HUT - DAY', shots: [
      { id: 's1', seconds: 6, state: { status: 'success', final: { duration: 5.8 }, candidates: [{}] } },
      { id: 's2', seconds: 8, state: { status: 'previewing', candidates: [{}] } },
      { id: 's3', seconds: 4, state: { status: 'queued' } }
    ] }
  ]
  productions.write(p)
  features.attach(f.id, p.id, { actId: f.acts[0].id })
  const s = features.stats(f.id)
  assert.equal(s.total.shots, 3)
  assert.equal(s.total.filmed, 2)
  assert.equal(s.total.finished, 1)
  assert.equal(s.footageSeconds, 5.8)
  assert.equal(s.acts[0].shots, 3)
  assert.equal(s.acts[1].shots, 0)
})

ok('the master cut assembles every sequence cut in running order, end to end', () => {
  durations['/r1a.mp4'] = 6
  durations['/r1b.mp4'] = 4
  durations['/r2a.mp4'] = 7
  const f = features.create({ name: 'Assembled', targetMinutes: 20 })
  const p1 = productions.create({ name: 'Reel 1' })
  const p2 = productions.create({ name: 'Reel 2' })
  const e1 = cutWith(['/r1a.mp4', '/r1b.mp4'])
  const e2 = cutWith(['/r2a.mp4'])
  p1.editId = e1.id
  p2.editId = e2.id
  productions.write(p1)
  productions.write(p2)
  features.attach(f.id, p1.id, { actId: f.acts[0].id })
  features.attach(f.id, p2.id, { actId: f.acts[1].id })
  const r = features.masterCut(f.id)
  assert.equal(r.placed, 3)
  assert.deepEqual(r.missing, [])
  assert.equal(r.seconds, 17)
  const master = edits.get(r.editId)
  const v1 = master.clips.filter((c) => c.track === 'V1').sort((a, b) => a.start - b.start)
  assert.equal(v1.length, 3)
  assert.equal(v1[0].start, 0)
  assert.equal(v1[1].start, 6)
  assert.equal(v1[2].start, 10)
  assert.deepEqual(v1.map((c) => clipLength(c)), [6, 4, 7])
  // shared media paths are added to the master once, not per clip
  assert.equal(Object.values(master.media).filter((m) => m.path === '/r1a.mp4').length, 1)
  // the feature remembers its assembly, and a rebuild replaces rather than appends
  const again = features.masterCut(f.id)
  assert.equal(again.editId, r.editId)
  assert.equal(edits.get(r.editId).clips.filter((c) => c.track === 'V1').length, 3)
})

ok('a sequence with no cut is skipped and reported missing', () => {
  const f = features.create({ name: 'Gaps', targetMinutes: 20 })
  const p = productions.create({ name: 'Uncut' })
  features.attach(f.id, p.id, { actId: f.acts[0].id })
  const r = features.masterCut(f.id)
  assert.equal(r.placed, 0)
  assert.equal(r.missing.length, 1)
  assert.equal(r.seconds, 0)
})

ok('an estimate scales shots and cloud time to the target length', () => {
  const e = featureEstimate({ targetMinutes: 120, speed: 'balanced' })
  assert.equal(e.shots, Math.ceil((120 * 60) / 7))
  assert.equal(e.cloudMinutes, Math.round((e.shots * (135 + 116)) / 60))
  assert.ok(e.cloudMinutes > 1000, 'two hours of finished H3 footage is days of cloud GPU time')
})

ok('a feature well over three hours is allowed', () => {
  const f = features.create({ name: 'Epic', targetMinutes: 240 })
  assert.equal(f.targetMinutes, 240)
  features.remove(f.id)
  assert.throws(() => features.create({ targetMinutes: 481 }), /targetMinutes must be/)
})

ok('the trailer and songs are linked on the feature', () => {
  const f = features.create({ name: 'With extras' })
  features.update(f.id, { trailerId: 'sz1' })
  features.addSong(f.id, 'm1')
  features.addSong(f.id, 'm1')
  features.addSong(f.id, 'm2')
  let got = features.get(f.id)
  assert.equal(got.trailerId, 'sz1')
  assert.deepEqual(got.songs, ['m1', 'm2'])
  features.removeSong(f.id, 'm1')
  got = features.get(f.id)
  assert.deepEqual(got.songs, ['m2'])
  features.update(f.id, { trailerId: null })
  assert.equal(features.get(f.id).trailerId, null)
})

// auto(): scripts and shots are written for every sequence, in order, once; a sequence with a script keeps it.
{
  const calls = { scripts: [], breakdowns: [] }
  const dir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'iv-feat-auto-'))
  const files = new Map()
  const fake = {
    get: (id) => {
      const p = files.get(id)
      if (!p) throw new Error(`No project ${id}`)
      return JSON.parse(JSON.stringify(p))
    },
    write: (p) => (files.set(p.id, JSON.parse(JSON.stringify(p))), p),
    writeScript: (id, { idea } = {}) => {
      calls.scripts.push([id, idea])
      const p = fake.get(id)
      p.script = { text: 'INT. HUT - DAY\n\nA fire crackles.' }
      p.kind = 'feature'
      return Promise.resolve(fake.write(p))
    },
    breakDown: (id, opts) => {
      calls.breakdowns.push(id)
      calls.redo = !!opts?.redo
      const p = fake.get(id)
      p.scenes = [{ shots: [{ id: 'a', seconds: 5 }] }]
      fake.write(p)
    }
  }
  const feats = new Features({ dataDir: dir2, productions: () => fake, edits: () => edits })
  const f = feats.create({ name: 'Auto', story: 'A keeper walks home through the winter.' })
  files.set('p1', { id: 'p1', name: 'Reel 1' })
  files.set('p2', { id: 'p2', name: 'Reel 2' })
  feats.attach(f.id, 'p1', { actId: f.acts[0].id, title: 'Leaving', logline: 'He locks the lighthouse.' })
  feats.attach(f.id, 'p2', { actId: f.acts[1].id, title: 'The ice', logline: 'The lake freezes over.' })
  const r = await feats.auto(f.id, {})
  assert.equal(r.scripted, 2)
  assert.equal(r.broken, 2)
  assert.equal(calls.redo, false)
  assert.deepEqual(calls.breakdowns, ['p1', 'p2'])
  assert.match(calls.scripts[0][1], /Leaving: He locks the lighthouse\./)
  assert.match(calls.scripts[0][1], /The film so far: A keeper walks home through the winter\./)
  // the sequences' loglines travel on the feature
  assert.equal(feats.get(f.id).sequences[0].logline, 'He locks the lighthouse.')
  // a second run finds scripts and shots and starts nothing again
  const again = await feats.auto(f.id, {})
  assert.deepEqual(again, { scripted: 0, broken: 0, running: 0, errors: [] })
  // a sequence whose breakdown is still running counts as running, not failed
  const realBreakDown = fake.breakDown
  fake.breakDown = (id) => {
    if (id === 'p2') throw new Error('This project is already being broken down.')
    return realBreakDown(id)
  }
  const busy = await feats.auto(f.id, { redo: true })
  assert.equal(busy.running, 1)
  assert.equal(busy.errors.length, 0)
  assert.equal(busy.broken, 1)
  fake.breakDown = realBreakDown
  // a partly broken-down sequence (a scene still without shots) resumes instead of being skipped
  files.set('p1', { ...fake.get('p1'), scenes: [{ id: 's1', shots: [{ id: 'a', seconds: 5 }] }, { id: 's2', shots: [] }] })
  const resumed = await feats.auto(f.id, {})
  assert.equal(resumed.broken, 1) // p1's missing scene is planned; p2 is complete
  assert.equal(resumed.errors.length, 0)
  assert.equal(calls.breakdowns.at(-1), 'p1')
  // a broken sequence is reported and the rest carry on
  calls.scripts.length = 0
  files.delete('p2')
  const third = await feats.auto(f.id, { redo: true })
  assert.equal(third.errors.length, 1)
  assert.equal(third.errors[0].sequence, 'p2')
  assert.equal(calls.scripts.length, 0) // p1 already had its script, so only the breakdown reran
  // auto({ sequence }): total control — write one sequence at a time
  const scoped = await feats.auto(f.id, { sequence: 'p1' })
  assert.deepEqual(scoped, { scripted: 0, broken: 0, running: 0, errors: [] }) // p1 already has its script and shots
  await assert.rejects(feats.auto(f.id, { sequence: 'nope' }), /No sequence nope/)
  calls.breakdowns.length = 0
  const one = await feats.auto(f.id, { sequence: 'p1', redo: true })
  assert.equal(one.broken, 1)
  assert.equal(calls.redo, true) // redo reaches breakDown, so a re-plan really redoes scenes that have shots
  assert.deepEqual(calls.breakdowns, ['p1']) // only the named sequence, not the whole feature
  // explore(): the whole story as a tree, with a status per shot
  files.set('p1', {
    ...fake.get('p1'),
    scenes: [
      { id: 'sc1', heading: 'INT. HUT - DAY', shots: [
        { id: 'a', action: 'He locks the door.', seconds: 6, state: { status: 'success', final: { projectId: 'pr1' } } },
        { id: 'b', action: 'He walks out.', seconds: 5, state: { status: 'previewing', candidates: [{}] } },
        { id: 'c', action: 'The lamp swings.', seconds: 4 }
      ] }
    ]
  })
  const tree = feats.explore(f.id)
  assert.equal(tree.feature.name, 'Auto')
  assert.equal(tree.acts.length, 3)
  const seq = tree.acts[0].sequences[0]
  assert.equal(seq.id, 'p1')
  assert.equal(seq.scenes.length, 1)
  assert.deepEqual(seq.scenes[0].shots.map((s) => s.status), ['finished', 'filmed', 'written'])
  assert.equal(seq.scenes[0].shots[0].projectId, 'pr1')
  assert.equal(tree.totals.shots, 3)
  assert.equal(tree.totals.finished, 1)
  assert.equal(tree.totals.filmed, 2)
  n++
  console.log('ok  auto writes each sequence a script and a breakdown, in order, once — and one sequence at a time')
}

// planAll(): the AI writes the acts, the sequences (as Projects) and the cast from the story
{
  const dir3 = fs.mkdtempSync(path.join(os.tmpdir(), 'iv-feat-plan-'))
  const created = []
  const updated = {}
  const fakeP = {
    get: (id) => files2.get(id) || (() => { throw new Error('No project ' + id) })(),
    write: (p) => (files2.set(p.id, JSON.parse(JSON.stringify(p))), p),
    create: (opts) => {
      const p = { id: 'pp' + (created.length + 1), name: opts.name, logline: opts.logline || '', aspect: opts.aspect, targetSeconds: opts.targetSeconds, scenes: [], cast: [] }
      created.push(p.id)
      files2.set(p.id, p)
      return p
    },
    update: (id, patch) => {
      const p = fakeP.get(id)
      Object.assign(p, patch)
      updated[id] = patch
      return p
    }
  }
  const files2 = new Map()
  const feats2 = new Features({ dataDir: dir3, productions: () => fakeP })
  const f2 = feats2.create({ name: 'Planned', story: 'A keeper walks home. A storm. A door left open.', targetMinutes: 10 })
  const ask = async (writer, { schema } = {}) =>
    schema.properties.acts
      ? { acts: [
          { title: 'Act I · Out', logline: 'He locks up.', minutes: 4, sequences: [
            { title: 'Leaving', logline: 'He locks the lighthouse.', minutes: 2 },
            { title: 'The path', logline: 'Down the cliff path in wind.', minutes: 2 }
          ] },
          { title: 'Act II · Home', logline: 'The storm breaks.', minutes: 6, sequences: [
            { title: 'The door', logline: 'The door he left open.', minutes: 6 }
          ] }
        ] }
      : { characters: [
          { name: 'The Keeper', who: 'an old lighthouse keeper', looks: 'A gray man in a yellow oilskin.' },
          { name: 'Mara', who: 'his granddaughter', looks: 'A girl in a red hat.' }
        ] }
  const r = await feats2.planAll(f2.id, { ask })
  assert.deepEqual(r, { acts: 2, sequences: 3, characters: 2 })
  const got = feats2.get(f2.id)
  assert.deepEqual(got.acts.map((a) => a.minutes), [4, 6])
  assert.equal(got.sequences.length, 3)
  assert.equal(got.cast.length, 2)
  assert.equal(created.length, 3)
  assert.equal(updated['pp1'].cast[0].as, 'The Keeper')
  assert.equal(updated['pp1'].cast[0].description, 'A gray man in a yellow oilskin.')
  assert.equal(updated['pp3'].targetSeconds ?? 0, 0) // untouched; create carried the length
  assert.equal(fakeP.get('pp3').targetSeconds, 360)
  // the cast flows into auto()'s script idea
  await assert.rejects(feats2.planAll(f2.id, { ask }), /already has sequences/)
  n++
  console.log('ok  planAll writes acts, sequences and the cast from the story')
}

// linkCast(): the film's cast becomes studio characters — created by name, an existing one of the same name
// reused — so the people show on the Characters page and shots can play them; auto() heals an unlinked feature.
{
  const dir4 = fs.mkdtempSync(path.join(os.tmpdir(), 'iv-feat-cast-'))
  const prods = new Map()
  const fakeP2 = {
    get: (id) => prods.get(id),
    write: (p) => (prods.set(p.id, p), p),
    update: (id, patch) => Object.assign(prods.get(id), patch),
    writeScript: async (id) => Object.assign(prods.get(id), { script: { text: 'INT. HUT - DAY' } })
  }
  const people = [{ id: 'chT', name: 'Tess Marlow' }]
  const fakeStudio = {
    characters: () => people,
    saveCharacter: (c) => {
      const ch = { id: `ch${people.length}`, ...c }
      people.push(ch)
      return ch
    }
  }
  const feats3 = new Features({ dataDir: dir4, productions: () => fakeP2, edits: () => edits, studio: () => fakeStudio })
  const f3 = feats3.create({ name: 'Linked', story: 'A keeper and his granddaughter.' })
  prods.set('q1', { id: 'q1', name: 'Q1', scenes: [{ id: 's1', shots: [{ id: 'a' }] }], cast: [] })
  feats3.attach(f3.id, 'q1', { actId: feats3.get(f3.id).acts[0].id, title: 'Q1' })
  feats3.write({ ...feats3.get(f3.id), cast: [{ name: 'The Keeper', who: 'an old keeper', looks: 'A gray man in a yellow oilskin.' }, { name: 'Tess Marlow', who: 'his granddaughter', looks: 'A girl in a red hat.' }] })
  await feats3.auto(f3.id, {})
  const cast = feats3.get(f3.id).cast
  assert.equal(cast[0].characterId, 'ch1') // created, with who/looks as about/look
  assert.equal(people[1].about, 'an old keeper')
  assert.equal(people[1].look, 'A gray man in a yellow oilskin.')
  assert.equal(cast[1].characterId, 'chT') // the name already on the Characters page is reused, not duplicated
  assert.equal(people.length, 2)
  assert.equal(prods.get('q1').cast[0].characterId, 'ch1') // the sequence's cast links too
  await feats3.auto(f3.id, {})
  assert.equal(people.length, 2) // linked once: a second run changes nothing
  fs.rmSync(dir4, { recursive: true, force: true })
  n++
  console.log('ok  linkCast: the cast becomes studio characters, reused by name, and heals on Write everything')
}

console.log(`\n${n} ok`)
