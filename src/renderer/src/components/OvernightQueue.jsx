import { useEffect, useRef, useState } from 'react'
import { SPEEDS, SPEED_IDS } from '../../../service/speed'
import { Step, Choices, Summary, SummaryDock, SummaryFrame } from './FlowKit'
import Stage from './Stage'

// Render queue (its own sidebar page, renderqueue.js): the shots you pick of a film, rendered one after another
// overnight. Previz mode hunts takes; final mode also finishes (filmed shots go straight to the finish). Takes
// and quality up front, progress per shot and overall, a sound when the night is done. The queue drives the
// film's own flow; it changes nothing about how shots render.
const TAKES = [
  [1, '1 take', 'Quickest; reroll later if it misses'],
  [2, '2 takes', 'A choice per shot'],
  [3, '3 takes', 'The full hunt, slowest']
]
const QUALITIES = SPEED_IDS.map((id) => [id, SPEEDS[id].label, SPEEDS[id].say])
const MODES = [
  ['previz', 'Previz render', 'Hunt takes for the picked shots — fast, small, for judging the film'],
  ['final', 'Final render', 'New shots: takes, then finish take 1. Filmed shots: straight to the finish']
]
const fmtDur = (s) => (s >= 3600 ? `${Math.floor(s / 3600)} h ${Math.round((s % 3600) / 60)} min` : s >= 60 ? `${Math.round(s / 60)} min` : `${Math.round(s)} s`)

// a two-note chime when the night is done, made with WebAudio (no sound file needed)
function chime() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const note = (f, at, len) => {
      const o = ctx.createOscillator()
      const g = ctx.createGain()
      o.type = 'sine'
      o.frequency.value = f
      g.gain.setValueAtTime(0.0001, at)
      g.gain.exponentialRampToValueAtTime(0.25, at + 0.03)
      g.gain.exponentialRampToValueAtTime(0.0001, at + len)
      o.connect(g).connect(ctx.destination)
      o.start(at)
      o.stop(at + len + 0.05)
    }
    note(660, ctx.currentTime, 0.35)
    note(880, ctx.currentTime + 0.22, 0.6)
    setTimeout(() => ctx.close(), 1500)
  } catch {}
}

