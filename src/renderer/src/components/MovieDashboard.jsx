import { useEffect, useState } from 'react'

// The movie dashboard (Features → a film → Dashboard): the whole film on one screen. The timeline lays the
// acts out in running order, each as wide as its planned minutes and filled by the footage finished so far,
// with every sequence as a block that fills as its shots finish. The cost cards and the analytics table use
// the cloud's own numbers (the pod's billed rate, today's spend from the ledger) in dollars and rupees.
// Read-only; the film's numbers refresh on every change, the cloud's every 30 s.
const F = () => window.ivstudio.features
const GPU_MIN_PER_SHOT = 4 // Techlit Studio's rule of thumb: a 10 s 2 MP shot takes roughly 3–5 GPU minutes

export default function MovieDashboard({ id, back, notify }) {
  const [f, setF] = useState(null)
  const [stats, setStats] = useState(null)
  const [tree, setTree] = useState(null)
  const [dash, setDash] = useState(null)
  const [days, setDays] = useState(null) // the last two weeks' cloud spend, one number a day
  const [costs, setCosts] = useState(null) // cloud GPU seconds per project (the shots' actual billed time)
  const [pics, setPics] = useState(null) // what GPT Image panels cost, per film tag (images.gptSpend)
  const [deep, setDeep] = useState(null) // the pipeline, render statistics and per-sequence rows (features:dashStats)
  useEffect(() => {
    const load = () => {
      F().get(id).then(setF, (e) => notify(e.message))
      F().stats(id).then(setStats, () => setStats(null))
      F().explore(id).then(setTree, () => setTree(null))
      F().dashStats(id).then(setDeep, () => setDeep(null))
      window.ivstudio.cloud.dash().then(setDash, () => setDash(null))
      window.ivstudio.cloud.spendDays().then(setDays, () => setDays(null))
      window.ivstudio.jobs.cloudSeconds().then(setCosts, () => setCosts(null))
      window.ivstudio.images.gptSpend().then(setPics, () => setPics(null))
    }
    load()
    const off = F().onChanged(load)
    const poll = setInterval(() => {
      window.ivstudio.cloud.dash().then(setDash, () => {})
      window.ivstudio.cloud.spendDays().then(setDays, () => {})
    }, 30000)
    return () => {
      off?.()
      clearInterval(poll)
    }
  }, [id])
  if (!f || !stats) return null

  const rate = dash?.rate || 1620
  const inr = (v) => `₹${(Number(v) * rate).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
  const perHour = dash?.pod?.perHour ?? dash?.gpuPerHour ?? null
  const costOf = (shots) => (perHour != null ? ((shots * GPU_MIN_PER_SHOT) / 60) * perHour : null)
  // what the filming actually used: the shots' own cloud GPU seconds, at the pod's rate
  const spentOf = (shots) => {
    if (perHour == null || !costs) return null
    const sec = (shots || []).reduce((t, sh) => t + (sh.projectId ? costs[sh.projectId] || 0 : 0), 0)
    return sec > 0 ? (sec / 3600) * perHour : null
  }
  const shotsOf = (a) => (a?.sequences || []).flatMap((s) => s.scenes.flatMap((sc) => sc.shots))
  const spentTotal = spentOf((tree?.acts || []).flatMap(shotsOf))
  // the film's GPT Image panels: sketches, places and faces are tagged film:<sequence> (productions.js)
  const picUsd = (f?.sequences || []).reduce((t, s) => t + (pics?.byTag?.[`film:${s.id}`]?.usd || 0), 0)
  const picCount = (f?.sequences || []).reduce((t, s) => t + (pics?.byTag?.[`film:${s.id}`]?.pictures || 0), 0)

  // each sequence's completion, from the story tree (shots: written → filmed → finished)
  const seqStats = new Map()
  for (const a of tree?.acts || []) {
    for (const s of a.sequences) {
      const shots = s.scenes.flatMap((sc) => sc.shots)
      seqStats.set(s.id, {
        shots: shots.length,
        filmed: shots.filter((x) => x.status !== 'written').length,
        finished: shots.filter((x) => x.status === 'finished').length,
        hasCut: !!s.editId
      })
    }
  }
  const left = Math.max(0, stats.total.shots - stats.total.filmed)
  const estTotal = costOf(left)
  const actsOf = (actId) => f.sequences.filter((s) => s.actId === actId).sort((a, b) => a.order - b.order)

  // the schedule (the Gantt): the production window, each act's planned slice of it (by its minutes), and
  // how much of the act is actually finished. Dates are the film's own (startDate / deadline), editable here.
  const DAY_MS = 24 * 3600 * 1000
  const isoDay = (t) => {
    const d = new Date(t)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }
  const fmt = (t) => new Date(t).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
  const startMs = Date.parse(f.startDate || '') || Date.parse(f.createdAt || '') || Date.now()
  // no deadline yet: a day per finished minute is the placeholder plan, until the director sets a real one
  const endMs = Math.max(startMs + DAY_MS, Date.parse(f.deadline || '') || startMs + Math.max(14, Math.round(f.targetMinutes || 14)) * DAY_MS)
  const nowMs = Date.now()
  const totalMin = stats.acts.reduce((s, a) => s + (a.minutes || 0), 0) || stats.acts.length || 1
  let cursor = startMs
  const gantt = stats.acts.map((a) => {
    const from = cursor
    cursor += ((a.minutes || 1) / totalMin) * (endMs - startMs)
    const done = a.shots ? a.finished / a.shots : 0
    const expected = Math.min(1, Math.max(0, (nowMs - from) / (cursor - from)))
    return { a, from, to: cursor, done, behind: nowMs > from && done < 1 && done + 0.15 < expected }
  })
  const todayPct = Math.min(100, Math.max(0, ((nowMs - startMs) / (endMs - startMs)) * 100))
  const saveDate = (k, v) => F().update(id, { [k]: v || null }).catch((e) => notify(e.message))
  const maxDay = days ? Math.max(0, ...days.map((d) => d.usd)) : 0

  // render statistics and velocity (features:dashStats): how long renders take, and how fast shots finish
  const fmtDur = (s) => (s >= 3600 ? `${(s / 3600).toFixed(1)} h` : s >= 60 ? `${Math.round(s / 60)} min` : `${Math.round(s)} s`)
  const velDays = (() => {
    const out = []
    for (let i = 13; i >= 0; i--) {
      const day = isoDay(nowMs - i * DAY_MS)
      out.push({ day, n: deep?.renders?.finishedDays?.[day] || 0 })
    }
    return out
  })()
  const velMax = Math.max(0, ...velDays.map((d) => d.n))
  const velAvg = velDays.reduce((t, d) => t + d.n, 0) / 14
  const leftToFilm = Math.max(0, stats.total.shots - stats.total.finished)
  const etaMs = velAvg > 0 ? nowMs + (leftToFilm / velAvg) * DAY_MS : null
  const deadlineMs = Date.parse(f.deadline || '') || null
  const seqTree = (seqId) => (tree?.acts || []).flatMap((a) => a.sequences).find((x) => x.id === seqId)

  return (
    <div className="project feature mdash">
      <button className="link-btn mono" onClick={back}>
        ← Back to the film
      </button>
      <h1 className="mdash-title">{f.name}</h1>
      <p className="small dim">
        Director's dashboard · {f.targetMinutes} min · {f.aspect} · {f.acts.length} acts · {f.sequences.length} sequences
        {dash && (dash.pod ? ` · GPU on at ${inr(Number(dash.pod.perHour))}/h` : ' · GPU off')}
      </p>

      <p className="mono label">The timeline</p>
      <div className="mdash-timeline">
        {stats.acts.map((a) => {
          const fill = a.minutes ? Math.min(100, (a.seconds / 60 / a.minutes) * 100) : 0
          return (
            <div key={a.id} className="mdash-act" style={{ flexGrow: Math.max(1, a.minutes || 1) }}>
              <div className="mdash-act-head mono small">
                <span className="mdash-act-name">{a.title}</span>
                <span className="dim">
                  {Math.round(a.seconds)}s / {a.minutes}m
                </span>
              </div>
              <div className="mdash-act-bar" title={`${a.title}: ${a.finished} of ${a.shots} shots finished — ${Math.round(a.seconds)} s of ${a.minutes} min`}>
                <span style={{ width: `${fill}%` }} />
              </div>
              <div className="mdash-seqs">
                {actsOf(a.id).map((s) => {
                  const st = seqStats.get(s.id) || { shots: 0, filmed: 0, finished: 0, hasCut: false }
                  const pct = st.shots ? (st.finished / st.shots) * 100 : 0
                  return (
                    <div
                      key={s.id}
                      className={`mdash-seq ${st.shots === 0 ? 'empty' : ''} ${st.hasCut ? 'cut' : ''}`}
                      title={`${s.order}. ${s.title}\n${st.shots ? `${st.finished} of ${st.shots} shots finished, ${st.filmed} filmed` : 'no shots written yet'}${st.hasCut ? ' · has a cut' : ''}`}
                    >
                      <span className="mdash-seq-fill" style={{ height: `${pct}%` }} />
                      <span className="mdash-seq-n mono">{s.order}</span>
                    </div>
                  )
                })}
                {actsOf(a.id).length === 0 && <span className="small dim">no sequences yet</span>}
              </div>
            </div>
          )
        })}
      </div>
      <p className="small dim mdash-legend">
        Act width = planned minutes · bar = footage finished · block = a sequence in running order, filled by its finished shots · dashed = not written · dot = has a cut
      </p>

      {deep && (
        <>
          <p className="mono label">The pipeline</p>
          <div className="mdash-pipe">
            {[
              ['Shots', deep.pipeline.shots, null],
              ['Sketched', deep.pipeline.sketched, deep.pipeline.shots],
              ['Prompted', deep.pipeline.prompted, deep.pipeline.shots],
              ['Filmed', deep.pipeline.filmed, deep.pipeline.shots],
              ['Finished', deep.pipeline.finished, deep.pipeline.shots]
            ].map(([label, n, of]) => {
              const pct = of ? Math.round((n / of) * 100) : 100
              return (
                <div key={label} className="mdash-stage">
                  <span className="mono small dim">{label}</span>
                  <strong>{n}</strong>
                  <span className="mdash-cell-bar">
                    <span style={{ width: `${pct}%` }} />
                  </span>
                  <span className="small dim">{pct}%</span>
                </div>
              )
            })}
          </div>
          <p className="small dim mdash-legend">how far the shots got: written → a sketch panel → a written prompt → takes filmed → a finished shot</p>
        </>
      )}

      <p className="mono label">The schedule</p>
      <div className="mdash-gantt">
        <div className="mdash-gantt-dates">
          <label className="small dim">
            Start <input type="date" value={f.startDate || isoDay(startMs)} onChange={(e) => saveDate('startDate', e.target.value)} />
          </label>
          <label className="small dim">
            Deadline <input type="date" value={f.deadline || isoDay(endMs)} onChange={(e) => saveDate('deadline', e.target.value)} />
          </label>
          {!f.deadline && <span className="small dim">no deadline set — planning a day per finished minute until you do</span>}
        </div>
        <div className="mdash-gantt-body">
          <span className="mdash-gantt-today" style={{ left: `calc(170px + (100% - 250px) * ${todayPct / 100})` }} title={`Today, ${fmt(nowMs)}`} />
          {gantt.map(({ a, from, to, done, behind }) => (
            <div key={a.id} className="mdash-gantt-row">
              <span className="mdash-gantt-name mono small" title={a.title}>
                {a.title}
              </span>
              <div className="mdash-gantt-track">
                <div
                  className="mdash-gantt-plan"
                  style={{ left: `${((from - startMs) / (endMs - startMs)) * 100}%`, width: `${Math.max(1, ((to - from) / (endMs - startMs)) * 100)}%` }}
                  title={`${a.title}: planned ${fmt(from)} → ${fmt(to)} · ${Math.round(done * 100)}% finished`}
                >
                  <span className="mdash-gantt-done" style={{ width: `${done * 100}%` }} />
                </div>
              </div>
              <span className={`mono small ${behind ? 'mdash-behind' : 'dim'}`}>
                {Math.round(done * 100)}%{behind ? ' · behind' : ''}
              </span>
            </div>
          ))}
        </div>
        <p className="small dim mdash-legend">bar = the act's planned window (acts share the schedule by their minutes) · fill = shots finished · the red line = today · "behind" = less finished than the calendar says it should be</p>
        {deep && (
          <div className="mdash-vel">
            <span className="mono small dim">Velocity</span>
            <div className="mdash-vel-bars">
              {velDays.map((d) => (
                <span key={d.day} className={`mdash-vel-bar ${d.n ? '' : 'empty'}`} style={{ height: `${velMax ? Math.max(8, (d.n / velMax) * 100) : 8}%` }} title={`${d.day}: ${d.n} shot${d.n === 1 ? '' : 's'} finished`} />
              ))}
            </div>
            <span className="small dim">
              {velAvg > 0
                ? `${velAvg.toFixed(1)} shots finished a day, last two weeks · ${leftToFilm} left → done around ${fmt(etaMs)}${
                    deadlineMs ? (etaMs <= deadlineMs ? ` · ${Math.round((deadlineMs - etaMs) / DAY_MS)} days ahead of the deadline` : ` · ${Math.round((etaMs - deadlineMs) / DAY_MS)} days past the deadline`) : ''
                  }`
                : 'no shots finished in the last two weeks — the ETA appears once finishes land'}
            </span>
          </div>
        )}
      </div>

      <p className="mono label">The cost</p>
      <div className="mdash-cards">
        <div className="mdash-card">
          <span className="mono small dim">Spent today</span>
          <strong>{dash ? inr(dash.today) : '—'}</strong>
          <span className="small dim">{dash ? `${dash.budget.on ? `of ${inr(dash.budget.daily)}` : 'no daily budget'}` : ''}</span>
          {dash?.budget.on && (
            <span className="cloud-dash-bar">
              <span style={{ width: `${Math.min(100, (dash.today / dash.budget.daily) * 100)}%` }} className={dash.today >= dash.budget.daily ? 'over' : ''} />
            </span>
          )}
        </div>
        <div className="mdash-card">
          <span className="mono small dim">GPU rate</span>
          <strong>{perHour != null ? `${inr(Number(perHour))}/h` : '—'}</strong>
          <span className="small dim">{perHour != null ? (dash?.pod ? 'billed now' : 'your last pod') : 'set up the cloud to see it'}</span>
        </div>
        <div className="mdash-card">
          <span className="mono small dim">Spent filming</span>
          <strong>{spentTotal != null ? inr(spentTotal) : '—'}</strong>
          <span className="small dim">{spentTotal != null ? 'the shots’ actual cloud GPU time' : 'no cloud renders yet'}</span>
        </div>
        <div className="mdash-card">
          <span className="mono small dim">Panels &amp; pictures</span>
          <strong>{picCount ? inr(picUsd) : '—'}</strong>
          <span className="small dim">{picCount ? `${picCount} GPT Image picture${picCount === 1 ? '' : 's'}, at OpenAI's list price` : 'no GPT Image panels yet'}</span>
        </div>
        <div className="mdash-card">
          <span className="mono small dim">To finish filming</span>
          <strong>{estTotal != null ? inr(estTotal) : '—'}</strong>
          <span className="small dim">
            {left > 0 ? `${left} shot${left === 1 ? '' : 's'} × ~${GPU_MIN_PER_SHOT} GPU min ≈ ${Math.round(left * GPU_MIN_PER_SHOT)} min` : 'every shot is filmed'}
          </span>
        </div>
        <div className="mdash-card">
          <span className="mono small dim">The film</span>
          <strong>{stats.percent}%</strong>
          <span className="small dim">
            {Math.round(stats.footageSeconds)} s of {f.targetMinutes * 60} s filmed · {stats.total.finished}/{stats.total.shots} shots finished
          </span>
        </div>
        {deep && (
          <>
            <div className="mdash-card">
              <span className="mono small dim">Renders</span>
              <strong>{deep.renders.jobs}</strong>
              <span className="small dim">
                {deep.renders.previews} hunts · {deep.renders.finishes} finishes{deep.renders.failed ? ` · ${deep.renders.failed} failed` : ''}
              </span>
            </div>
            <div className="mdash-card">
              <span className="mono small dim">GPU time</span>
              <strong>{fmtDur(deep.renders.seconds)}</strong>
              <span className="small dim">
                {deep.renders.cloudSeconds ? `${fmtDur(deep.renders.cloudSeconds)} cloud` : ''}
                {deep.renders.cloudSeconds && deep.renders.localSeconds ? ' · ' : ''}
                {deep.renders.localSeconds ? `${fmtDur(deep.renders.localSeconds)} this PC` : ''}
                {!deep.renders.seconds ? 'no renders yet' : ''}
              </span>
            </div>
            <div className="mdash-card">
              <span className="mono small dim">Avg per finished shot</span>
              <strong>{deep.pipeline.finished ? fmtDur(deep.renders.seconds / deep.pipeline.finished) : '—'}</strong>
              <span className="small dim">render time, hunts and finishes together</span>
            </div>
            <div className="mdash-card">
              <span className="mono small dim">Per finished minute</span>
              <strong>{spentTotal != null && stats.footageSeconds > 0 ? inr(spentTotal / (stats.footageSeconds / 60)) : '—'}</strong>
              <span className="small dim">the actual cloud cost of one minute of film</span>
            </div>
            <div className="mdash-card">
              <span className="mono small dim">Projected total</span>
              <strong>{spentTotal != null && estTotal != null ? inr(spentTotal + estTotal) : '—'}</strong>
              <span className="small dim">spent filming + what&apos;s left to film</span>
            </div>
          </>
        )}
      </div>

      {days && days.some((d) => d.usd > 0) && (
        <>
          <p className="mono label">Cloud spend by day</p>
          <div className="mdash-days">
            {days.map((d, i) => (
              <div key={i} className="mdash-day" title={`${d.label}: ${inr(d.usd)}`}>
                <span className="mdash-day-track">
                  <span className="mdash-day-bar" style={{ height: `${maxDay ? (d.usd / maxDay) * 100 : 0}%` }} />
                </span>
                <span className="mdash-day-lbl mono dim">{d.tick}</span>
              </div>
            ))}
          </div>
          <p className="small dim mdash-legend">the last two weeks of GPU spend, from the app's own ledger · hover a bar for the day's cost</p>
        </>
      )}

      <p className="mono label">Analytics by act</p>      <table className="mdash-table">
        <thead>
          <tr className="mono small dim">
            <th>Act</th>
            <th>Sequences</th>
            <th>Shots</th>
            <th>Filmed</th>
            <th>Finished</th>
            <th>Footage</th>
            <th>Planned</th>
            <th>Progress</th>
            <th>Spent</th>
            <th>Cost left</th>
          </tr>
        </thead>
        <tbody>
          {stats.acts.map((a) => {
            const cost = costOf(Math.max(0, a.shots - a.filmed))
            const spent = spentOf(shotsOf(tree?.acts.find((x) => x.id === a.id)))
            const pct = a.shots ? Math.round((a.finished / a.shots) * 100) : 0
            return (
              <tr key={a.id} className="small">
                <td>{a.title}</td>
                <td>{a.sequences}</td>
                <td>{a.shots}</td>
                <td>{a.filmed}</td>
                <td>{a.finished}</td>
                <td>{Math.round(a.seconds)} s</td>
                <td>{a.minutes} min</td>
                <td>
                  <span className="mdash-cell-bar">
                    <span style={{ width: `${pct}%` }} />
                  </span>{' '}
                  <span className="dim">{pct}%</span>
                </td>
                <td>{spent != null ? inr(spent) : '—'}</td>
                <td>{cost != null && a.shots - a.filmed > 0 ? inr(cost) : '—'}</td>
              </tr>
            )
          })}
          <tr className="small mdash-total">
            <td>The film</td>
            <td>{f.sequences.length}</td>
            <td>{stats.total.shots}</td>
            <td>{stats.total.filmed}</td>
            <td>{stats.total.finished}</td>
            <td>{Math.round(stats.total.seconds)} s</td>
            <td>{f.targetMinutes} min</td>
            <td>{stats.percent}%</td>
            <td>{spentTotal != null ? inr(spentTotal) : '—'}</td>
            <td>{estTotal != null && left > 0 ? inr(estTotal) : '—'}</td>
          </tr>
        </tbody>
      </table>

      {deep && deep.sequences.length > 0 && (
        <>
          <p className="mono label">Analytics by sequence</p>
          <table className="mdash-table">
            <thead>
              <tr className="mono small dim">
                <th>#</th>
                <th>Sequence</th>
                <th>Act</th>
                <th>Shots</th>
                <th>Filmed</th>
                <th>Finished</th>
                <th>Footage</th>
                <th>Progress</th>
                <th>Spent</th>
              </tr>
            </thead>
            <tbody>
              {deep.sequences.map((s) => {
                const pct = s.shots ? Math.round((s.finished / s.shots) * 100) : 0
                const act = stats.acts.find((a) => a.id === s.actId)
                const t = seqTree(s.id)
                const spent = t ? spentOf(t.scenes.flatMap((sc) => sc.shots)) : null
                return (
                  <tr key={s.id} className="small">
                    <td className="dim">{s.order}</td>
                    <td>{s.title}</td>
                    <td className="dim">{act?.title || '—'}</td>
                    <td>{s.shots}</td>
                    <td>{s.filmed}</td>
                    <td>{s.finished}</td>
                    <td>{Math.round(s.seconds)} s</td>
                    <td>
                      <span className="mdash-cell-bar">
                        <span style={{ width: `${pct}%` }} />
                      </span>{' '}
                      <span className="dim">{pct}%</span>
                    </td>
                    <td>{spent != null ? inr(spent) : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </>
      )}

      <p className="small dim">
        Production: {f.cast?.length || 0} characters · {f.songs?.length || 0} songs · trailer {f.trailerId ? 'started' : 'not started'} · master cut {f.editId ? 'assembled' : 'not yet'}
        {dash ? ` · rupees at ${rate} per $1 (Cloud page)` : ''}
      </p>
    </div>
  )
}
