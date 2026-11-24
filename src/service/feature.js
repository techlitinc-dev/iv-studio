// Features: a full-length film built from many Productions (the short-film engine, productions.js). A feature holds:
//   brief     name, logline, aspect, target minutes, the video model and speed preset every sequence inherits,
//             and story: the treatment every sequence's script is written from
//   acts      the story's acts ({ id, n, title, logline, minutes })
//   sequences the Productions that make up the feature, each attached to an act in order
//             ({ id, actId, order, title, logline }); a sequence is an ordinary production (one reel), so it keeps
//             the wizard, storyboard and shot pipeline, and its rough cut is edited like any other
//   trailer   a Sizzle promo (sizzle.js) cut from the web and the feature's footage (trailerId)
//   songs     the Music songs and score made for the feature (song ids)
//   cut       a master Edit assembling every sequence's cut in order (editId)
// The feature is the long-form layer only: acts, running order, progress across sequences, and the assembly.
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { ASPECTS } from './plan.js'
import { SPEEDS } from './speed.js'
import { applyOps, clipLength } from './timeline.js'
import { askWriter } from './filmcraft.js'

const now = () => new Date().toISOString()
const id6 = () => randomUUID().slice(0, 6)
const readJson = (file, fallback) => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return fallback
  }
}
const MIN_MINUTES = 2
const MAX_MINUTES = 480 // 8 hours: feature-length and beyond
// a shot's finished footage runs a little under its planned seconds (handles, the continue overlap)
const SHOT_SECONDS = 7

// The classic three acts, sized to the target: setup a quarter, confrontation half, resolution a quarter.
export function actPlan(targetMinutes) {
  const m = Number(targetMinutes)
  const acts = [
    { title: 'Act I · Setup', portion: 0.25 },
    { title: 'Act II · Confrontation', portion: 0.5 },
    { title: 'Act III · Resolution', portion: 0.25 }
  ]
  let given = 0
  return acts.map((a, i) => {
    const minutes = i === acts.length - 1 ? +(m - given).toFixed(1) : +((m * a.portion).toFixed(1))
    given = +(given + minutes).toFixed(1)
    return { id: id6(), n: i + 1, title: a.title, logline: '', minutes }
  })
}

// Rough scale of a feature for planning: how many shots and cloud-GPU minutes the target implies.
// speed: a preset id (speed.js); at its per-shot hunt and finish times.
export function featureEstimate({ targetMinutes = 120, speed = 'balanced' } = {}) {
  const s = SPEEDS[speed] || SPEEDS.balanced
  const shots = Math.ceil((Number(targetMinutes) * 60) / SHOT_SECONDS)
  const perShot = (s.estimate?.hunt || 0) + (s.estimate?.finish || 0)
  return { shots, previews: shots * s.previews, cloudSeconds: shots * perShot, cloudMinutes: Math.round((shots * perShot) / 60) }
}

export class Features {
  // productions: () => Productions, edits: () => Edits, studio: () => Studio (the Characters page's people).
  // writer: () => the prompt writer ({ engine, model }), for planAll. Same shape as Productions' own collaborators.
  constructor({ dataDir, productions = () => null, edits = () => null, studio = () => null, writer = () => ({ engine: 'local' }), onChange = () => {} }) {
    this.dir = path.join(dataDir, 'features')
    this.productions = productions
    this.edits = edits
    this.studio = studio
    this.writer = writer
    this.onChange = onChange
  }

