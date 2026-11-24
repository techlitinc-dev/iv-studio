import { useEffect, useState } from 'react'
import { ask } from './Confirm'
import MovieDashboard from './MovieDashboard'

// Feature films (feature.js): a long film in acts, made from sequences (ordinary Projects), with a trailer
// (a Sizzle promo, made from the web first) and songs (Music). This page is the long-form control room: shape
// the acts, add sequences, write every script and shot automatically, watch progress, assemble the master cut.
const F = () => window.ivstudio.features

function Field({ label, children }) {
  return (
    <label className="feat-field">
      <span className="mono small dim">{label}</span>
      {children}
    </label>
  )
}

// The director's desk: the film's numbers and what it costs — today's cloud spend against the budget and a
// rough cost to finish the filming, in dollars and rupees (the rate set on the Cloud page; RunPod's own pod
// rate when one is up).
function DirectorsDesk({ f, stats, dash }) {
  const rate = dash.rate || 11.5
  const inr = (v) => `₹${(v * rate).toFixed(2)}`
  const perHour = dash.pod?.perHour ?? dash.gpuPerHour ?? null
  const left = Math.max(0, stats.total.shots - stats.total.filmed)
  const estMin = left * 4 // Techlit Studio's own rule of thumb: a 10 s 2 MP shot takes roughly 3–5 GPU minutes
  const estUsd = perHour != null ? (estMin / 60) * perHour : null
  return (
    <div className="feat-desk">
      <p className="mono small dim">Director's desk</p>
      <p className="small">
        {stats.total.finished} of {stats.total.shots} shots finished · {Math.round(stats.footageSeconds)} s of {f.targetMinutes * 60} s filmed
        {left > 0 ? ` · ${left} shot${left === 1 ? '' : 's'} to film` : ' · filming done'}
      </p>
      <p className="small">
        Cloud today: ${dash.today.toFixed(2)} ({inr(dash.today)})
        {dash.budget.on ? ` of $${dash.budget.daily.toFixed(2)} (${inr(dash.budget.daily)}) budget` : ''}
        {dash.pod ? ` · GPU on at $${Number(dash.pod.perHour).toFixed(2)}/h (${inr(Number(dash.pod.perHour))}/h)` : ' · GPU off'}
      </p>
      {estUsd != null && left > 0 && (
        <p className="small dim">
          Rough cost to finish filming: {left} × ~4 GPU min ≈ {Math.round(estMin)} min ≈ ${estUsd.toFixed(2)} ({inr(estUsd)}){dash.pod ? '' : ' at your GPU rate'}
          {dash.budget.on && estUsd > Math.max(0, dash.budget.daily - dash.today) ? ' — more than today’s budget has left; expect it over a few days.' : ''}
        </p>
      )}
    </div>
  )
}

