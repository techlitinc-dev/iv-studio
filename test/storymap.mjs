// The mindmap tree for anything: a short film (Project), a feature, or a song.   node test/storymap.mjs
import assert from 'node:assert/strict'
import { lyricsSections, productionTree, featureTree, songTree, storyTree, shotStatus } from '../src/service/storymap.js'
import { Features } from '../src/service/feature.js'
import { Productions } from '../src/service/productions.js'

let n = 0
const ok = (name, fn) => (fn(), n++, console.log(`ok  ${name}`))
const tmp = (d) => d

ok('lyrics with [markers] become labeled sections', () => {
  const secs = lyricsSections('[Verse 1]\nRain on the roof\nCold coffee\n[Chorus]\nHold on\n\n[Outro]\nFade')
  assert.deepEqual(secs.map((s) => s.label), ['Verse 1', 'Chorus', 'Outro'])
  assert.deepEqual(secs[0].lines, ['Rain on the roof', 'Cold coffee'])
})

ok('plain lyrics split into 4-line parts', () => {
  const lines = Array.from({ length: 10 }, (_, i) => `line ${i + 1}`)
  const secs = lyricsSections(lines.join('\n'))
  assert.equal(secs.length, 3)
  assert.deepEqual(secs[0].lines, ['line 1', 'line 2', 'line 3', 'line 4'])
})

ok('a production becomes a film → scenes → shots tree', () => {
  const p = {
    id: 'p1',
    name: 'The Message',
    logline: 'A bottle, a keeper.',
    targetSeconds: 36,
    script: { text: 'INT. ROOM - DAY\n\nShe reads.' },
    scenes: [
      { id: 'sc1', heading: 'INT. ROOM - DAY', location: 'Room', shots: [
        { id: 'a', action: 'She reads.', seconds: 6, camera: 'Wide', state: { status: 'success', final: {} } },
        { id: 'b', action: 'She looks up.', seconds: 4 }
      ] }
    ]
  }
  const t = productionTree(p)
  assert.equal(t.kind, 'production')
  assert.equal(t.root.title, 'The Message')
  assert.match(t.root.meta, /1 scenes · 2 shots · 36s/)
  const shot = t.children[0].children[0]
  assert.equal(shot.status, 'finished')
  assert.equal(shot.chip, true)
  assert.equal(t.children[0].children[1].status, 'written')
})

ok('a feature explore() reshapes to the same recursive form', () => {
  const explore = {
    feature: { id: 'f1', name: 'Epic', logline: '', story: '', targetMinutes: 120 },
    totals: { shots: 1, filmed: 0, finished: 1 },
    acts: [{ id: 'a1', title: 'Act I', logline: '', minutes: 30, sequences: [{ id: 's1', title: 'Reel 1', logline: '', editId: null, scenes: [{ id: 'sc1', heading: 'INT. HUT - DAY', location: '', shots: [{ id: 'x', action: 'Fire crackles.', camera: '', seconds: 5, staging: '', ends: '', line: '', status: 'finished', projectId: 'pr1' }] }] }] }]
  }
  const t = featureTree(explore)
  const seq = t.children[0].children[0]
  assert.equal(seq.link.production, 's1')
  assert.equal(seq.children[0].children[0].projectId, 'pr1')
})

ok('a song becomes sections with line chips, and finds its remixes', () => {
  const songs = [
    { id: 'm1', name: 'Theme', engine: 'ace', caption: 'moody', lyrics: '[Verse]\na\nb\n[Chorus]\nc', seconds: 120, bpm: 90, key: 'C', instrumental: false, file: '/t/theme.mp3' },
    { id: 'm2', name: 'Theme (club)', engine: 'ace', caption: '', lyrics: '', seconds: 120, instrumental: true, file: '/t/club.mp3', remix: { source: '/t/theme.mp3', strength: 0.7 } }
  ]
  const t = songTree(songs[0], songs)
  assert.equal(t.children[0].title, 'Verse')
  assert.equal(t.children[0].children[0].chip, true)
  const rem = t.children.find((c) => c.kind === 'group')
  assert.equal(rem.children[0].title, 'Theme (club)')
  assert.match(rem.children[0].meta, /strength 0\.7/)
  assert.match(t.root.meta, /ACE-Step 1\.5 · 120s · 90 BPM · C/)
})

ok('storyTree routes each kind', () => {
  const dir = '/tmp/iv-storymap-' + Date.now()
  const productions = new Productions({ dataDir: dir, edits: null, localCopy: async (f) => f })
  const features = new Features({ dataDir: dir, productions: () => productions })
  const p = productions.create({ name: 'Routed' })
  assert.equal(storyTree({ productions, features, music: { all: () => [] } }, 'production', p.id).kind, 'production')
  const f = features.create({ name: 'F' })
  assert.equal(storyTree({ productions, features, music: { all: () => [] } }, 'feature', f.id).kind, 'feature')
  assert.throws(() => storyTree({ productions, features, music: { all: () => [] } }, 'song', 'nope'), /No song/)
  assert.throws(() => storyTree({ productions, features, music: { all: () => [] } }, 'x', 'y'), /Unknown storymap kind/)
})

ok('shotStatus reads the three states', () => {
  assert.equal(shotStatus({}), 'written')
  assert.equal(shotStatus({ state: { candidates: [{}] } }), 'filmed')
  assert.equal(shotStatus({ state: { status: 'success', final: {} } }), 'finished')
})

console.log(`\n${n} ok`)
