// The overnight render queue (its own sidebar page): the shots you pick of a film, rendered one after another
// through the film's own flow (productions.filmShots — lines are said first, takes hunted, the storyboard fills
// in as it goes). Two modes: 'previz' hunts takes for shots that have none; 'final' also finishes — shots with
// takes go straight to the finish (productions.finish), new shots are hunted and their first take finished. One
// job at a time, so the night is predictable: progress per shot and overall, errors skip to the next shot
// instead of ending the night, and cancel stops after the current render. The queue only drives the existing
// flow; it changes nothing about how shots render.
import { SPEEDS, isSpeed } from './speed.js'

const DONE = ['success', 'error', 'cancelled']
const MODES = ['previz', 'final']

export class RenderQueue {
  // studio/productions/features: () => the app's instances. onEvent: the window's state updates.
  constructor({ studio, productions, features, onEvent }) {
    this.studio = studio
    this.productions = productions
    this.features = features
    this.onEvent = onEvent || (() => {})
    this.items = []
    this.running = false
    this.cancelled = false
    this.current = null
    this.startedAt = null
    this.finishedAt = null
    this.opts = null
  }

  // What the queue renders: a feature film's sequences, or one project (a short film) on its own.
  sequencesOf(kind, id) {
    if (kind === 'project') {
      const p = this.productions().get(id)
      return [{ id, title: p.name || 'Project', order: 1 }]
    }
    const f = this.features().get(id)
    return [...f.sequences].sort((a, b) => (a.order || 0) - (b.order || 0))
  }

  // The shots that can join, grouped for the page by scene. mode 'previz': shots with a prompt and no takes yet
  // (a failed hunt counts as none, so the night retries it). mode 'final': every shot with a prompt that isn't
  // finished — hasTakes marks the ones that go straight to the finish. retakes: shots with takes join too and
  // are hunted again (the storyboard's "Film again"). A one-take shot (continues) joins when the shot before it
  // has a take or is itself in the queue ahead of it.
  pending(kind, id, mode = 'previz', retakes = false) {
    const items = []
    for (const seq of this.sequencesOf(kind, id)) {
      const p = this.productions().get(seq.id)
      const stateOf = (sh) => (sh?.projectId ? this.productions().shotState(sh) : { status: String(sh?.prompt || '').trim() ? 'ready' : 'draft' })
      for (const sc of p.scenes || []) {
        ;(sc.shots || []).forEach((sh, i) => {
          if (sh.cut || !String(sh.prompt || '').trim()) return
          const st = stateOf(sh)
          if (['speaking', 'queued', 'rendering', 'finishing'].includes(st.status)) return
          const hasTakes = (st.candidates || []).length > 0
          if (st.status === 'finished' && !retakes) return
          if (mode === 'previz' && hasTakes && !retakes) return
          const prev = sc.shots[i - 1]
          if (sh.continues) {
            const pst = prev ? stateOf(prev) : null
            const prevOk = pst && (['pick', 'finished', 'finishing'].includes(pst.status) || items.some((x) => x.shotId === prev.id))
            if (!prevOk) return
          }
          items.push({
            seqId: seq.id,
            seqTitle: seq.title,
            sceneId: sc.id,
            sceneTitle: sc.location || sc.heading || 'Scene',
            shotId: sh.id,
            title: `${sc.location || sc.heading || 'Scene'} · shot ${i + 1}`,
            seconds: sh.seconds || 5,
            hasTakes,
            picked: st.picked || 1,
            status: 'waiting',
            progress: null,
            error: null
          })
        })
      }
    }
    return items
  }

  // Every scene and every shot of the film, for the page's picker: queueable marks the shots the current mode
  // can render (pending()); the rest are shown with their status — finished, has takes, no prompt, cut, in flight.
  board(kind, id, mode = 'previz', retakes = false) {
    const queueable = new Set(this.pending(kind, id, mode, retakes).map((i) => i.shotId))
    const items = []
    for (const seq of this.sequencesOf(kind, id)) {
      const p = this.productions().get(seq.id)
      const stateOf = (sh) => (sh?.projectId ? this.productions().shotState(sh) : { status: String(sh?.prompt || '').trim() ? 'ready' : 'draft' })
      for (const sc of p.scenes || []) {
        ;(sc.shots || []).forEach((sh, i) => {
          const st = stateOf(sh)
          items.push({
            seqId: seq.id,
            seqTitle: seq.title,
            sceneId: sc.id,
            sceneTitle: sc.location || sc.heading || 'Scene',
            shotId: sh.id,
            title: `${sc.location || sc.heading || 'Scene'} · shot ${i + 1}`,
            seconds: sh.seconds || 5,
            hasTakes: (st.candidates || []).length > 0,
            picked: st.picked || 1,
            status: sh.cut ? 'cut' : st.status,
            hasPrompt: !!String(sh.prompt || '').trim(),
            queueable: queueable.has(sh.id)
          })
        })
      }
    }
    return items
  }

