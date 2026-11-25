import { useEffect, useMemo, useRef, useState } from 'react'
import { media } from '../media'
import Hero from './Hero'
import RecordLine from './RecordLine'
import { LoraPicker, loraTitle } from './Loras'
import { STATE_NAME } from '../../../service/shotstatus'
import { ANGLES, cameraText, cleanCamera, MOVEMENTS, PACES, SHOT_SIZES } from '../../../service/camera'
import { MAX_BEATS } from '../../../service/beats'
import { directionRequest } from '../../../service/direction'

// The Director: a Premiere-style page to direct each shot visually and hand it to Create to render.
// Left: the shot bin (your shots, with their labels and states). Middle: the preview (the shot's newest
// video, playhead-synced). Right: the inspector (prompt, camera, the selected beat or audio clip, cast,
// LoRAs, pre-flight). Bottom, with the room it needs: the timeline —
//   V1  the shot's beats as blocks: drag to retime, pull an edge to stretch, click to edit
//   A1  dialogue (the first clip is what the render lip-syncs to), A2 music, A3 sound — the audio plan,
//       laid into an Edit after the render ("Assemble in editor")
// The direction saves onto the shot's project record as you work (direction.js), so Create, the Shots
// page and this page all read the same truth. "Open in Create" hands it over request-shaped (editRun).