  file = (id) => path.join(this.dir, `${id}.json`)
  list() {
    if (!fs.existsSync(this.dir)) return []
    return fs
      .readdirSync(this.dir)
      .filter((f) => f.endsWith('.json'))
      .map((f) => readJson(path.join(this.dir, f), null))
      .filter(Boolean)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map((f) => ({ id: f.id, name: f.name, logline: f.logline, aspect: f.aspect, targetMinutes: f.targetMinutes, acts: f.acts.length, sequences: f.sequences.length, updatedAt: f.updatedAt }))
  }
  get(id) {
    const f = readJson(this.file(id), null)
    if (!f) throw new Error(`No feature ${id}`)
    return f
  }
  write(f) {
    f.updatedAt = now()
    fs.mkdirSync(this.dir, { recursive: true })
    fs.writeFileSync(`${this.file(f.id)}.tmp`, JSON.stringify(f, null, 2))
    fs.renameSync(`${this.file(f.id)}.tmp`, this.file(f.id))
    this.onChange(f.id)
    return f
  }
  create({ name = 'Untitled feature', logline = '', aspect = '16:9', targetMinutes = 120, video = 'h3', speed = 'balanced', story = '' } = {}) {
    if (!ASPECTS[aspect]) throw new Error(`aspect must be ${Object.keys(ASPECTS).join(', ')}.`)
    const m = Number(targetMinutes)
    if (!Number.isFinite(m) || m < MIN_MINUTES || m > MAX_MINUTES) throw new Error(`targetMinutes must be ${MIN_MINUTES} to ${MAX_MINUTES}.`)
    const f = { id: id6(), kind: 'feature', name, logline, aspect, targetMinutes: +m.toFixed(1), video, speed, story: String(story || ''), acts: actPlan(m), sequences: [], cast: [], trailerId: null, songs: [], editId: null, createdAt: now() }
    return this.write(f)
  }
  remove(id) {
    fs.rmSync(this.file(id), { force: true })
    this.onChange(id)
    return true
  }
  update(id, patch) {
    const f = this.get(id)
    for (const k of ['name', 'logline', 'aspect', 'targetMinutes', 'video', 'speed', 'story', 'trailerId', 'startDate', 'deadline']) {
      if (patch[k] === undefined) continue
      if (k === 'aspect' && !ASPECTS[patch[k]]) throw new Error(`aspect must be ${Object.keys(ASPECTS).join(', ')}.`)
      if (k === 'targetMinutes') {
        const m = Number(patch[k])
        if (!Number.isFinite(m) || m < MIN_MINUTES || m > MAX_MINUTES) throw new Error(`targetMinutes must be ${MIN_MINUTES} to ${MAX_MINUTES}.`)
        f[k] = +m.toFixed(1)
        continue
      }
      // the schedule's dates (the movie dashboard's Gantt): 'YYYY-MM-DD' or null
      if ((k === 'startDate' || k === 'deadline') && patch[k] !== null && !/^\d{4}-\d{2}-\d{2}$/.test(String(patch[k]))) throw new Error(`${k} must be a date (YYYY-MM-DD) or null.`)
      f[k] = patch[k]
    }
    return this.write(f)
  }

  // Replaces the act structure. Sequences attached to an act that's gone leave the feature (their productions stay).
  setActs(id, acts) {
    const f = this.get(id)
    if (!Array.isArray(acts) || !acts.length) throw new Error('A feature needs at least one act.')
    f.acts = acts.map((a, i) => {
      const minutes = Number(a.minutes)
      if (!a.title || !String(a.title).trim()) throw new Error('Every act needs a title.')
      if (!Number.isFinite(minutes) || minutes <= 0) throw new Error(`Act "${a.title}" needs a length in minutes.`)
      return { id: a.id || id6(), n: i + 1, title: String(a.title).trim(), logline: String(a.logline || ''), minutes: +minutes.toFixed(1) }
    })
    f.sequences = f.sequences.filter((s) => f.acts.some((a) => a.id === s.actId))
    return this.write(f)
  }

  // Attaches a production as a sequence of the act. order: where it sits in the act (default: last).
  // logline: what happens in this sequence; its script is written from it (with the feature's story) by auto().
  attach(id, productionId, { actId, order = null, title = null, logline = null } = {}) {
    const f = this.get(id)
    const act = f.acts.find((a) => a.id === actId)
    if (!act) throw new Error(`No act ${actId} in this feature.`)
    if (f.sequences.some((s) => s.id === productionId)) throw new Error('That production is already a sequence of this feature.')
    const p = this.productions().get(productionId)
    const inAct = f.sequences.filter((s) => s.actId === actId)
    f.sequences.push({ id: productionId, actId, order: order == null ? inAct.length + 1 : Number(order), title: title || p.name, logline: String(logline || '') })
    // the production is a reel of this feature now, not a standalone short
    p.kind = 'feature'
    this.productions().write(p)
    return this.write(f)
  }
  detach(id, productionId) {
    const f = this.get(id)
    f.sequences = f.sequences.filter((s) => s.id !== productionId)
    try {
      const p = this.productions().get(productionId)
      p.kind = 'short'
      this.productions().write(p)
    } catch {}
    return this.write(f)
  }

  // The feature's promo: a Sizzle (sizzle.js), made from a website and the feature's footage. Pass null to unlink.
  setTrailer(id, trailerId) {
    const f = this.get(id)
    f.trailerId = trailerId || null
    return this.write(f)
  }
  // The feature's songs and score: Music ids (music.js).
  addSong(id, songId) {
    const f = this.get(id)
    if (!f.songs.includes(songId)) f.songs = [...f.songs, songId]
    return this.write(f)
  }
  removeSong(id, songId) {
    const f = this.get(id)
    f.songs = f.songs.filter((s) => s !== songId)
    return this.write(f)
  }