  state() {
    const done = this.items.filter((i) => i.status === 'done').length
    const failed = this.items.filter((i) => i.status === 'error').length
    return {
      running: this.running,
      cancelled: this.cancelled,
      startedAt: this.startedAt,
      finishedAt: this.finishedAt,
      opts: this.opts,
      total: this.items.length,
      done,
      failed,
      current: this.current ? this.current.shotId : null,
      items: this.items
    }
  }
  emit() {
    this.onEvent(this.state())
  }

  // Start the night. mode: 'previz' (takes) or 'final' (takes for new shots, then finish; filmed shots finish
  // at once). retakes: filmed shots are hunted again instead of finishing their old takes. shotIds: the page's
  // selection (all pending shots when omitted). takes: 1-3 takes a shot. speed: a speed preset (speed.js) —
  // saved on the film's sequences, so takes and finishes render at it.
  async start({ kind = 'feature', id, mode = 'previz', retakes = false, shotIds = null, takes = 2, speed = 'balanced' }) {
    if (this.running) throw new Error('The queue is already running.')
    if (!MODES.includes(mode)) throw new Error(`Unknown mode "${mode}".`)
    if (!isSpeed(speed)) throw new Error(`Unknown quality "${speed}".`)
    const wanted = shotIds?.length ? new Set(shotIds) : null
    const items = this.pending(kind, id, mode, retakes).filter((i) => !wanted || wanted.has(i.shotId))
    if (!items.length) throw new Error(wanted ? 'Pick at least one shot.' : 'Nothing to render: every shot with a prompt is already filmed.')
    for (const seq of this.sequencesOf(kind, id)) this.productions().patch(seq.id, (q) => (q.settings = { ...(q.settings || {}), speed }))
    this.items = items
    this.opts = { kind, id, mode, retakes: !!retakes, takes: Math.min(3, Math.max(1, Math.round(takes))), speed }
    this.running = true
    this.cancelled = false
    this.current = null
    this.startedAt = new Date().toISOString()
    this.finishedAt = null
    this.emit()
    this.loop().catch(() => {})
    return this.state()
  }

  async loop() {
    for (const item of this.items) {
      if (this.cancelled) {
        item.status = 'cancelled'
        continue
      }
      this.current = item
      this.emit()
      try {
        if (this.opts.mode === 'final' && item.hasTakes && !this.opts.retakes) {
          // already filmed: straight to the finish of the take the shot picked (or take 1)
          item.status = 'finishing'
          this.emit()
          const fin = await this.productions().finish(item.seqId, item.shotId, item.picked || 1, {})
          await this.wait(fin.id, item)
        } else {
          item.status = 'rendering'
          this.emit()
          const [job] = await this.productions().filmShots(item.seqId, [item.shotId], { previews: this.opts.takes })
          await this.wait(job.id, item)
          if (this.opts.mode === 'final' && !this.cancelled) {
            item.status = 'finishing'
            this.emit()
            const fin = await this.productions().finish(item.seqId, item.shotId, 1, {})
            await this.wait(fin.id, item)
          }
        }
        item.status = this.cancelled ? 'cancelled' : 'done'
      } catch (err) {
        item.status = this.cancelled ? 'cancelled' : 'error'
        item.error = err.message
      }
      item.progress = null
      this.emit()
    }
    this.running = false
    this.current = null
    this.finishedAt = new Date().toISOString()
    this.emit()
  }

  // One job to its end, with live step progress; cancel stops the render on ComfyUI too.
  async wait(jobId, item) {
    for (const end = Date.now() + 3 * 60 * 60e3; Date.now() < end; await new Promise((r) => setTimeout(r, 3000))) {
      if (this.cancelled) {
        await this.studio().cancelJob(jobId).catch(() => {})
        throw new Error('Cancelled.')
      }
      const j = await this.studio().refreshJob(jobId)
      item.progress = j.progress || null
      this.emit()
      if (DONE.includes(j.status)) {
        if (j.status !== 'success') throw new Error(j.error || `The render ${j.status}.`)
        return j
      }
    }
    throw new Error('The render took too long.')
  }

  cancel() {
    this.cancelled = true
    this.emit()
    return this.state()
  }
}

// What the night costs, before it starts: hunts × the preset's hunt estimate, plus a finish per shot in final
// mode (speed.js's measured numbers). Shots that already have takes skip the hunt.
export function estimate(items, speed, mode = 'previz') {
  const e = SPEEDS[speed]?.estimate || SPEEDS.balanced.estimate
  const hunts = items.filter((i) => !i.hasTakes).length
  const finishes = mode === 'final' ? items.length : 0
  return { seconds: hunts * e.hunt + finishes * e.finish, hunts, finishes }
}