export default function Features({ notify, openSizzle, openEdit, openStoryMap }) {
  const [items, setItems] = useState(null)
  const [openId, setOpenId] = useState(null)
  const [dashId, setDashId] = useState(null) // the film whose movie dashboard is open
  const [making, setMaking] = useState(false)
  const [form, setForm] = useState({ name: '', logline: '', targetMinutes: 120, aspect: '16:9' })
  const reload = () => F().list().then(setItems, (e) => notify(e.message))
  useEffect(() => {
    reload()
    return F().onChanged(() => reload())
  }, [])
  async function create() {
    setMaking(true)
    try {
      const f = await F().create({ ...form, name: form.name.trim() || 'Untitled feature', targetMinutes: Number(form.targetMinutes) || 120 })
      setForm({ name: '', logline: '', targetMinutes: 120, aspect: '16:9' })
      setOpenId(f.id)
    } catch (e) {
      notify(e.message)
    } finally {
      setMaking(false)
    }
  }
  async function remove(id, name) {
    if (!(await ask({ title: `Delete the feature “${name}”?`, message: 'Its sequences stay in Projects; only the feature, its acts and the assembly link go.', confirm: 'Delete it' }))) return
    try {
      await F().delete(id)
      if (openId === id) setOpenId(null)
      reload()
    } catch (e) {
      notify(e.message)
    }
  }
  if (dashId) return <MovieDashboard id={dashId} back={() => setDashId(null)} notify={notify} />
  if (openId) return <FeatureDetail id={openId} back={() => setOpenId(null)} notify={notify} openSizzle={openSizzle} openEdit={openEdit} openStoryMap={openStoryMap} openDashboard={() => setDashId(openId)} />

  return (
    <div className="projects shelf-page features">
      <header className="shelf-head">
        <p className="mono label">Features</p>
        <h1>Feature films</h1>
        <p className="lede">
          <span className="lede-small dim">A long film in acts. Each act is told by sequences — ordinary Projects with a script, shots and a rough cut — assembled into one master cut, with a trailer and songs alongside.</span>
        </p>
      </header>
      <div className="shelf-tools">
        <div className="feat-new">
          <Field label="Title">
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="The long way north" />
          </Field>
          <Field label="What happens">
            <input value={form.logline} onChange={(e) => setForm({ ...form, logline: e.target.value })} placeholder="One line: who wants what, and what stands in the way" />
          </Field>
          <Field label="Minutes">
            <input type="number" min="2" max="480" value={form.targetMinutes} onChange={(e) => setForm({ ...form, targetMinutes: e.target.value })} />
          </Field>
          <Field label="Shape">
            <select value={form.aspect} onChange={(e) => setForm({ ...form, aspect: e.target.value })}>
              <option value="16:9">16:9 widescreen</option>
              <option value="9:16">9:16 portrait</option>
              <option value="1:1">1:1 square</option>
              <option value="4:3">4:3 standard</option>
            </select>
          </Field>
          <button className="btn btn-primary" disabled={making} onClick={create}>
            {making ? 'Starting…' : 'Start a feature'}
          </button>
        </div>
      </div>
      {items?.length > 0 && (
        <div className="proj-grid">
          {items.map((f) => (
            <div key={f.id} className="proj-card" role="button" tabIndex={0} onClick={() => setOpenId(f.id)} onKeyDown={(e) => e.key === 'Enter' && setOpenId(f.id)}>
              <div className="proj-card-cover">
                <span className="mono small dim">{f.aspect}</span>
              </div>
              <span className="proj-card-name">{f.name}</span>
              {f.logline && <span className="small dim proj-card-logline">{f.logline}</span>}
              <span className="proj-card-foot mono small">
                <span className="dim">
                  {f.targetMinutes} min · {f.acts} acts · {f.sequences} sequences
                </span>
                <button
                  className="link-btn mono small proj-card-x"
                  aria-label={`Delete the feature ${f.name}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    remove(f.id, f.name)
                  }}
                >
                  delete
                </button>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function FeatureDetail({ id, back, notify, openSizzle, openEdit, openStoryMap, openDashboard }) {
  const [f, setF] = useState(null)
  const [stats, setStats] = useState(null)
  const [dash, setDash] = useState(null) // the cloud dashboard's numbers: today's spend, budget, GPU rate, ₹ rate
  const [prods, setProds] = useState([])
  const [songs, setSongs] = useState([])
  const [busy, setBusy] = useState('')
  const [acts, setActs] = useState(null)
  const [seqForm, setSeqForm] = useState({}) // actId -> {title, logline, minutes}
  const [trailerUrl, setTrailerUrl] = useState('')
  const [songForm, setSongForm] = useState({ caption: '', lyrics: '' })
  const load = () => {
    F().get(id).then((x) => {
      setF(x)
      setActs(x.acts.map((a) => ({ ...a })))
    }, (e) => notify(e.message))
    F().stats(id).then(setStats, () => setStats(null))
    window.ivstudio.cloud.dash().then(setDash, () => setDash(null))
    window.ivstudio.productions.list().then(setProds, () => {})
    window.ivstudio.music.list().then(setSongs, () => {})
  }
  useEffect(() => {
    load()
    return F().onChanged(() => load())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])
  if (!f || !acts) return null
  const act = (fn) => fn().then(load, (e) => notify(e.message))
  const save = (patch) => act(() => F().update(id, patch))
  const seqOf = (actId) => f.sequences.filter((s) => s.actId === actId).sort((a, b) => a.order - b.order)
  async function addSequence(actId) {
    const form = seqForm[actId] || {}
    const minutes = Math.max(1, Number(form.minutes) || 3)
    setBusy('sequence')
    try {
      const title = form.title?.trim() || `Sequence ${f.sequences.length + 1}`
      const p = await window.ivstudio.productions.create({ name: `${f.name} · ${title}`, aspect: f.aspect, targetSeconds: minutes * 60, logline: form.logline || '' })
      await F().attach(id, p.id, { actId, title, logline: form.logline || '' })
      setSeqForm({ ...seqForm, [actId]: {} })
    } catch (e) {
      notify(e.message)
    } finally {
      setBusy('')
    }
  }
  async function attachExisting(actId, productionId) {
    if (!productionId) return
    try {
      await F().attach(id, productionId, { actId })
    } catch (e) {
      notify(e.message)
    }
  }
  async function writeAll() {
    setBusy('auto')
    try {
      const r = await F().auto(id, {})
      const failed = r.errors.map((e) => `“${e.title}”: ${e.error}`).join(' · ')
      const nothing = !r.scripted && !r.broken && !r.running && !r.errors.length
      notify(nothing ? 'Every sequence already has its script and shots — open one in Projects to change it.' : `Started ${r.scripted} scripts and ${r.broken} breakdowns${r.running ? `; ${r.running} already being written` : ''}${failed ? `; failed — ${failed}` : ''}.`)
      load()
    } catch (e) {
      notify(e.message)
    } finally {
      setBusy('')
    }
  }
  // The AI plans everything from the story: acts, sequences (created as Projects), and the cast —
  // then writes every script, shot and prompt. From a story to a complete, filmable plan in two clicks.
  async function planEverything() {
    if (!f.story.trim() && !(await ask({ title: 'The story is empty', message: 'The AI writes the acts, sequences and cast from the Story field. With only the logline to go on, the plan will be thin — write the story first for a real film. Plan from the logline anyway?', confirm: 'Plan from the logline' }))) return
    if (f.sequences.length && !(await ask({ title: 'Re-plan this feature?', message: 'The AI writes the acts, sequences and cast again from the story. Existing sequences stay in Projects but leave the feature.', confirm: 'Re-plan it' }))) return
    setBusy('plan')
    try {
      const r = await F().planAll(id, { redo: f.sequences.length > 0 })
      notify(`Planned: ${r.acts} acts, ${r.sequences} sequences, ${r.characters} characters. Writing every script and shot now…`)
      const w = await F().auto(id, {})
      notify(`Writing started: ${w.scripted} scripts, ${w.broken} breakdowns${w.running ? `, ${w.running} already being written` : ''}${w.errors.length ? `, failed — ${w.errors.map((e) => `“${e.title}”: ${e.error}`).join(' · ')}` : ''}.`)
      load()
    } catch (e) {
      notify(e.message)
    } finally {
      setBusy('')
    }
  }
  async function writeOne(sequenceId) {
    setBusy(`write:${sequenceId}`)
    try {
      const r = await F().auto(id, { sequence: sequenceId })
      notify(r.errors.length ? `Couldn't write “${r.errors[0].title}”: ${r.errors[0].error}` : 'Its script and shots are being written — open the sequence in Projects to read them.')
      load()
    } catch (e) {
      notify(e.message)
    } finally {
      setBusy('')
    }
  }
  async function assemble() {
    setBusy('cut')
    try {
      const r = await F().masterCut(id)
      notify(r.placed ? `Assembly: ${r.placed} clips, ${Math.round(r.seconds)} s${r.missing.length ? `, ${r.missing.length} sequence(s) without a cut` : ''}.` : 'No sequence has a cut yet — film some shots first.')
      if (r.placed) openEdit(r.editId)
    } catch (e) {
      notify(e.message)
    } finally {
      setBusy('')
    }
  }
  async function makeTrailer() {
    if (!trailerUrl.trim()) return notify('Give the address the trailer starts from: the film’s page, or any site with its art.')
    setBusy('trailer')
    try {
      const s = await window.ivstudio.sizzle.create({ url: trailerUrl.trim(), name: `${f.name} · trailer`, format: f.aspect })
      await F().update(id, { trailerId: s.id })
      notify('Trailer started — a plan comes next, made from the web page first.')
      openSizzle(s.id)
    } catch (e) {
      notify(e.message)
    } finally {
      setBusy('')
    }
  }
  async function makeSong() {
    if (!songForm.caption.trim()) return notify('Describe the music first: genre, mood, instruments, voice, tempo.')
    setBusy('song')
    try {
      const s = await window.ivstudio.music.create({ caption: songForm.caption.trim(), lyrics: songForm.lyrics.trim() })
      await F().addSong(id, s.id)
      setSongForm({ caption: '', lyrics: '' })
    } catch (e) {
      notify(e.message)
    } finally {
      setBusy('')
    }
  }
  return (
    <div className="project feature" key={f.id}>
      <button className="link-btn mono" onClick={back}>
        ← All features
      </button>
      <input className="shot-name hero-title-input" value={f.name} aria-label="Feature title" onChange={(e) => setF({ ...f, name: e.target.value })} onBlur={(e) => save({ name: e.target.value.trim() || 'Untitled feature' })} />
      <p className="small dim">
        {f.targetMinutes} minutes · {f.aspect} · {f.acts.length} acts · {f.sequences.length} sequences
        {stats ? ` · ${Math.round(stats.footageSeconds)} s filmed (${stats.percent}%)` : ''}
      </p>
      {stats && stats.total.shots > 0 && (
        <div className="feat-rollup" aria-label="Progress by act">
          {stats.acts.map((a) => (
            <div key={a.id} className="feat-rollup-act" title={`${a.title}: ${a.finished} of ${a.shots} shots finished, ${a.filmed} filmed · ${Math.round(a.seconds)} s filmed of ${a.minutes} min planned`}>
              <span className="feat-rollup-name mono small">{a.title}</span>
              <span className="feat-rollup-bar">
                <span style={{ width: `${a.shots ? Math.min(100, (a.finished / a.shots) * 100) : 0}%` }} />
              </span>
              <span className="mono small dim">
                {a.finished}/{a.shots} shots · {Math.round(a.seconds)}s / {a.minutes}m
              </span>
            </div>
          ))}
          <div className="feat-rollup-act total" title="Finished footage against the film's target length">
            <span className="feat-rollup-name mono small">The film</span>
            <span className="feat-rollup-bar">
              <span style={{ width: `${stats.percent}%` }} />
            </span>
            <span className="mono small dim">
              {stats.percent}% of {f.targetMinutes} min{stats.total.shots - stats.total.filmed > 0 ? ` · ${stats.total.shots - stats.total.filmed} shots left to film` : ' · every shot filmed'}
            </span>
          </div>
        </div>
      )}
      {stats && stats.total.shots > 0 && dash && <DirectorsDesk f={f} stats={stats} dash={dash} />}
      <div className="feat-actions">
        <button className="btn btn-primary" disabled={!!busy} onClick={planEverything} title="The AI writes the acts, sequences and cast from your story, then every script, scene, shot and prompt. Two clicks from story to a filmable plan.">
          {busy === 'plan' ? 'Planning…' : f.sequences.length ? 'Re-plan everything' : 'Plan everything'}
        </button>
        <button className="btn" disabled={!!busy} onClick={writeAll} title="Every sequence without a script gets one written from its logline and the story; every scene is broken into shots, each with its H3 prompt. Writing only — rendering is always your call, shot by shot.">
          {busy === 'auto' ? 'Writing…' : 'Write scripts & shots'}
        </button>
        <button className="btn" disabled={!!busy} onClick={assemble}>
          {busy === 'cut' ? 'Assembling…' : 'Master cut'}
        </button>
        <button className="btn" disabled={!!busy} onClick={() => openStoryMap('feature', f.id)} title="The whole story as a mindmap: acts, sequences, scenes and shots, coloured by what is written, filmed and finished">
          Story explorer
        </button>
        <button className="btn" onClick={openDashboard} title="The movie dashboard: the timeline, the costs in dollars and rupees, and the analytics by act">
          Dashboard
        </button>
      </div>
      <div className="feat-cols">
        <section className="feat-main">
          <Field label="Logline">
            <input value={f.logline} onChange={(e) => setF({ ...f, logline: e.target.value })} onBlur={(e) => save({ logline: e.target.value })} />
          </Field>
          {f.cast?.length > 0 && (
            <div className="feat-cast">
              <p className="mono small dim">The cast — written by the AI from your story</p>
              {f.cast.map((c) => (
                <p key={c.name} className="small">
                  <strong>{c.name}</strong> <span className="dim">— {c.who}</span>
                </p>
              ))}
            </div>
          )}
          <Field label="Story — the treatment every sequence's script is written from">
            <textarea rows={5} value={f.story} onChange={(e) => setF({ ...f, story: e.target.value })} onBlur={(e) => save({ story: e.target.value })} placeholder="What happens in the film, act by act. Each sequence's script is written from its own logline plus this story." />
          </Field>
          {acts.map((a, i) => (
            <div key={a.id} className="feat-act">
              <div className="feat-act-head">
                <input className="feat-act-title" value={a.title} aria-label={`Act ${i + 1} title`} onChange={(e) => setActs(acts.map((x) => (x.id === a.id ? { ...x, title: e.target.value } : x)))} onBlur={() => act(() => F().setActs(id, acts))} />
                <input className="feat-act-min" type="number" min="1" value={a.minutes} aria-label={`Act ${i + 1} minutes`} onChange={(e) => setActs(acts.map((x) => (x.id === a.id ? { ...x, minutes: e.target.value } : x)))} onBlur={() => act(() => F().setActs(id, acts))} />
                <span className="mono small dim">min</span>
                {acts.length > 1 && (
                  <button className="link-btn mono small" onClick={() => act(() => F().setActs(id, acts.filter((x) => x.id !== a.id)))}>
                    remove
                  </button>
                )}
              </div>
              {seqOf(a.id).map((s) => (
                <div key={s.id} className="feat-seq">
                  <span className="feat-seq-title">{s.order}. {s.title}</span>
                  {s.logline && <span className="small dim">{s.logline}</span>}
                  <button className="link-btn mono small" disabled={!!busy} title="Write only this sequence's script and shots" onClick={() => writeOne(s.id)}>
                    {busy === `write:${s.id}` ? 'Writing…' : 'Write'}
                  </button>
                  <button className="link-btn mono small" onClick={() => act(() => F().detach(id, s.id))}>
                    remove
                  </button>
                </div>
              ))}
              <div className="feat-seq-add">
                <input placeholder={`Sequence ${seqOf(a.id).length + 1} — what happens`} value={seqForm[a.id]?.title || ''} onChange={(e) => setSeqForm({ ...seqForm, [a.id]: { ...(seqForm[a.id] || {}), title: e.target.value } })} />
                <input placeholder="Its logline (one line)" value={seqForm[a.id]?.logline || ''} onChange={(e) => setSeqForm({ ...seqForm, [a.id]: { ...(seqForm[a.id] || {}), logline: e.target.value } })} />
                <input className="feat-act-min" type="number" min="1" placeholder="min" value={seqForm[a.id]?.minutes || ''} onChange={(e) => setSeqForm({ ...seqForm, [a.id]: { ...(seqForm[a.id] || {}), minutes: e.target.value } })} />
                <button className="btn btn-small" disabled={busy === 'sequence'} onClick={() => addSequence(a.id)}>
                  Add
                </button>
              </div>
              <select className="feat-attach" value="" onChange={(e) => attachExisting(a.id, e.target.value)} aria-label="Attach an existing project">
                <option value="">Attach an existing project…</option>
                {prods
                  .filter((p) => !f.sequences.some((s) => s.id === p.id))
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </select>
            </div>
          ))}
          <button className="link-btn mono small" onClick={() => act(() => F().setActs(id, [...acts, { title: `Act ${acts.length + 1}`, minutes: 10 }]))}>
            + Add an act
          </button>
        </section>
        <aside className="feat-side">
          <p className="mono label">Trailer</p>
          <p className="small dim">A promo cut from a web page and the feature’s footage, made first.</p>
          {f.trailerId ? (
            <p className="small">
              Trailer in the works.{' '}
              <button className="link-btn mono small" onClick={() => openSizzle(f.trailerId)}>
                Open it
              </button>{' '}
              <button className="link-btn mono small" onClick={() => save({ trailerId: null })}>
                unlink
              </button>
            </p>
          ) : (
            <div className="feat-trailer-add">
              <input placeholder="https://… the page the trailer starts from" value={trailerUrl} onChange={(e) => setTrailerUrl(e.target.value)} />
              <button className="btn btn-small" disabled={busy === 'trailer'} onClick={makeTrailer}>
                {busy === 'trailer' ? 'Starting…' : 'Make the trailer'}
              </button>
            </div>
          )}
          <p className="mono label">Songs</p>
          {f.songs.map((sid) => {
            const s = songs.find((x) => x.id === sid)
            return (
              <div key={sid} className="feat-seq">
                <span className="feat-seq-title">{s?.name || sid}</span>
                <button className="link-btn mono small" onClick={() => act(() => F().removeSong(id, sid))}>
                  remove
                </button>
              </div>
            )
          })}
          <div className="feat-trailer-add">
            <input placeholder="The song: genre, mood, instruments, voice, tempo" value={songForm.caption} onChange={(e) => setSongForm({ ...songForm, caption: e.target.value })} />
            <textarea rows={2} placeholder="Lyrics (optional)" value={songForm.lyrics} onChange={(e) => setSongForm({ ...songForm, lyrics: e.target.value })} />
            <button className="btn btn-small" disabled={busy === 'song'} onClick={makeSong}>
              {busy === 'song' ? 'Writing…' : 'Write a song'}
            </button>
          </div>
          {stats && (
            <>
              <p className="mono label">Progress</p>
              {stats.acts.map((a) => (
                <p key={a.id} className="small dim">
                  {a.title}: {a.finished}/{a.shots} shots · {Math.round(a.seconds)} s
                </p>
              ))}
            </>
          )}
        </aside>
      </div>
    </div>
  )
}