  // The AI plans the whole feature from its story: the act structure, the sequences each act needs (created
  // and attached as Projects, in order), and the cast (names, roles and looks — written into every sequence's
  // cast so all scripts speak of the same people). Pass redo to re-plan one that already has sequences.
  // ask/writer are injectable for tests. Returns { acts, sequences, characters }.
  async planAll(id, { redo = false, ask = askWriter, writer = null } = {}) {
    const f = this.get(id)
    if (f.sequences.length && !redo) throw new Error('This feature already has sequences — remove them first, or pass redo to re-plan.')
    const brief = [`Film: ${f.name}${f.logline ? `. ${f.logline}` : ''}`, f.story ? `The story:\n${f.story}` : '', `${f.targetMinutes} minutes in all.`].filter(Boolean).join('\n')
    const structure = await ask(writer || this.writer?.() || { engine: 'local' }, {
      system: `You are a feature film's architect. Break the film into acts and sequences for an AI studio that films one Project (a reel of 1 to 8 minutes) at a time.
- Acts carry the three-part shape (setup, confrontation, resolution) sized to the target; use 1 to 5 acts and give each a title and one line about what it does in the story.
- Split the story into sequences in the order it is told: each is one place-and-time reel with a title and a one-line logline saying exactly what happens in it. A sequence runs 1 to 8 minutes.
- Cover the whole story: every beat lands in exactly one sequence; nothing invented beyond it. Name people as the story names them.
- minutes are whole numbers; the acts' minutes sum to the target, and each act's sequences' minutes sum to the act's.`,
      user: brief,
      schema: {
        type: 'object',
        properties: {
          acts: {
            type: 'array',
            minItems: 1,
            maxItems: 5,
            items: {
              type: 'object',
              properties: {
                title: { type: 'string', maxLength: 80 },
                logline: { type: 'string', maxLength: 200 },
                minutes: { type: 'number' },
                sequences: {
                  type: 'array',
                  minItems: 1,
                  maxItems: 12,
                  items: {
                    type: 'object',
                    properties: { title: { type: 'string', maxLength: 80 }, logline: { type: 'string', maxLength: 300 }, minutes: { type: 'number' } },
                    required: ['title', 'logline', 'minutes']
                  }
                }
              },
              required: ['title', 'logline', 'minutes', 'sequences']
            }
          }
        },
        required: ['acts']
      }
    })
    const acts = (structure?.acts || []).filter((a) => a && String(a.title || '').trim() && Number(a.minutes) > 0)
    if (!acts.length) throw new Error('The writer gave no acts. Try again.')
    // the cast, from the same story
    const castOut = await ask(writer || this.writer?.() || { engine: 'local' }, {
      system: `You are the casting director for the same film. List every character the story needs: name, who they are in one line (role and want), and how they look in one concrete line (apparent age, build, face, hair, clothes' overall impression). The exact outfits are designed separately. Keep names exactly as the story names them.`,
      user: brief,
      schema: {
        type: 'object',
        properties: { characters: { type: 'array', minItems: 1, maxItems: 12, items: { type: 'object', properties: { name: { type: 'string', maxLength: 60 }, who: { type: 'string', maxLength: 200 }, looks: { type: 'string', maxLength: 300 } }, required: ['name', 'who', 'looks'] } } },
        required: ['characters']
      }
    })
    const cast = (castOut?.characters || []).filter((c) => c && String(c.name || '').trim()).map((c) => ({ name: String(c.name).trim(), who: String(c.who || '').trim(), looks: String(c.looks || '').trim() }))
    // apply: acts, then a Project per sequence, then the cast on the feature and on every sequence
    this.setActs(id, acts.map((a) => ({ title: a.title, logline: a.logline, minutes: Math.max(1, Math.round(Number(a.minutes))) })))
    const prod = this.productions()
    let sequences = 0
    for (const act of this.get(id).acts) {
      const planned = acts.find((a) => a.title === act.title)?.sequences || []
      for (const seq of planned.filter((s) => s && String(s.title || '').trim())) {
        const minutes = Math.max(1, Math.round(Number(seq.minutes) || Math.max(1, Math.round(act.minutes / Math.max(1, planned.length)))))
        const title = String(seq.title).trim()
        const p = prod.create({ name: `${f.name} · ${title}`, aspect: f.aspect, targetSeconds: minutes * 60, logline: String(seq.logline || '').trim() })
        this.attach(id, p.id, { actId: act.id, title, logline: String(seq.logline || '').trim() })
        sequences++
      }
    }
    const withCast = this.get(id)
    this.write({ ...withCast, cast })
    this.linkCast(id, { force: true })
    return { acts: this.get(id).acts.length, sequences, characters: cast.length }
  }

