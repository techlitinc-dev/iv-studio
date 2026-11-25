import { useState } from 'react'
import { clock, estimate, nice, plural, scenePlan, statusOf, FILM_STATE, STATUS_COLOR } from './filmkit'

// A film's dashboard (the project page's "Dashboard" view): where the whole film stands — the numbers, one
// stacked bar of every shot's state, the schedule when the Plan view set one, and every scene with its shots,
// each a link that jumps the board to it. All read from the production view; nothing here renders.
const ORDER = ['finished', 'pick', 'filming', 'ready', 'draft', 'error']
const SEGMENT = { finished: 'Done', pick: 'To pick', filming: 'Filming', ready: 'To film', draft: 'Not planned', error: 'Failed' }
const segStatus = { finished: 'finished', pick: 'pick', filming: 'rendering', ready: 'ready', draft: 'draft', error: 'error' }

export function filmCounts(shots) {
  const c = { finished: 0, pick: 0, filming: 0, ready: 0, draft: 0, error: 0 }
  for (const sh of shots) {
    const st = statusOf(sh)
    if (st === 'finished') c.finished++
    else if (st === 'pick') c.pick++
    else if (['rendering', 'finishing', 'speaking', 'queued'].includes(st)) c.filming++
    else if (st === 'ready') c.ready++
    else if (st === 'error') c.error++
    else c.draft++
  }
  return c
}

export function StatusBar({ counts, total, height = 8 }) {
  if (!total) return null
  return (
    <span className="filmdash-bar" style={{ height }} title={ORDER.map((k) => `${SEGMENT[k]}: ${counts[k]}`).join(' · ')}>
      {ORDER.map((k) => counts[k] > 0 && <span key={k} style={{ width: `${(counts[k] / total) * 100}%`, background: STATUS_COLOR[segStatus[k]] }} />)}
    </span>
  )
}

