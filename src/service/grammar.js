// The film-grammar validator (Phase 3): the movie-language layer above the prompt, after directing.js's
// method and beside the continuity check (filmcraft.js). Warnings and suggestions, never blockers — a
// director must be able to break any rule on purpose. Two tiers:
//   grammarCheck(scene)     deterministic: staging.js geometry (the 180° rule, eyelines, exits), the Shot
//                           Contract's roles and beats (pacing, frame grid, room for motion), the speech
//                           budget. Free, instant, certain.
//   grammarAdvise(writer)   the writer's read of what only judgment covers: motivated camera, emotional
//                           progression, match-action across cuts, setup and payoff, look-room, coverage
//                           economy. Honours the same intentional breaks.
// Every finding is { level: 'warn' | 'info', code, shots: [names], issue, fix? }. A broken rule meant on
// purpose is marked on the shot (shot.overrides = { [code]: note }); grammarCheck keeps it out of findings
// and returns it in `intentional`, and grammarAdvise is told not to re-report those codes.
import { askWriter } from './filmcraft.js'
import { lineCheck, project } from './staging.js'
import { spokenLines } from './ranking.js'

const first = (name) => String(name || '').trim().split(/\s+/)[0] || 'Someone'
// ~2.5 words a second is unhurried screen speech; each line also costs a breath (preflight.js's formula)
const speechSeconds = (lines) => lines.reduce((s, l) => s + l.split(/\s+/).filter(Boolean).length / 2.5 + 0.5, 0)

const overridden = (shots, code) => {
  for (const sh of shots) if (sh.overrides?.[code]) return String(sh.overrides[code]) || 'intentional'
  return null
}