  // The feature's cast linked to studio characters, an existing one of the same name reused (who -> about,
  // looks -> look): the film's people show on the Characters page, and the breakdown hands their names to the
  // shot planner and matches shots to them (productions.js reads a cast member's name through characterId).
  // planAll links as it plans (force: the sequences' casts are written even when no one needed creating);
  // auto() links a feature planned before characters were linked, so it heals on the next Write everything.
  linkCast(id, { force = false } = {}) {
    const f = this.get(id)
    if (!f.cast?.length) return []
    const chars = this.studio()
    let linked = false
    const cast = f.cast.map((c) => {
      if (c.characterId || !chars) return { ...c, characterId: c.characterId ?? null }
      const found = chars.characters().find((x) => String(x.name).trim().toLowerCase() === String(c.name).trim().toLowerCase())
      const saved = found || chars.saveCharacter({ name: c.name, about: c.who, look: c.looks })
      linked = true
      return { ...c, characterId: saved.id }
    })
    if (!linked && !force) return cast
    this.write({ ...this.get(id), cast })
    for (const seq of f.sequences) {
      try {
        this.productions().update(seq.id, { cast: cast.map((c) => ({ as: c.name, characterId: c.characterId, description: c.looks, face: null })) })
      } catch {}
    }
    return cast
  }

  // Writes every sequence's script and shots automatically, in running order. A sequence that already has a
  // script keeps it; one whose scenes all have shots is skipped unless redo, and a partly broken-down one
  // resumes with the scenes still missing shots (breakDown plans exactly those). Each sequence's script is
  // written from its own title and logline plus the feature's story, so the acts tell one film. Breakdowns run
  // in the background on the production (productions.js), so this returns at once with what it started.
  // sequence: write only this sequence (total control: review it, then start the next).
  // Returns { scripted, broken, running, errors }: running counts sequences whose breakdown was already going
  // (a second Write everything while the background work runs is not a failure).
  async auto(id, { redo = false, sequence = null } = {}) {
    const f = this.get(id)
    try {
      this.linkCast(id) // a feature planned before the cast was linked to studio characters heals here
    } catch {}
    const prod = this.productions()
    const list = sequence ? this.order(f).filter((s) => s.id === sequence) : this.order(f)
    if (sequence && !list.length) throw new Error(`No sequence ${sequence} in this feature.`)
    const out = { scripted: 0, broken: 0, running: 0, errors: [] }
    for (const seq of list) {
      try {
        const p = prod.get(seq.id)
        if (!String(p.script?.text || '').trim()) {
          const idea = [
            seq.logline ? `${seq.title}: ${seq.logline}` : seq.title,
            f.story ? `The film so far: ${f.story}` : '',
            f.cast?.length ? `Characters: ${f.cast.map((c) => `${c.name} (${c.who})`).join('; ')}.` : '',
            f.logline
          ]
            .filter(Boolean)
            .join('. ')
          await prod.writeScript(seq.id, { idea })
          out.scripted++
        }
        // any scene still without shots (or stale) needs planning — not only a sequence with no shots at all,
        // or an interrupted breakdown could never be resumed; redo goes through so a re-plan redoes every scene
        const scenes = prod.get(seq.id).scenes || []
        const unfinished = !scenes.length || scenes.some((s) => !(s.shots || []).length || s.stale)
        if (redo || unfinished) {
          prod.breakDown(seq.id, { redo })
          out.broken++
        }
      } catch (err) {
        if (/already being broken down/.test(err.message)) out.running++
        else out.errors.push({ sequence: seq.id, title: seq.title, error: err.message })
      }
    }
    return out
  }

  // Sequences in running order: acts in order, sequences by their order inside each act.
  order(f) {
    return f.acts.flatMap((a) => f.sequences.filter((s) => s.actId === a.id).sort((x, y) => x.order - y.order))
  }