export default function FilmDash({ v, goScene, goShot }) {
  const [open, setOpen] = useState(() => new Set())
  const all = v.scenes.flatMap((s) => s.shots)
  const total = all.length
  const counts = filmCounts(all)
  const pct = total ? Math.round((counts.finished / total) * 100) : 0
  const secs = all.reduce((x, sh) => x + sh.seconds, 0)
  const left = all.filter((sh) => !['finished', 'pick'].includes(statusOf(sh)))
  const mins = left.length ? estimate(left, 3) : 0
  const days = all.map((sh) => sh.plan).filter(Boolean).flatMap((p) => [p.start, p.end]).sort()
  const span = days.length ? { from: days[0], to: days.at(-1) } : null
  const unplanned = all.filter((sh) => !sh.plan).length
  const toggle = (id) => setOpen((cur) => (cur.has(id) ? new Set([...cur].filter((x) => x !== id)) : new Set([...cur, id])))
  const nums = new Map()
  {
    let n = 0
    for (const s of v.scenes) for (const sh of s.shots) nums.set(sh.id, ++n)
  }
  const TILES = [
    ['Shots', total, ''],
    ['Planned', clock(secs), `of ${clock(v.targetSeconds)} goal`],
    ['Done', `${pct}%`, `${counts.finished} of ${total}`],
    ['To pick', counts.pick, counts.pick ? 'takes wait for you' : ''],
    ['Filming', counts.filming, ''],
    ['Failed', counts.error, counts.error ? 'needs a look' : '', counts.error ? 'pink' : ''],
    ['Not planned', counts.draft, '']
  ]
  return (
    <div className="filmdash">
      <div className="filmdash-tiles">
        {TILES.map(([label, value, sub, tone]) => (
          <div key={label} className={`filmdash-tile ${tone || ''}`}>
            <span className="filmdash-tile-value">{value}</span>
            <span className="mono small dim">{label}</span>
            {sub && <span className="small dim">{sub}</span>}
          </div>
        ))}
      </div>
      <div className="filmdash-overall">
        <StatusBar counts={counts} total={total} height={12} />
        <span className="mono small dim">
          {ORDER.filter((k) => counts[k]).map((k) => `${SEGMENT[k]} ${counts[k]}`).join(' · ')}
        </span>
        <span className="mono small dim">
          {left.length ? `About ${mins >= 90 ? `${Math.round(mins / 60)} h` : `${mins} min`} of GPU left (3 takes a shot)` : 'Every shot has its takes.'}
          {span ? ` · Scheduled ${span.from} → ${span.to}${unplanned ? ` (${unplanned} shots unscheduled)` : ''}` : ' · No schedule yet — set one on the Plan view.'}
        </span>
      </div>
      <table className="film-table filmdash-scenes">
        <thead>
          <tr>
            <th className="filmdash-caret-h" />
            <th>Scene</th>
            <th className="film-secs">Shots</th>
            <th className="film-secs">Secs</th>
            <th className="filmdash-progress-h">Progress</th>
            <th>Schedule</th>
            <th>State</th>
          </tr>
        </thead>
        <tbody>
          {v.scenes.map((sc, k) => {
            const c = filmCounts(sc.shots)
            const ssecs = sc.shots.reduce((x, sh) => x + sh.seconds, 0)
            const plan = scenePlan(sc)
            const isOpen = open.has(sc.id)
            const word = c.error ? 'Failed shots' : c.filming ? 'Filming' : c.pick ? 'To pick' : c.finished === sc.shots.length && sc.shots.length ? 'Done' : c.ready ? 'To film' : 'Planning'
            return [
              <tr key={sc.id} className="film-row filmdash-scene" onClick={() => goScene(sc.id)} title="Open this scene on the board">
                <td className="filmdash-caret">
                  <button
                    aria-label={isOpen ? 'Fold the shots away' : 'Show the shots'}
                    aria-expanded={isOpen}
                    onClick={(e) => {
                      e.stopPropagation()
                      toggle(sc.id)
                    }}
                  >
                    {isOpen ? '▾' : '▸'}
                  </button>
                </td>
                <td>
                  <span className="filmdash-scene-name">
                    <span className="mono small pink">S{k + 1}</span> {sc.location || sc.heading}
                    {sc.time ? <span className="dim"> · {sc.time.toLowerCase()}</span> : ''}
                  </span>
                </td>
                <td className="mono small dim film-secs">{sc.shots.length}</td>
                <td className="mono small dim film-secs">{clock(ssecs)}</td>
                <td className="filmdash-progress">
                  <StatusBar counts={c} total={sc.shots.length} />
                </td>
                <td className="mono small dim">{plan ? `${plan.start} → ${plan.end}` : '—'}</td>
                <td className={`mono small ${word === 'Failed shots' ? 'pink' : word === 'Done' ? 'filmdash-ok' : 'dim'}`}>{word}</td>
              </tr>,
              ...(isOpen
                ? sc.shots.map((sh, i) => {
                    const st = statusOf(sh)
                    const [label, tone] = FILM_STATE[st] || FILM_STATE.draft
                    return (
                      <tr key={sh.id} className="film-row filmdash-shot" onClick={() => goShot(sc.id, sh.id, st)} title="Open this shot">
                        <td />
                        <td className="filmdash-shot-name">
                          <span className="mono small dim">№{nums.get(sh.id)}</span> {sh.action || <span className="dim">Say what happens.</span>}
                          {sh.line && <span className="dim"> · “{sh.line.length > 60 ? `${sh.line.slice(0, 60)}…` : sh.line}” {nice(sh.speaker) && `— ${nice(sh.speaker)}`}</span>}
                        </td>
                        <td className="mono small dim film-secs">{i + 1}</td>
                        <td className="mono small dim film-secs">{sh.seconds}s</td>
                        <td className="filmdash-progress">
                          <span className={`wiz-panel-state ${tone}`}>{st === 'pick' ? `${label} · ${sh.state.candidates.length}` : label}</span>
                        </td>
                        <td className="mono small dim">{sh.plan ? (sh.plan.start === sh.plan.end ? sh.plan.start : `${sh.plan.start} → ${sh.plan.end}`) : '—'}</td>
                        <td />
                      </tr>
                    )
                  })
                : [])
            ]
          })}
        </tbody>
      </table>
      {!total && <p className="dim">No shots yet — plan the storyboard on the Storyboard step first.</p>}
    </div>
  )
}
