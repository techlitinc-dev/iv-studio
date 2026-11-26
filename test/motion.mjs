// The Motion and Performance layer (src/service/contract.js): the style presets, the style-gated principle
// vocabulary, how the style's dial reaches the compiled prompt, and the request path through plan.js.
// node test/motion.mjs
import assert from 'node:assert/strict'
import { cleanBeats, compileBeats } from '../src/service/beats.js'
import { cleanMotionStyle, DEFAULT_MOTION_STYLE, MOTION_PRINCIPLES, MOTION_STYLES, motionPhrase, motionTags } from '../src/service/contract.js'
import { planPreviews } from '../src/service/plan.js'

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

ok('the styles: three presets, live-action the default', () => {
  assert.deepEqual(Object.keys(MOTION_STYLES), ['live_action', 'anime', 'stylized_3d'])
  assert.equal(DEFAULT_MOTION_STYLE, 'live_action')
  assert.equal(cleanMotionStyle(null), null)
  assert.equal(cleanMotionStyle(''), null)
  assert.equal(cleanMotionStyle('anime'), 'anime')
  assert.throws(() => cleanMotionStyle('claymation'), /Unknown motion_style "claymation"/)
})

ok('the vocabulary is style-gated: squash, smears, pose-to-pose and appeal are not live-action', () => {
  assert.ok(!motionTags('live_action').includes('squash_stretch'))
  assert.ok(!motionTags('live_action').includes('smear'))
  assert.ok(motionTags('anime').includes('squash_stretch'))
  assert.ok(motionTags('anime').includes('smear'))
  assert.ok(motionTags('stylized_3d').includes('squash_stretch'))
  assert.ok(!motionTags('stylized_3d').includes('smear'))
  assert.ok(motionTags('live_action').includes('anticipation'))
  assert.ok(Object.keys(MOTION_PRINCIPLES).length >= 18)
})

ok('a gated principle under the wrong style is an error, said in words', () => {
  assert.throws(() => cleanBeats([{ from: 0, to: 2, action: 'x', motion_principles: ['squash_stretch'] }], 8), /"squash_stretch" is a Anime \/ 2D \/ Stylized 3D move; motion_style "live_action"/)
  assert.throws(() => cleanBeats([{ from: 0, to: 2, action: 'x', motion_principles: ['smear'] }], 8, { motionStyle: 'stylized_3d' }), /"smear" is a Anime \/ 2D move/)
  const b = cleanBeats([{ from: 0, to: 2, action: 'x', motion_principles: ['squash_stretch'] }], 8, { motionStyle: 'anime' })
  assert.deepEqual(b[0].motion_principles, ['squash_stretch'])
})

ok('the style dial changes the words: anticipation reads small live, big drawn', () => {
  assert.equal(motionPhrase('anticipation', 'live_action'), 'a small wind-up before the move')
  assert.equal(motionPhrase('anticipation', 'anime'), 'a big readable wind-up before the move')
  assert.equal(motionPhrase('staging', 'anime'), motionPhrase('staging', 'live_action')) // shared line
  const line = (style) => compileBeats(cleanBeats([{ from: 0, to: 2, action: 'x', motion_principles: ['anticipation'] }], 8, { motionStyle: style }), { motionStyle: style })
  assert.match(line('live_action'), /0-2s: x\. Motion: a small wind-up before the move\./)
  assert.match(line('anime'), /0-2s: x\. Motion: a big readable wind-up before the move\./)
})

ok('the mode sentence plays when principles are directed, in the style\'s words', () => {
  const beats = cleanBeats([{ from: 0, to: 2, action: 'x', motion_principles: ['anticipation'] }, { from: 2, to: 5, action: 'y' }], 8)
  const text = compileBeats(beats, { motionStyle: 'live_action' })
  assert.match(text, /no camera angle reversals\):\nMovement throughout: naturalistic — physical weight, real inertia, small gestures, breathing and blinks; nothing cartoonish\.\n0-2s:/)
  assert.match(compileBeats(beats, { motionStyle: 'anime' }), /Movement throughout: drawn animation — strong anticipation, squash-and-stretch, pose-to-pose timing, smears and holds\./)
  // no principles directed -> no mode sentence
  const plain = compileBeats(cleanBeats([{ from: 0, to: 2, action: 'x' }], 8))
  assert.doesNotMatch(plain, /Movement throughout:/)
})

ok('a request carries the style through the plan: cleaned, stored, compiled', () => {
  const plan = planPreviews({ prompt: 'A fight at the temple.', character: 'none', seconds: 8, motion_style: 'anime', beats: [{ from: 0, to: 4, action: 'she lands', motion_principles: ['anticipation', 'squash_stretch'] }] }, [])
  assert.equal(plan.request.motion_style, 'anime')
  assert.match(plan.values['87'], /Movement throughout: drawn animation/)
  assert.match(plan.values['87'], /Motion: a big readable wind-up before the move; squash-and-stretch on impact and take-off\./)
  const plain = planPreviews({ prompt: 'A lake.', character: 'none', seconds: 8, beats: [{ from: 0, to: 4, action: 'x' }] }, [])
  assert.equal(plain.request.motion_style, 'live_action')
  assert.doesNotMatch(plain.values['87'], /Movement throughout:/)
  const held = planPreviews({ prompt: 'A lake.', character: 'none', seconds: 8, beats: [{ from: 0, to: 4, action: 'x', motion_principles: ['hold'] }] }, [])
  assert.match(held.values['87'], /Movement throughout: naturalistic — physical weight/)
  assert.match(held.values['87'], /Motion: a held moment of stillness\./)
})

ok('a wrong style stops the plan with the other request errors', () => {
  assert.throws(() => planPreviews({ prompt: 'x', character: 'none', seconds: 8, motion_style: 'claymation' }, []), /Unknown motion_style "claymation"/)
})

console.log(`\n${n - failed} of ${n} passed`)
process.exit(failed ? 1 : 0)
