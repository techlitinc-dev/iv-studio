import { useMemo, useState } from 'react'
import { clock, plural, scenePlan, statusOf, PROGRESS, STATUS_COLOR, FILM_STATE } from './filmkit'

// The film's Plan view: the whole movie scheduled, the way OpenProject's Gantt does it — scenes are summary
// rows whose span derives from their shots (or their own dates when set), shots are the work packages with a
// start and end day and a % complete that follows their filming state. Dates edit in the table; bars follow.
// Auto-plan schedules every shot in script order at N shots a day, so a whole film gets a finish date in one click.
const P = () => window.ivstudio.productions
const DAY = 86400000
const day = (s) => new Date(`${s}T00:00:00Z`).getTime()
const iso = (t) => new Date(t).toISOString().slice(0, 10)
const today = () => new Date().toISOString().slice(0, 10)

export default function FilmPlan({ v, act, goShot }) {
  const [start, setStart] = useState(today())
  const [perDay, setPerDay] = useState(20)
  const [open, setOpen] = useState(() => new Set(v.scenes.map((s) => s.id)))
  const toggle = (id) => setOpen((cur) => (cur.has(id) ? new Set([...cur].filter((x) => x !== id)) : new Set([...cur, id])))
  const nums = useMemo(() => {
    const m = new Map()
    let n = 0
    for (const s of v.scenes) for (const sh of s.shots) m.set(sh.id, ++n)
    return m
  }, [v.scenes])

  // the rows: a summary per scene, its shots under it when open
  const rows = []
  for (const [k, sc] of v.scenes.entries()) {
    const pct = sc.shots.length ? Math.round(sc.shots.reduce((x, sh) => x + (PROGRESS[statusOf(sh)] ?? 0), 0) / sc.shots.length) : 0
    rows.push({ type: 'scene', sc, plan: scenePlan(sc), pct })
    if (open.has(sc.id)) for (const [i, sh] of sc.shots.entries()) rows.push({ type: 'shot', sc, sh, plan: sh.plan || null, pct: PROGRESS[statusOf(sh)] ?? 0, i })
  }
  const planned = rows.filter((r) => r.plan)
  const shots = v.scenes.flatMap((s) => s.shots)
  const unplanned = shots.filter((sh) => !sh.plan).length

  // the timeline: from the earliest planned day to the latest, padded; day columns, or weeks past 45 days
  let min = 0
  let span = 0
  let weekMode = false
  if (planned.length) {
    min = Math.min(...planned.map((r) => day(r.plan.start)))
    const max = Math.max(...planned.map((r) => day(r.plan.end)))
    span = Math.max(7, Math.round((max - min) / DAY) + 1)
    weekMode = span > 45
  }
  const cols = []
  if (planned.length) {
    const step = weekMode ? 7 : 1
    for (let d = 0; d < span; d += step) cols.push({ left: (d / span) * 100, label: iso(min + d * DAY).slice(weekMode ? 0 : 5) })
  }
  const pos = (s) => ((day(s) - min) / DAY / span) * 100
  const width = (p) => (((day(p.end) - day(p.start)) / DAY + 1) / span) * 100
  const nowLeft = planned.length && day(today()) >= min && day(today()) <= min + span * DAY ? ((day(today()) - min) / DAY / span) * 100 : null

  const setPlan = (r, which, value) => {
    const cur = r.plan || { start: value, end: value }
    const next = value ? { ...cur, [which]: value } : null
    if (next && next.end < next.start) next[which === 'start' ? 'end' : 'start'] = value
    if (r.type === 'scene') act(() => P().editScene(v.id, r.sc.id, { plan: next }))
    else act(() => P().editShot(v.id, r.sc.id, r.sh.id, { plan: next }))
  }
  const autoPlan = () => act(() => P().autoPlan(v.id, { start, perDay }), (p) => `Planned: ${plural(p.scenes.flatMap((s) => s.shots).length, 'shot')} at ${perDay} a day.`)

  return (
    <div className="filmplan">
      <div className="filmplan-tools">
        <label className="mono small dim">
          From{' '}
          <input type="date" value={start} onChange={(e) => setStart(e.target.value)} aria-label="First day" />
        </label>
        <label className="mono small dim">
          <input className="filmplan-num" type="number" min={1} max={500} value={perDay} onChange={(e) => setPerDay(Number(e.target.value))} aria-label="Shots a day" /> shots a day
        </label>
        <button className="btn btn-small btn-primary" onClick={autoPlan}>
          ✦ Auto-plan the film
        </button>
        {planned.length > 0 && (
          <button className="link-btn mono small" onClick={() => act(() => P().autoPlan(v.id, { clear: true }), 'Every date cleared.')}>
            Clear all dates
          </button>
        )}
        <span className="filmplan-legend mono small dim">
          {[
            ['finished', 'Done'],
            ['pick', 'To pick'],
            ['rendering', 'Filming'],
            ['ready', 'To film'],
            ['draft', 'Not planned']
          ].map(([k, label]) => (
            <span key={k}>
              <i style={{ background: STATUS_COLOR[k] }} /> {label}
            </span>
          ))}
        </span>
      </div>
      {!planned.length ? (
        <div className="filmplan-empty">
          <p className="dim">Nothing scheduled yet. Auto-plan gives every shot a day — {plural(shots.length, 'shot')} at {perDay} a day from {start} — then drag the dates that need to move.</p>
        </div>
      ) : (
        <>
          <p className="mono small dim filmplan-span">
            {iso(min)} → {iso(min + (span - 1) * DAY)} · {span} {weekMode ? 'days, by week' : 'days'}
            {unplanned ? ` · ${plural(unplanned, 'shot')} without a date` : ''}
          </p>
          <div className="filmplan-grid" role="table" aria-label="The film's schedule">
            <div className="filmplan-row filmplan-head" role="row">
              <span className="filmplan-name">Scene / shot</span>
              <span className="filmplan-secs">Secs</span>
              <span className="filmplan-date">Start</span>
              <span className="filmplan-date">End</span>
              <span className="filmplan-pct">%</span>
              <span className="filmplan-track filmplan-dates">
                {cols.map((c) => (
                  <span key={c.left} className="filmplan-col" style={{ left: `${c.left}%` }}>
                    {c.label}
                  </span>
                ))}
              </span>
            </div>
            {rows.map((r) =>
              r.type === 'scene' ? (
                <div key={r.sc.id} className="filmplan-row filmplan-scene" role="row">
                  <span className="filmplan-name">
                    <button className="filmplan-caret" aria-expanded={open.has(r.sc.id)} onClick={() => toggle(r.sc.id)}>
                      {open.has(r.sc.id) ? '▾' : '▸'}
                    </button>
                    <span className="mono small pink">S{v.scenes.indexOf(r.sc) + 1}</span> {r.sc.location || r.sc.heading}
                    <span className="dim"> · {plural(r.sc.shots.length, 'shot')}</span>
                  </span>
                  <span className="filmplan-secs mono small dim">{clock(r.sc.shots.reduce((x, sh) => x + sh.seconds, 0))}</span>
                  <span className="filmplan-date">
                    <input type="date" value={r.plan?.start || ''} onChange={(e) => setPlan(r, 'start', e.target.value)} aria-label="Scene start" />
                  </span>
                  <span className="filmplan-date">
                    <input type="date" value={r.plan?.end || ''} onChange={(e) => setPlan(r, 'end', e.target.value)} aria-label="Scene end" />
                  </span>
                  <span className="filmplan-pct mono small dim">{r.pct}%</span>
                  <span className="filmplan-track">
                    {r.plan && (
                      <span className="filmplan-bar filmplan-bar-scene" style={{ left: `${pos(r.plan.start)}%`, width: `${width(r.plan)}%` }} title={`${r.plan.start} → ${r.plan.end} · ${r.pct}%`}>
                        <span style={{ width: `${r.pct}%` }} />
                      </span>
                    )}
                    {nowLeft != null && <i className="filmplan-today" style={{ left: `${nowLeft}%` }} />}
                  </span>
                </div>
              ) : (
                <div key={r.sh.id} className="filmplan-row filmplan-shot" role="row" onDoubleClick={() => goShot?.(r.sc.id, r.sh.id, statusOf(r.sh))} title="Double-click to open the shot">
                  <span className="filmplan-name filmplan-shot-name">
                    <span className="mono small dim">№{nums.get(r.sh.id)}</span> {r.sh.action || <span className="dim">Say what happens.</span>}
                  </span>
                  <span className="filmplan-secs mono small dim">{r.sh.seconds}s</span>
                  <span className="filmplan-date">
                    <input type="date" value={r.plan?.start || ''} onChange={(e) => setPlan(r, 'start', e.target.value)} aria-label={`Shot ${r.i + 1} start`} />
                  </span>
                  <span className="filmplan-date">
                    <input type="date" value={r.plan?.end || ''} onChange={(e) => setPlan(r, 'end', e.target.value)} aria-label={`Shot ${r.i + 1} end`} />
                  </span>
                  <span className="filmplan-pct mono small dim">{r.pct}%</span>
                  <span className="filmplan-track">
                    {r.plan && (
                      <span
                        className="filmplan-bar"
                        style={{ left: `${pos(r.plan.start)}%`, width: `${width(r.plan)}%`, background: STATUS_COLOR[statusOf(r.sh)] }}
                        title={`${r.plan.start === r.plan.end ? r.plan.start : `${r.plan.start} → ${r.plan.end}`} · ${FILM_STATE[statusOf(r.sh)]?.[0] || ''} · ${r.pct}%`}
                      >
                        <span style={{ width: `${r.pct}%` }} />
                      </span>
                    )}
                    {nowLeft != null && <i className="filmplan-today" style={{ left: `${nowLeft}%` }} />}
                  </span>
                </div>
              )
            )}
          </div>
        </>
      )}
    </div>
  )
}