// scene: { heading?, shots: [{ name?, seconds?, prompt?, action?, staging?, ends?, stage?, beats?, intent?, overrides? }] }
// Returns { findings, intentional }. Shot names fall back to their 1-based index.
export function grammarCheck({ heading = '', shots = [] } = {}) {
  const named = shots.map((sh, i) => ({ sh, name: sh.name || String(i + 1) }))
  const findings = []
  const intentional = []
  const add = (level, code, list, issue, fix = '') => {
    const f = { level, code, shots: list.map((x) => x.name), issue, fix }
    const note = overridden(list.map((x) => x.sh), code)
    if (note) intentional.push({ ...f, note })
    else findings.push(f)
  }

  // the scene's cast, for eyelines: everyone any board stages, by first name
  const cast = new Set(named.flatMap(({ sh }) => (sh.stage?.people || []).map((p) => first(p.name))))

  for (const [{ sh, name }, i] of named.map((x, i) => [x, i])) {
    const prev = i > 0 ? named[i - 1] : null

    // the 180° rule between staged neighbours (staging.js's own pair check; an on-screen arc excuses it)
    if (prev?.sh.stage && sh.stage) {
      for (const issue of lineCheck(prev.sh.stage, sh.stage)) add('warn', 'axis', [prev, named[i]], issue, 'Put the camera back on the scene side of the pair, or cross the line on screen with an arc.')
    }

    // eyelines on a staged shot: a look at someone who isn't in the scene is a typo until proven otherwise
    if (sh.stage) {
      for (const p of sh.stage.people || []) {
        if (!p.lookAt) continue
        const who = first(p.lookAt)
        if (!cast.has(who)) {
          add('warn', 'eyeline-unknown', [named[i]], `${first(p.name)} looks at ${who}, who is in no shot of this scene — a mistyped name, or an off-screen person the cut never introduces.`, 'Name someone the scene stages, or move the look into the action ("toward the door").')
        } else {
          // a look at someone staged here but out of frame: an off-screen look, fine only if the cut pays it off
          const target = (sh.stage.people || []).find((q) => first(q.name) === who)
          if (target && !project(sh.stage, target).on) {
            add('info', 'eyeline-offframe', [named[i]], `${first(p.name)} looks at ${who}, who stands out of frame in this shot.`, 'Fine as a setup for the reverse — make sure the next shot answers it; otherwise bring them into frame.')
          }
        }
      }
    }

    // exits and entrances across the cut: out past one side, picked up past the other, reads as doubling back
    if (prev?.sh.stage && sh.stage) {
      for (const p of prev.sh.stage.people || []) {
        if (!p.to) continue
        const end = project(prev.sh.stage, p.to)
        if (end.on) continue
        const next = (sh.stage.people || []).find((q) => first(q.name) === first(p.name))
        if (!next) continue
        const at = project(sh.stage, next)
        if (!next.to && at.on) continue // they stay put on screen: no entrance to contradict
        if (at.u * end.u >= 0) continue
        const side = (u) => (u < 0 ? 'screen-left' : 'screen-right')
        add('warn', 'exit-side', [prev, named[i]], `${first(p.name)} leaves past ${side(end.u)} in ${prev.name} and is picked up past ${side(at.u)} in ${name} — the cut reads as her doubling back.`, 'Re-enter on the same side she left, or put the camera’s cross on screen.')
      }
    }

    // beats: whole-frame boundaries, and room for the motion directed inside them
    for (const [k, b] of (sh.beats || []).entries()) {
      if (Number.isFinite(b.from) && Number.isFinite(b.to) && (!Number.isInteger(b.from * 24) || !Number.isInteger(b.to * 24))) {
        const at = !Number.isInteger(b.from * 24) ? b.from : b.to
        add('warn', 'beat-frames', [named[i]], `Beat ${k + 1} (${b.from}–${b.to}s) lands between frames: ${at}s is frame ${(at * 24).toFixed(1)}, and H3 steps whole frames.`, 'Use quarter seconds (1.25s, 1.5s…) so the beat sits on a frame.')
      }
      if (b.motion_principles?.length && b.to - b.from < 1.5) {
        add('warn', 'motion-room', [named[i]], `Beat ${k + 1} packs ${b.motion_principles.join(' and ')} into ${(b.to - b.from).toFixed(1)}s — a motion principle needs about a second and a half to read.`, 'Give the beat room, or drop a tag; a wind-up inside a second plays as a twitch.')
      }
    }
  }

  // pacing: a run of story shots with nowhere to breathe (only when the scene carries intents at all)
  const withRoles = named.filter(({ sh }) => sh.intent?.role)
  if (withRoles.length) {
    let run = []
    const flush = () => {
      if (run.length >= 4) {
        const list = run.map((x) => x.name).join('–')
        add('info', 'pacing-breath', run, `Shots ${run[0].name}–${run[run.length - 1].name} are ${run.length} story shots in a row — the cut never lets the audience breathe.`, 'After the turn, consider a reaction or a visual pause; the coverage lands harder either side of one.')
      }
      run = []
    }
    for (const x of named) {
      if (x.sh.intent?.role && !['reaction', 'pause'].includes(x.sh.intent.role)) run.push(x)
      else flush()
    }
    flush()
  }

  // the scene's whole spoken load against its running time
  const sceneSeconds = named.reduce((s, { sh }) => s + (Number(sh.seconds) || 0), 0)
  const lines = named.flatMap(({ sh }) => [...spokenLines(String(sh.prompt || '')), ...((sh.beats || []).map((b) => (b.dialogue || '').replace(/<\/?d>/g, '').trim()).filter(Boolean))])
  const said = speechSeconds(lines)
  if (sceneSeconds > 0 && said > sceneSeconds * 0.8) {
    add('warn', 'speech-full', named.map((x) => x), `The scene's lines take about ${Math.round(said)}s to say in a ${Math.round(sceneSeconds)}s scene: it talks wall-to-wall.`, 'Trim a line, or let one beat play in silence — quiet reads louder after talk.')
  }

  return { findings, intentional }
}