export default function OvernightQueue({ notify }) {
  const [films, setFilms] = useState([]) // [{ key: 'feature:id' | 'project:id', name, group }]
  const [filmId, setFilmId] = useState('')
  const [mode, setMode] = useState('previz')
  const [takes, setTakes] = useState(2)
  const [speed, setSpeed] = useState('balanced')
  const [retakes, setRetakes] = useState(false)
  const [sound, setSound] = useState(true)
  const [pending, setPending] = useState(null) // { items, estimate }
  const [picked, setPicked] = useState(() => new Set()) // the shots in the queue, by shotId
  const [q, setQ] = useState(null) // the queue's live state
  const wasRunning = useRef(false)
  useEffect(() => {
    ;(async () => {
      const [fs, ps] = await Promise.all([window.ivstudio.features.list().catch(() => []), window.ivstudio.productions.list().catch(() => [])])
      const full = await Promise.all(fs.map((f) => window.ivstudio.features.get(f.id).catch(() => null)))
      const inFeature = new Set(full.filter(Boolean).flatMap((f) => (f.sequences || []).map((s) => s.id)))
      const list = [
        ...fs.map((f) => ({ key: `feature:${f.id}`, name: f.name, group: 'Feature films' })),
        ...ps.filter((p) => !inFeature.has(p.id)).map((p) => ({ key: `project:${p.id}`, name: p.name, group: 'Projects' }))
      ]
      setFilms(list)
      if (list.length) setFilmId((v) => v || list[0].key)
    })()
    window.ivstudio.renderQueue.state().then(setQ, () => {})
    const off = window.ivstudio.renderQueue.onState((s) => {
      setQ(s)
      if (wasRunning.current && !s.running && s.finishedAt && !s.cancelled) {
        if (sound) chime()
        notify(`The queue is done: ${s.done} of ${s.total} shot${s.total === 1 ? '' : 's'} rendered${s.failed ? `, ${s.failed} failed` : ''}.`, s.failed ? 'error' : 'info')
      }
      wasRunning.current = s.running
    })
    return off
  }, [sound])
  useEffect(() => {
    if (!filmId) return
    const [kind, id] = filmId.split(':')
    window.ivstudio.renderQueue.pending(kind, id, mode, speed, retakes).then((p) => {
      setPending(p)
      setPicked(new Set(p.items.filter((i) => i.queueable).map((i) => i.shotId))) // every renderable shot picked by default
    }, () => setPending(null))
  }, [filmId, mode, speed, retakes])
  const running = !!q?.running
  const items = pending?.items || []
  // the shots grouped by scene, in story order, for the picker
  const groups = []
  for (const i of items) {
    const key = `${i.seqTitle} — ${i.sceneTitle}`
    if (!groups.length || groups[groups.length - 1].key !== key) groups.push({ key, shots: [] })
    groups[groups.length - 1].shots.push(i)
  }
  const chosen = items.filter((i) => i.queueable && picked.has(i.shotId))
  const e = SPEEDS[speed].estimate
  const hunts = chosen.filter((i) => !i.hasTakes).length
  const finishes = mode === 'final' ? chosen.length : 0
  const estSeconds = hunts * e.hunt + finishes * e.finish
  const toggle = (shotId) => setPicked((s) => (s.has(shotId) ? new Set([...s].filter((x) => x !== shotId)) : new Set([...s, shotId])))
  const toggleGroup = (g) =>
    setPicked((s) => {
      const next = new Set(s)
      const able = g.shots.filter((i) => i.queueable)
      const all = able.every((i) => next.has(i.shotId))
      for (const i of able) (all ? next.delete(i.shotId) : next.add(i.shotId))
      return next
    })
  // the right-hand note of a shot row: why it can't join, or what it costs
  const noteOf = (i) => {
    if (i.queueable) {
      if (!i.hasTakes) return `${i.seconds}s`
      return mode === 'final' && !retakes ? 'has takes — finishes only' : 'retake — new takes'
    }
    if (i.status === 'cut') return 'cut'
    if (!i.hasPrompt) return 'no prompt'
    if (i.status === 'finished') return 'finished'
    if (i.hasTakes && mode === 'previz') return 'has takes'
    return i.status
  }
  const pct = q?.total ? Math.round(((q.done + q.failed) / q.total) * 100) : 0
  const current = q?.items.find((i) => i.shotId === q.current)
  const stepPct = current?.progress?.max ? Math.round((current.progress.value / current.progress.max) * 100) : null
  async function start() {
    try {
      const [kind, id] = filmId.split(':')
      await window.ivstudio.renderQueue.start({ kind, id, mode, retakes, shotIds: [...picked], takes, speed })
      notify('The queue is running. Leave the app open; it renders one shot after another.', 'info')
    } catch (err) {
      notify(err.message)
    }
  }
  async function cancel() {
    await window.ivstudio.renderQueue.cancel().catch(() => {})
    notify('Stopping after the current render…', 'info')
  }
  const film = films.find((f) => f.key === filmId)
  const facts = [
    ['Film', film?.name || 'none yet'],
    ['Mode', mode === 'final' ? 'Final render' : 'Previz render'],
    ['Shots picked', `${chosen.length} of ${items.length}`],
    ['Takes', String(takes)],
    ['Quality', SPEEDS[speed].label],
    ['About', fmtDur(estSeconds)]
  ]
  const action = running
    ? { label: 'Stop the queue', onClick: cancel, disabled: false }
    : { label: chosen.length ? `Render ${chosen.length} shot${chosen.length === 1 ? '' : 's'} overnight` : 'Pick at least one shot', onClick: start, disabled: !chosen.length }
  return (
    <div className="rqueue-page create-v2 flow-page">
      <Stage effect="cogs" art="queue" title="Render queue" kicker="The shots you pick, overnight">
        <p className="stage-note small">Pick a film, pick its shots, and the queue renders them one after another — lines said, takes hunted, the storyboard fills in. Leave the app open; a sound tells you when the night is done.</p>
      </Stage>

      <div className="create-layout">
        <div className="create-steps">
          <Step n={1} title="The film and the mode" sub="Previz hunts takes to judge the film; final renders the shots to their finished size.">
            <label className="previz-character small">
              Film{' '}
              <select value={filmId} onChange={(e) => setFilmId(e.target.value)} disabled={running}>
                {[...new Set(films.map((f) => f.group))].map((g) => (
                  <optgroup key={g} label={g}>
                    {films.filter((f) => f.group === g).map((f) => (
                      <option key={f.key} value={f.key}>
                        {f.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>
            {!films.length && <p className="small dim">No films or projects yet — write a storyboard first (Projects or Features).</p>}
            <Choices label="Mode" options={MODES} value={mode} onChange={setMode} />
          </Step>

          <Step n={2} title="The shots" sub="Every scene and every shot, in story order. Renderable shots are picked to start; the rest show why they can't join.">
            <div className="media-actions">
              <button className="link-btn small" onClick={() => setPicked(new Set(items.filter((i) => i.queueable).map((i) => i.shotId)))}>
                Pick all
              </button>
              <button className="link-btn small" onClick={() => setPicked(new Set())}>
                Pick none
              </button>
              <span className="small dim">
                {chosen.length} of {items.filter((i) => i.queueable).length} renderable picked · {items.length} shots in all
              </span>
            </div>
            <div className="rqueue-pick">
              {groups.map((g) => {
                const able = g.shots.filter((i) => i.queueable)
                const all = able.length > 0 && able.every((i) => picked.has(i.shotId))
                return (
                  <div key={g.key} className="rqueue-scene">
                    <label className="rqueue-scene-head small">
                      <input type="checkbox" checked={all} disabled={!able.length} onChange={() => toggleGroup(g)} />
                      <span className="mono">{g.key}</span>
                      <span className="dim">
                        {able.filter((i) => picked.has(i.shotId)).length}/{able.length} picked · {g.shots.length} shots
                      </span>
                    </label>
                    {g.shots.map((i) => (
                      <label key={i.shotId} className={`rqueue-shot small ${i.queueable ? '' : 'off'}`}>
                        <input type="checkbox" checked={i.queueable && picked.has(i.shotId)} disabled={!i.queueable} onChange={() => toggle(i.shotId)} />
                        <span>{i.title}</span>
                        <span className="dim">{noteOf(i)}</span>
                      </label>
                    ))}
                  </div>
                )
              })}
              {pending && !items.length && <p className="small dim">This film has no shots yet — write its storyboard first.</p>}
            </div>
          </Step>

          <Step n={3} title="Takes and quality" sub="Takes are hunted per new shot; quality is the film's speed preset, saved on its sequences.">
            <Choices label="Takes" options={TAKES} value={takes} onChange={setTakes} />
            <Choices label="Quality" options={QUALITIES} value={speed} onChange={setSpeed} className="flow-four" />
            <label className="rqueue-check small">
              <input type="checkbox" checked={retakes} onChange={(e) => setRetakes(e.target.checked)} /> Retakes — hunt new takes even for shots that have them, finished ones too
            </label>
            <label className="rqueue-check small">
              <input type="checkbox" checked={sound} onChange={(e) => setSound(e.target.checked)} /> Play a sound when the queue is done
            </label>
          </Step>

          {(running || q?.total > 0) && (
            <Step n={4} title="The night so far" sub={running ? 'Rendering one shot after another. Stop lands after the current render.' : 'The last run.'}>
              <div className="rqueue-overall">
                <div className="rqueue-bar big">
                  <span style={{ width: `${pct}%` }} />
                </div>
                <span className="mono small">
                  {q.done + q.failed} / {q.total} · {pct}%{q.failed ? ` · ${q.failed} failed` : ''}
                </span>
              </div>
              {current && (
                <p className="small dim">
                  Now: {current.title} ({current.seqTitle}){current.status === 'finishing' ? ' — finishing' : ''}
                  {stepPct != null ? ` — step ${current.progress.value} of ${current.progress.max} (${stepPct}%)` : ''}
                </p>
              )}
              {current && (
                <div className="rqueue-bar">
                  <span style={{ width: `${stepPct ?? 100}%` }} className={stepPct == null ? 'rqueue-indet' : ''} />
                </div>
              )}
              <div className="rqueue-items">
                {q.items.map((i) => (
                  <div key={i.shotId} className={`rqueue-item ${i.status}`}>
                    <span className="rqueue-item-name small">
                      {i.title} <span className="dim">· {i.seqTitle}</span>
                    </span>
                    <span className={`mono small rqueue-status ${i.status}`}>{i.status === 'error' ? `failed: ${i.error}` : i.status}</span>
                  </div>
                ))}
              </div>
            </Step>
          )}
        </div>

        <Summary label="Overnight queue" kind={film?.name} frame={<SummaryFrame aspect="16:9" tag={`${chosen.length} shots`} />} facts={facts} action={action} />
      </div>
      <SummaryDock facts={facts} action={action} />
    </div>
  )
}