const TRACKS = [
  ['V1', 'Beats'],
  ['A1', 'Dialogue'],
  ['A2', 'Music'],
  ['A3', 'Sound']
]
const KIND_OF_TRACK = { A1: 'voice', A2: 'music', A3: 'sfx' }
const clamp = (v, a, b) => Math.min(b, Math.max(a, v))
const snap = (v) => Math.round(v * 10) / 10
const clock = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`
const base = (p) => String(p || '').split(/[\\/]/).pop()

export default function Director({ notify, characters = [], editRun, openEdit, go }) {
  const [bin, setBin] = useState(null)
  const [q, setQ] = useState('')
  const [pid, setPid] = useState(null)
  const [dir, setDir] = useState(null)
  const [pre, setPre] = useState([])
  const [sel, setSel] = useState(null) // { t: 'beat' | 'audio', i }
  const [time, setTime] = useState(0)
  const [px, setPx] = useState(28) // timeline zoom, pixels a second
  const [big, setBig] = useState(true) // the timeline gets the room: tall by default
  const [picking, setPicking] = useState(false)
  const [saved, setSaved] = useState('')
  const video = useRef(null)
  const lanes = useRef(null)
  const drag = useRef(null)
  const skipSave = useRef(false)

  useEffect(() => {
    window.ivstudio.projects.list().then(setBin, () => setBin([]))
  }, [])
  const project = useMemo(() => (bin || []).find((p) => p.id === pid) || null, [bin, pid])
  const shots = (bin || []).filter((p) => !q.trim() || `${p.name} ${p.label || ''}`.toLowerCase().includes(q.trim().toLowerCase()))

  // open a shot: its saved direction, or one seeded from its latest run (studio.projectDirection)
  useEffect(() => {
    if (!pid) return setDir(null)
    let live = true
    skipSave.current = true
    window.ivstudio.projects
      .direction(pid)
      .then((d) => {
        if (!live) return
        setSel(null)
        setTime(0)
        setDir(d || { prompt: '', character: 'none', camera: null, beats: [], extraLoras: [], refmods: [], media: [], audioPlan: [], aspect: '16:9', megapixels: 0.9, seconds: 10, seed: 4242, steps: 8 })
      })
      .catch((err) => notify(err.message))
    return () => {
      live = false
    }
  }, [pid])

  const put = (patch) => setDir((d) => ({ ...d, ...patch }))

  // autosave, debounced; the first set after opening isn't a change
  useEffect(() => {
    if (!pid || !dir) return
    if (skipSave.current) return void (skipSave.current = false)
    setSaved('Saving…')
    const t = setTimeout(
      () =>
        window.ivstudio.projects
          .saveDirection(pid, dir)
          .then(() => setSaved('Saved'))
          .catch((err) => (setSaved(''), notify(err.message))),
      600
    )
    return () => clearTimeout(t)
  }, [dir, pid])

  // pre-flight, live (preflight.js): the same checks Create's manifest shows
  useEffect(() => {
    if (!dir) return setPre([])
    const t = setTimeout(() => window.ivstudio.render.preflight(directionRequest(dir)).then(setPre, () => setPre([])), 300)
    return () => clearTimeout(t)
  }, [dir])

  const beats = dir?.beats || []
  const plan = dir?.audioPlan || []
  const seconds = Number(dir?.seconds) || 10
  const duration = Math.max(10, seconds, ...plan.map((c) => c.start + c.length), time)
  const width = Math.ceil(duration * px) + 40

  // ---------- the timeline's dragging: move a block, or pull an edge ----------
  function grab(e, target, mode) {
    e.preventDefault()
    e.stopPropagation()
    drag.current = { target, mode, x: e.clientX, from: { ...target.ref } }
    window.addEventListener('pointermove', onDrag)
    window.addEventListener('pointerup', drop, { once: true })
  }
  function onDrag(e) {
    const g = drag.current
    if (!g) return
    const dt = (e.clientX - g.x) / px
    if (g.target.t === 'beat') {
      const i = g.target.i
      const len = g.from.to - g.from.from
      const next = beats.map((b, j) => {
        if (j !== i) return b
        if (g.mode === 'move') {
          const from = snap(clamp(g.from.from + dt, 0, Math.max(0, seconds - len)))
          return { ...b, from, to: snap(from + len) }
        }
        if (g.mode === 'l') return { ...b, from: snap(clamp(g.from.from + dt, 0, b.to - 0.5)) }
        return { ...b, to: snap(clamp(g.from.to + dt, b.from + 0.5, seconds)) }
      })
      put({ beats: next })
    } else {
      const i = g.target.i
      const next = plan.map((c, j) => {
        if (j !== i) return c
        if (g.mode === 'move') return { ...c, start: snap(clamp(g.from.start + dt, 0, 3600)) }
        if (g.mode === 'r') return { ...c, length: snap(Math.max(0.5, g.from.length + dt)) }
        const d = clamp(dt, -g.from.start, g.from.length - 0.5)
        return { ...c, start: snap(g.from.start + d), length: snap(g.from.length - d) }
      })
      put({ audioPlan: next })
    }
  }
  const drop = () => {
    drag.current = null
    window.removeEventListener('pointermove', onDrag)
  }

  // the ruler: click or drag to move the playhead (and the preview with it)
  function seekFromEvent(e) {
    const r = lanes.current.getBoundingClientRect()
    const t = clamp((e.clientX - r.left + lanes.current.scrollLeft - 92) / px, 0, duration)
    setTime(t)
    if (video.current) video.current.currentTime = t
  }
  const rulerDown = (e) => {
    seekFromEvent(e)
    const move = (ev) => seekFromEvent(ev)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', () => window.removeEventListener('pointermove', move), { once: true })
  }

  // ---------- editing ----------
  const setBeat = (i, patch) => put({ beats: beats.map((b, j) => (j === i ? { ...b, ...patch } : b)) })
  const addBeat = () => {
    const from = Math.min(beats.at(-1)?.to ?? 0, seconds)
    put({ beats: [...beats, { from, to: Math.min(seconds, from + 2), camera: '', action: '' }] })
    setSel({ t: 'beat', i: beats.length })
  }
  const setClip = (i, patch) => put({ audioPlan: plan.map((c, j) => (j === i ? { ...c, ...patch } : c)) })
  function addClip(track, file, name) {
    if (!file) return
    const kind = KIND_OF_TRACK[track]
    const at = Math.round(time * 10) / 10
    put({ audioPlan: [...plan, { kind, file, name: name || base(file), start: track === 'A1' && !plan.some((c) => c.kind === 'voice') ? 0 : at, length: Math.min(30, Math.max(1, seconds - at)) }] })
    setSel({ t: 'audio', i: plan.length })
  }
  async function pickAudio(track) {
    const [file] = await window.ivstudio.files.pick('audio').catch(() => [])
    if (file) addClip(track, file)
  }
  const setCam = (f, v) => put({ camera: cleanCamera({ ...(dir.camera || {}), [f]: v || undefined }) })

  // ---------- the workflow: hand to Create, or assemble the render + audio into an Edit ----------
  function toCreate() {
    if (!project || !dir) return
    editRun({ plan: { request: directionRequest(dir) } }, project)
  }
  async function assemble() {
    try {
      await window.ivstudio.projects.saveDirection(pid, dir)
      openEdit(await window.ivstudio.director.assemble(pid))
    } catch (err) {
      notify(err.message)
    }
  }

  const selBeat = sel?.t === 'beat' ? beats[sel.i] : null
  const selClip = sel?.t === 'audio' ? plan[sel.i] : null

  return (
    <div className={`director ${big ? 'big' : ''}`}>
      <Hero art="create" title="Director" kicker="Direct each shot, then send it to Create" help={false} />

      <div className="director-main">
        {/* the shot bin */}
        <aside className="director-bin">
          <input className="director-search" placeholder="Search shots or labels" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="director-bin-list">
            {bin === null && <p className="dim small">Loading…</p>}
            {bin?.length === 0 && (
              <p className="dim small">
                No shots yet. <button className="link-btn" onClick={() => go('create')}>Make one in Create</button> — it appears here to direct.
              </p>
            )}
            {shots.map((p) => (
              <button key={p.id} className={`director-shot ${p.id === pid ? 'on' : ''}`} onClick={() => setPid(p.id)}>
                <span className="director-shot-name">
                  {p.label && <span className="shelf-label mono">{p.label}</span>}
                  {p.name}
                </span>
                <span className="mono small dim">{STATE_NAME[p.state]}{p.running ? ' ·' : ''}</span>
              </button>
            ))}
          </div>
        </aside>

        {/* the preview */}
        <section className="director-stage">
          {project?.cover ? (
            <video ref={video} key={project.cover} src={media(project.cover)} controls onTimeUpdate={(e) => setTime(e.target.currentTime)} />
          ) : (
            <div className="director-nopreview dim small">{pid ? 'No render yet — direct the shot, open it in Create and hunt. The newest take plays here.' : 'Pick a shot on the left.'}</div>
          )}
          <div className="director-stage-bar mono small dim">
            <span>{clock(time)} / {clock(duration)}</span>
            <span>{saved}</span>
          </div>
        </section>

        {/* the inspector */}
        <aside className="director-inspector">
          {!dir && <p className="dim small">Select a shot to direct it.</p>}
          {dir && (
            <>
              <label className="director-field">
                <span className="mono small dim">Prompt</span>
                <textarea rows={4} value={dir.prompt || ''} onChange={(e) => put({ prompt: e.target.value })} placeholder="What happens, in plain sentences…" />
              </label>
              <div className="director-field">
                <span className="mono small dim">Camera{cameraText(dir.camera) ? ` — ${cameraText(dir.camera)}` : ''}</span>
                <div className="camera-row">
                  {[
                    ['size', 'Size', SHOT_SIZES],
                    ['angle', 'Angle', ANGLES],
                    ['movement', 'Move', MOVEMENTS],
                    ['pace', 'Pace', PACES]
                  ].map(([f, label, list]) => (
                    <select key={f} value={dir.camera?.[f] || ''} aria-label={`Camera ${label}`} disabled={f === 'pace' && (!dir.camera?.movement || dir.camera.movement === 'static')} onChange={(e) => setCam(f, e.target.value)}>
                      <option value="">{label}</option>
                      {Object.entries(list).map(([id, text]) => (
                        <option key={id} value={id}>{text}</option>
                      ))}
                    </select>
                  ))}
                </div>
              </div>
              <div className="director-field director-two">
                <label>
                  <span className="mono small dim">Character</span>
                  <select value={dir.character || 'none'} onChange={(e) => put({ character: e.target.value })}>
                    <option value="none">Nobody</option>
                    {characters.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span className="mono small dim">Length (s)</span>
                  <input type="number" min={1} max={15} value={seconds} onChange={(e) => put({ seconds: clamp(Number(e.target.value) || 10, 1, 15) })} />
                </label>
                <label>
                  <span className="mono small dim">Seed</span>
                  <input type="number" value={dir.seed ?? 4242} onChange={(e) => put({ seed: Math.max(0, Number(e.target.value) || 0) })} />
                </label>
              </div>
              <div className="director-field">
                <span className="mono small dim">LoRAs</span>
                <div className="lora-tray">
                  {(dir.extraLoras || []).map((l, i) => (
                    <span key={l.name} className="director-lora mono small">
                      {loraTitle(l.name)} <input type="range" min={0} max={1.5} step={0.05} value={l.strength} onChange={(e) => put({ extraLoras: dir.extraLoras.map((x, j) => (j === i ? { ...x, strength: Number(e.target.value) } : x)) })} /> {Number(l.strength).toFixed(2)}
                      <button className="lora-chip-x" onClick={() => put({ extraLoras: dir.extraLoras.filter((_, j) => j !== i) })}>×</button>
                    </span>
                  ))}
                  <button className="lora-add" onClick={() => setPicking(true)}>+ LoRA</button>
                </div>
              </div>

              {selBeat && (
                <div className="director-field director-sel">
                  <span className="mono small dim">Beat {sel.i + 1} · {selBeat.from}–{selBeat.to}s</span>
                  <input value={selBeat.camera || ''} placeholder="Camera: wide, slow dolly in…" onChange={(e) => setBeat(sel.i, { camera: e.target.value })} />
                  <input value={selBeat.action || ''} placeholder="Action: she reaches for the string…" onChange={(e) => setBeat(sel.i, { action: e.target.value })} />
                  <input value={selBeat.dialogue || ''} placeholder="Dialogue: the exact line, any language" onChange={(e) => setBeat(sel.i, { dialogue: e.target.value })} />
                  <input value={selBeat.expression || ''} placeholder="Expression and eyeline" onChange={(e) => setBeat(sel.i, { expression: e.target.value })} />
                  <input value={selBeat.lighting || ''} placeholder="Lighting or atmosphere" onChange={(e) => setBeat(sel.i, { lighting: e.target.value })} />
                  <input value={selBeat.sound || ''} placeholder="Sound: rain on tin…" onChange={(e) => setBeat(sel.i, { sound: e.target.value })} />
                  <button className="link-btn mono small danger" onClick={() => (put({ beats: beats.filter((_, j) => j !== sel.i) }), setSel(null))}>Remove beat</button>
                </div>
              )}
              {selClip && (
                <div className="director-field director-sel">
                  <span className="mono small dim">{selClip.name || base(selClip.file)} · {selClip.kind}</span>
                  <div className="director-two">
                    <label>
                      <span className="mono small dim">Start (s)</span>
                      <input type="number" min={0} step={0.1} value={selClip.start} onChange={(e) => setClip(sel.i, { start: Math.max(0, Number(e.target.value) || 0) })} />
                    </label>
                    <label>
                      <span className="mono small dim">Length (s)</span>
                      <input type="number" min={0.5} step={0.1} value={selClip.length} onChange={(e) => setClip(sel.i, { length: Math.max(0.5, Number(e.target.value) || 0.5) })} />
                    </label>
                  </div>
                  <button className="link-btn mono small danger" onClick={() => (put({ audioPlan: plan.filter((_, j) => j !== sel.i) }), setSel(null))}>Remove clip</button>
                </div>
              )}

              {pre.length > 0 && (
                <ul className="manifest-issues small">
                  {pre.map((i, x) => (
                    <li key={x} className={i.level === 'error' ? 'pink' : 'dim'}>{i.text}</li>
                  ))}
                </ul>
              )}
              <div className="director-actions">
                <button className="btn btn-primary" disabled={!project || !dir.prompt?.trim()} onClick={toCreate} title="Everything laid out here, filled into Create — hunt and finish there">
                  Open in Create →
                </button>
                <button className="btn" disabled={!project || !(project.finals > 0 || project.jobCount > 0) || !plan.length} onClick={assemble} title="The newest render plus the music and sound clips, laid on an Edit's timeline at their offsets">
                  Assemble in editor
                </button>
              </div>
            </>
          )}
        </aside>
      </div>

      {/* the timeline — the room it needs */}
      <section className="director-timeline">
        <div className="director-timeline-bar">
          <span className="mono small dim">Timeline · {clock(duration)}</span>
          <div className="director-timeline-tools">
            <button className="btn btn-small" disabled={!dir || beats.length >= MAX_BEATS} onClick={addBeat}>+ Beat</button>
            <label className="mono small dim">
              Zoom
              <input type="range" min={8} max={120} value={px} onChange={(e) => setPx(Number(e.target.value))} />
            </label>
            <button className="btn btn-small" onClick={() => setBig(!big)} title={big ? 'A smaller timeline, more preview' : 'A taller timeline'}>
              {big ? '▾ Smaller' : '▴ Bigger'}
            </button>
          </div>
        </div>
        <div className="director-lanes" ref={lanes}>
          <div className="director-lanes-inner" style={{ width: width + 92 }}>
            <div className="director-ruler" onPointerDown={rulerDown}>
              <span className="director-track-label" />
              {Array.from({ length: Math.ceil(duration / 5) + 1 }, (_, i) => (
                <span key={i} className="director-tick mono" style={{ left: 92 + i * 5 * px }}>
                  {clock(i * 5)}
                </span>
              ))}
            </div>
            {TRACKS.map(([tid, label]) => (
              <div key={tid} className={`director-lane ${tid === 'V1' ? 'v' : 'a'}`}>
                <span className="director-track-label mono small">
                  {tid} <em>{label}</em>
                  {tid === 'A1' && dir && <RecordLine notify={notify} label="●" onDone={(file) => addClip('A1', file, 'Recorded line')} />}
                  {tid !== 'V1' && (
                    <button className="link-btn mono small" disabled={!dir} onClick={() => pickAudio(tid)} title={`Add a ${label.toLowerCase()} file at the playhead`}>
                      +
                    </button>
                  )}
                </span>
                <div className="director-lane-body" style={{ width }} onPointerDown={(e) => e.target === e.currentTarget && setSel(null)}>
                  {tid === 'V1' &&
                    beats.map((b, i) => (
                      <div
                        key={i}
                        className={`director-block beat ${sel?.t === 'beat' && sel.i === i ? 'on' : ''}`}
                        style={{ left: b.from * px, width: Math.max(10, (b.to - b.from) * px) }}
                        onPointerDown={(e) => (setSel({ t: 'beat', i }), grab(e, { t: 'beat', i, ref: { from: b.from, to: b.to } }, 'move'))}
                        title={`${b.from}–${b.to}s ${b.camera || ''} ${b.action || ''}`}
                      >
                        <span className="director-grip l" onPointerDown={(e) => grab(e, { t: 'beat', i, ref: { from: b.from, to: b.to } }, 'l')} />
                        <span className="director-block-text mono small">{b.from}–{b.to}s {b.camera || b.action || `Beat ${i + 1}`}</span>
                        <span className="director-grip r" onPointerDown={(e) => grab(e, { t: 'beat', i, ref: { from: b.from, to: b.to } }, 'r')} />
                      </div>
                    ))}
                  {tid !== 'V1' &&
                    plan.map((c, i) =>
                      c.kind === KIND_OF_TRACK[tid] ? (
                        <div
                          key={i}
                          className={`director-block audio ${c.kind} ${sel?.t === 'audio' && sel.i === i ? 'on' : ''}`}
                          style={{ left: c.start * px, width: Math.max(10, c.length * px) }}
                          onPointerDown={(e) => (setSel({ t: 'audio', i }), grab(e, { t: 'audio', i, ref: { start: c.start, length: c.length } }, 'move'))}
                          title={`${c.name || base(c.file)} · ${c.start}s +${c.length}s`}
                        >
                          <span className="director-grip l" onPointerDown={(e) => grab(e, { t: 'audio', i, ref: { start: c.start, length: c.length } }, 'l')} />
                          <span className="director-block-text mono small">{c.name || base(c.file)}</span>
                          <span className="director-grip r" onPointerDown={(e) => grab(e, { t: 'audio', i, ref: { start: c.start, length: c.length } }, 'r')} />
                        </div>
                      ) : null
                    )}
                </div>
              </div>
            ))}
            <div className="director-playhead" style={{ left: 92 + time * px }} />
          </div>
        </div>
      </section>
      {picking && <LoraPicker notify={notify} go={go} onClose={() => setPicking(false)} onPick={(l) => (setPicking(false), put({ extraLoras: [...(dir.extraLoras || []), { name: l.name, strength: 1 }] }))} />}
    </div>
  )
}