// The writer's grammar read. shots: grammarCheck's shape (prompts and words matter; stage/ beats/ intent
// are read when present). overrides: { code: note } the director already broke on purpose. Returns findings
// of the same shape; deterministic codes are left to grammarCheck, so these get slugs of their own.
const GRAMMAR_SCHEMA = {
  type: 'object',
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          level: { type: 'string', enum: ['warn', 'info'] },
          code: { type: 'string' },
          shots: { type: 'array', items: { type: 'string' } },
          issue: { type: 'string' },
          fix: { type: 'string' }
        },
        required: ['level', 'code', 'shots', 'issue', 'fix']
      }
    }
  },
  required: ['findings']
}

const SYSTEM = `You are a film-grammar advisor reading one scene's shots in order, as a director's collaborator. Judge what only judgment covers:
- Motivated vs unmotivated camera: a move should follow attention or the action; a dolly with no reason reads as drift.
- Emotional progression: when a shot's intent names where the feeling starts and ends, the shot must play that change; a shot that starts and ends in one note carries nothing.
- Match-action across cuts: where one shot ends against where the next begins — positions, held objects, momentum, screen side.
- Setup and payoff: a planted detail the audience is meant to catch needs its payoff shot (and the other way: a payoff with no setup reads as a mistake).
- Look-room and eyelines: a frame leaves space on the side of a look; an off-screen look is answered soon after.
- Entrances, exits and spatial orientation: an arrival or leave keeps a legible direction across the cut.
- Coverage economy: a shot that repeats what the audience already knows, or a turn no shot actually shows.
- Rhythm and duration: a held shot among quick ones, a quick one inside stillness; a shot too short for what it must make felt.
The grammar's rules are warnings and suggestions, never errors: a director may break any of them on purpose. The director has marked these breaks intentional — do not report them again:
OVERRIDES
Report only what would really be noticed in the cut, most useful first, each finding with a short kebab-case code, the shot names it concerns, one concrete fix (which words to change in which shot). "warn" = likely to be noticed; "info" = a suggestion. An empty list when the scene plays.`

export async function grammarAdvise(writer, { scene = '', look = '', shots = [], overrides = {}, cpu = false }) {
  const list = shots.filter((s) => String(s.prompt || s.action || '').trim())
  if (list.length < 2) throw new Error('A grammar read needs at least two shots with prompts.')
  const names = new Set(list.map((s) => s.name))
  const blocks = list.map((s) => {
    const extra = []
    if (s.intent) extra.push(`intent: ${JSON.stringify(s.intent)}`)
    if (s.beats?.length) extra.push(`beats: ${s.beats.map((b) => `${b.from}-${b.to}s (${[b.camera, b.action, b.expression, b.eyeline, b.motion_principles?.length ? `motion: ${b.motion_principles.join('+')}` : ''].filter(Boolean).join('; ')})`).join(' | ')}`)
    if (s.ends) extra.push(`ends: ${s.ends}`)
    return `--- ${s.name} (${s.seconds || '?'}s) ---\n${[s.prompt || s.action, s.staging && `Staging: ${s.staging}`, ...extra].filter(Boolean).join('\n')}`
  })
  const system = SYSTEM.replace('OVERRIDES', Object.keys(overrides).length ? Object.entries(overrides).map(([c, n]) => `- ${c}${n ? `: ${n}` : ''}`).join('\n') : '(none)')
  const out = await askWriter(writer, { system, user: [scene && `Scene: ${scene}`, look && `Look: ${look}`, '', ...blocks].filter((l) => typeof l === 'string').join('\n'), schema: GRAMMAR_SCHEMA, cpu, temperature: 0.2, ctx: 24576 })
  return tidyGrammarAdvice(out, names)
}

// The writer's answer as findings: known shots only, levels and codes tidied, empty fields dropped.
export function tidyGrammarAdvice(out, names = new Set()) {
  return (out?.findings || [])
    .map((f, i) => ({
      level: f.level === 'warn' ? 'warn' : 'info',
      code: String(f.code || `advice-${i + 1}`)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 40) || `advice-${i + 1}`,
      shots: (f.shots || []).map(String).filter((n) => names.has(n) || /\d/.test(n)),
      issue: String(f.issue || '').trim(),
      fix: String(f.fix || '').trim()
    }))
    .filter((f) => f.issue)
}