  // Progress across every sequence: shots planned/filmed/finished and finished footage, rolled up per act and overall.
  stats(id) {
    const f = this.get(id)
    const acts = f.acts.map((a) => ({ id: a.id, title: a.title, minutes: a.minutes, sequences: 0, shots: 0, filmed: 0, finished: 0, seconds: 0 }))
    const total = { shots: 0, filmed: 0, finished: 0, seconds: 0 }
    for (const seq of this.order(f)) {
      const act = acts.find((a) => a.id === seq.actId)
      const p = this.productions().get(seq.id)
      const shots = (p.scenes || []).flatMap((s) => s.shots || [])
      const done = shots.filter((sh) => sh.state?.final || sh.state?.status === 'success')
      const filmed = shots.filter((sh) => sh.state?.candidates?.length || sh.state?.final)
      const seconds = done.reduce((t, sh) => t + (sh.state?.final?.duration ?? sh.seconds ?? 0), 0)
      act.sequences++
      act.shots += shots.length
      act.filmed += filmed.length
      act.finished += done.length
      act.seconds += seconds
      total.shots += shots.length
      total.filmed += filmed.length
      total.finished += done.length
      total.seconds += seconds
    }
    return { targetSeconds: f.targetMinutes * 60, footageSeconds: +total.seconds.toFixed(1), percent: f.targetMinutes ? +Math.min(100, ((total.seconds / 60) / f.targetMinutes) * 100).toFixed(1) : 0, acts, total }
  }

  // The whole story as one tree, for the story explorer (StoryMap.jsx) and agents: feature → acts → sequences →
  // scenes → shots, each shot with a status (written / filmed / finished) and the project id its renders live
  // under (null until its first render). A sequence whose production is gone comes back empty, not an error.
  explore(id) {
    const f = this.get(id)
    const prod = this.productions()
    const shotOf = (sh) => ({
      id: sh.id,
      action: sh.action || '',
      camera: sh.camera || '',
      staging: sh.staging || '',
      ends: sh.ends || '',
      seconds: sh.seconds || 0,
      line: sh.line ? `${sh.speaker ? `${sh.speaker}: ` : ''}${sh.line}` : '',
      status: sh.state?.final || sh.state?.status === 'success' ? 'finished' : sh.state?.candidates?.length ? 'filmed' : 'written',
      projectId: sh.projectId || sh.state?.final?.projectId || null
    })
    const acts = f.acts.map((act) => ({
      ...act,
      sequences: this.order(f)
        .filter((s) => s.actId === act.id)
        .map((seq) => {
          let p = null
          try {
            p = prod.get(seq.id)
          } catch {}
          return {
            id: seq.id,
            title: seq.title,
            logline: seq.logline,
            editId: p?.editId || null,
            scenes: (p?.scenes || []).map((sc) => ({ id: sc.id, heading: sc.heading || '', location: sc.location || '', shots: (sc.shots || []).map(shotOf) }))
          }
        })
    }))
    const count = (keep) =>
      acts.reduce((t, a) => t + a.sequences.reduce((u, s) => u + s.scenes.reduce((v, c) => v + c.shots.filter((x) => (keep ? x.status === keep : true)).length, 0), 0), 0)
    return {
      feature: { id: f.id, name: f.name, logline: f.logline, targetMinutes: f.targetMinutes, story: f.story },
      acts,
      totals: { shots: count(), filmed: count('filmed') + count('finished'), finished: count('finished') }
    }
  }

  // The assembly: a master Edit with every sequence's cut laid on V1 in running order (each sequence's own
  // edit is the source of truth for trims). Returns { editId, placed, missing, seconds } like a rough cut.
  masterCut(id) {
    const f = this.get(id)
    const edits = this.edits()
    let e = null
    try {
      e = f.editId ? edits.get(f.editId) : null
    } catch {}
    if (!e) e = edits.create(`${f.name} · assembly`)
    const media = { ...e.media }
    const ops = [...e.clips.filter((c) => c.track === 'V1').map((c) => ({ op: 'remove_clip', clip: c.id }))]
    const missing = []
    let at = 0
    let placed = 0
    for (const seq of this.order(f)) {
      let se
      try {
        const p = this.productions().get(seq.id)
        se = p.editId ? edits.get(p.editId) : null
      } catch {}
      const clips = se?.clips.filter((c) => c.track === 'V1').sort((a, b) => a.start - b.start) || []
      if (!clips.length) {
        missing.push({ sequence: seq.id, title: seq.title })
        continue
      }
      for (const c of clips) {
        const src = se.media[c.media]
        let m = Object.values(media).find((x) => x.path === src?.path)
        if (!m) {
          m = edits.addMedia(src.path, { type: 'iv', label: seq.title })
          media[m.id] = m
        }
        ops.push({ op: 'add_clip', media: m.id, track: 'V1', start: +at.toFixed(3), in: c.in, out: c.out })
        at += clipLength(c)
        placed++
      }
    }
    const r = applyOps({ ...e, media }, ops)
    Object.assign(e, { clips: r.clips, media: r.media, tracks: r.tracks, markers: r.markers })
    edits.write(e)
    this.write({ ...f, editId: e.id })
    return { editId: e.id, placed, missing, seconds: +at.toFixed(2) }
  }
}
