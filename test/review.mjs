// Beat-level take review (src/service/review.js): the schema's per-beat verdicts, the brief that asks for
// them, and how they are tidied against the directed beats — a timing miss kept beside the beat's own
// window.  node test/review.mjs
import assert from 'node:assert/strict'
import { Reviewer, beatsBrief, reviewSchema } from '../src/service/review.js'

let n = 0
let failed = 0
const ok = (name, fn) => {
  n++
  try {
    fn()
    console.log('ok', name)
  } catch (err) {
    failed++
    console.log('FAIL', name, '-', err.message)
  }
}

const BEATS = [
  { from: 0, to: 2, camera: 'Wide shot; slow dolly forward', action: 'Meera approaches the temple gate' },
  { from: 2, to: 3, action: 'She notices the kite string and touches it', eyeline: 'the kite string' },
  { from: 3, to: 8, action: 'She looks toward the entrance, resolve setting in', motion_principles: ['hold'] }
]

const reviewer = new Reviewer({ studio: () => null, ffmpeg: 'ffmpeg' })
const tidy = (data, req = {}) => reviewer.tidy(data, { prompt: 'A prompt.', req, character: null, heard: null, past: [] })

ok('the schema asks for one verdict per beat: index, pass, the actual times, a note', () => {
  const s = reviewSchema()
  assert.equal(s.properties.beats.type, 'array')
  assert.equal(s.properties.beats.maxItems, 5)
  assert.deepEqual(s.properties.beats.items.required, ['index', 'pass', 'from', 'to', 'note'])
})

ok('the brief asks for per-beat verdicts only when the shot is beat-directed', () => {
  assert.equal(beatsBrief({}), '')
  assert.equal(beatsBrief({ beats: [] }), '')
  const brief = beatsBrief({ beats: BEATS, motion_style: 'live_action' })
  assert.match(brief, /timed beats:/)
  assert.match(brief, /Answer "beats" with one verdict per beat/)
  assert.match(brief, /A beat that happens at the wrong time fails/)
  assert.doesNotMatch(beatsBrief({ beats: [{ from: 0, to: 2, action: 'x' }] }), /judge the movement/)
  assert.match(brief, /judge the movement, not only the action/)
})

ok('a failed beat is kept beside the window it was directed at', () => {
  const r = tidy(
    {
      verdict: 'usable_with_fixes',
      works: ['the gate'],
      issues: [],
      beats: [{ index: 2, pass: false, from: 4.8, to: 5.2, note: 'she touches the string at 4.8s; the beat wanted it by 3s' }],
      fix: { kind: 'revise_prompt', why: 'beat 2 lands late', clean_from: 0, clean_to: 0 },
      revised_prompt: ''
    },
    { beats: BEATS, seconds: 8 }
  )
  assert.equal(r.beats.length, 1)
  assert.deepEqual(r.beats[0], { index: 2, pass: false, from: 4.8, to: 5.2, wantFrom: 2, wantTo: 3, note: 'she touches the string at 4.8s; the beat wanted it by 3s' })
})

ok('a landed silent beat says nothing; an index outside the timeline clamps in', () => {
  const r = tidy(
    {
      verdict: 'usable',
      works: [],
      issues: [],
      beats: [
        { index: 1, pass: true, from: 0, to: 2, note: '' },
        { index: 9, pass: true, from: 6.5, to: 7, note: 'the hold lands' }
      ],
      fix: { kind: 'none', why: '', clean_from: 0, clean_to: 0 },
      revised_prompt: ''
    },
    { beats: BEATS, seconds: 8 }
  )
  assert.equal(r.beats.length, 1, 'the clean pass on beat 1 drops, the noted one stays')
  assert.equal(r.beats[0].index, 3)
  assert.equal(r.beats[0].wantTo, 8)
})

ok('a mistimed pass is still worth reporting (early is also wrong)', () => {
  const r = tidy(
    {
      verdict: 'usable_with_fixes',
      works: [],
      issues: [],
      beats: [{ index: 1, pass: true, from: 0, to: 0.5, note: '' }],
      fix: { kind: 'revise_prompt', why: '', clean_from: 0, clean_to: 0 },
      revised_prompt: ''
    },
    { beats: BEATS, seconds: 8 }
  )
  assert.equal(r.beats.length, 1, 'from 0 when the beat wanted 0–2: the times disagree')
})

ok('no beats in the request, no beats in the review', () => {
  const r = tidy({ verdict: 'usable', works: [], issues: [], fix: { kind: 'none', why: '', clean_from: 0, clean_to: 0 }, revised_prompt: '' }, { seconds: 5 })
  assert.equal('beats' in r, false)
})

ok('the rest of the review is untouched', () => {
  const r = tidy(
    {
      verdict: 'nonsense',
      works: ['the light'],
      issues: [{ from: 3, to: 4, kind: 'order', what: 'wrong order', unmet: true }],
      fix: { kind: 'none', why: '', clean_from: 0, clean_to: 0 },
      revised_prompt: ''
    },
    { beats: BEATS, seconds: 8 }
  )
  assert.equal(r.verdict, 'usable_with_fixes')
  assert.equal(r.issues.length, 1)
  assert.equal(r.issues[0].unmet, true)
})

console.log(`\n${n - failed} of ${n} passed`)
process.exit(failed ? 1 : 0)
