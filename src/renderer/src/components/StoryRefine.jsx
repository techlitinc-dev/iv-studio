import { useEffect, useState } from 'react'
import { Cell } from './FilmBoard'
import { ConfirmHost, ask } from './Confirm'
import { FILM_STATE, clock, plural } from './filmkit'

// Story-refine: a film's scenes and shots as a writing surface, in a window of its own (main process
// openStoryWindow, opened at #story-refine/<id> from the project page's "Refine story"). It edits the same
// production through the same IPC as the board (productions.editScene / editShot / rework / writePrompt), so
// every change here is on the board in the main window at once (productions:changed reaches both windows).
// No rendering lives here on purpose: this window is for the words.
const P = () => window.ivstudio.productions

export default function StoryRefine({ id }) {
  const [v, setV] = useState(null)
  const [sceneId, setSceneId] = useState(null)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const notify = (text, tone) => {
    setMsg(text)
    setErr(tone === 'error' ? text : '')
    clearTimeout(notify.t)
    notify.t = setTimeout(() => (setMsg(''), setErr('')), 6000)
  }
  const load = () => P().get(id).then(setV, (e) => notify(e.message, 'error'))
  useEffect(() => {
    load()
    return P().onChanged((u) => u.id === id && load())
  }, [id])
  const act = async (fn, ok) => {
    try {
      const r = await fn()
      if (ok) notify(typeof ok === 'function' ? ok(r) : ok)
      await load()
      return r
    } catch (e) {
      notify(e.message, 'error')
    }
  }
  if (!v) return <div className="storyrefine storyrefine-loading">{msg || 'Loading the film…'}</div>
  const sc = v.scenes.find((s) => s.id === sceneId) || v.scenes[0] || null
  const nums = new Map()
  {
    let n = 0
    for (const s of v.scenes) for (const sh of s.shots) nums.set(sh.id, ++n)
  }
  const editScene = (sceneId2, patch, ok) => act(() => P().editScene(v.id, sceneId2, patch), ok)
  const editShot = (scId, shId, patch) => act(() => P().editShot(v.id, scId, shId, patch))
  const removeScene = async (s, k) => {
    if (!(await ask({ title: `Delete scene ${k + 1}?`, message: `${plural(s.shots.length, 'shot')} go with it. Anything already filmed stays in Shots and the Library.`, confirm: 'Delete the scene' }))) return
    if (sceneId === s.id) setSceneId(null)
    editScene(s.id, { remove: true }, 'Scene deleted.')
  }
  return (
    <div className="storyrefine">
      <header className="storyrefine-head">
        <div className="storyrefine-title">
          <span className="mono small dim">Story refine</span>
          <h1>{v.name}</h1>
        </div>
        <span className={`mono small ${err ? 'pink' : 'dim'}`}>{msg || `${plural(v.scenes.length, 'scene')} · ${plural(v.totals.shots, 'shot')} · saves as you type`}</span>
      </header>
      <div className="storyrefine-body">
        <nav className="storyrefine-rail" aria-label="Scenes">
          {v.scenes.map((s, k) => (
            <div key={s.id} className={`storyrefine-scene ${sc?.id === s.id ? 'on' : ''}`} role="button" tabIndex={0} onClick={() => setSceneId(s.id)} onKeyDown={(e) => e.key === 'Enter' && setSceneId(s.id)}>
              <span className="storyrefine-scene-n mono small">S{k + 1}</span>
              <span className="storyrefine-scene-name">
                {s.location || s.heading}
                <span className="dim"> · {plural(s.shots.length, 'shot')}</span>
              </span>
              <span className="storyrefine-scene-tools">
                <button title="Move up" aria-label={`Move scene ${k + 1} up`} disabled={k === 0} onClick={(e) => (e.stopPropagation(), editScene(s.id, { move: -1 }))}>
                  ↑
                </button>
                <button title="Move down" aria-label={`Move scene ${k + 1} down`} disabled={k === v.scenes.length - 1} onClick={(e) => (e.stopPropagation(), editScene(s.id, { move: 1 }))}>
                  ↓
                </button>
                <button title="Delete the scene" aria-label={`Delete scene ${k + 1}`} onClick={(e) => (e.stopPropagation(), removeScene(s, k))}>
                  ×
                </button>
              </span>
            </div>
          ))}
          <button className="btn btn-small storyrefine-add" onClick={() => act(() => P().editScene(v.id, v.scenes.at(-1)?.id || null, { add: true }), 'Scene added.')}>
            + Add a scene
          </button>
        </nav>
        <main className="storyrefine-main">
          {!sc && (
            <div className="storyrefine-empty">
              <p className="dim">No scenes yet. Write the story on the film’s Story step, or add a scene here.</p>
            </div>
          )}
          {sc && <SceneEditor key={sc.id} v={v} sc={sc} k={v.scenes.indexOf(sc)} act={act} editScene={editScene} editShot={editShot} notify={notify} />}
        </main>
      </div>
      <ConfirmHost />
    </div>
  )
}

function SceneEditor({ v, sc, k, act, editScene, editShot, notify }) {
  const [note, setNote] = useState({}) // shotId -> the rework note being typed
  const [busy, setBusy] = useState('')
  const planning = v.breakdown?.state === 'running'
  const rework = async (sh) => {
    const text = (note[sh.id] || '').trim()
    if (!text) return notify('Write the note first: what should change?')
    setBusy(sh.id)
    await act(() => P().rework(v.id, sc.id, sh.id, { tool: 'note', note: text }), 'Reworked. The old prompt is kept — Undo is on the shot.')
    setNote((n) => ({ ...n, [sh.id]: '' }))
    setBusy('')
  }
  return (
    <div className="storyrefine-scene-edit">
      <div className="storyrefine-scene-head">
        <span className="mono small pink">Scene {k + 1}</span>
        <label className="storyrefine-field wide">
          <span className="mono small dim">Heading</span>
          <Cell value={sc.heading} onCommit={(x) => editScene(sc.id, { heading: x })} />
        </label>
        <label className="storyrefine-field">
          <span className="mono small dim">Place</span>
          <Cell value={sc.location || ''} placeholder="—" onCommit={(x) => editScene(sc.id, { location: x })} />
        </label>
        <label className="storyrefine-field slim">
          <span className="mono small dim">Time</span>
          <Cell value={sc.time || ''} placeholder="DAY" onCommit={(x) => editScene(sc.id, { time: x })} />
        </label>
        <button
          className="link-btn mono small"
          disabled={planning}
          title="The writer plans this scene's shots again from the script. Anything you wrote on its shots is replaced; filmed takes stay."
          onClick={async () => (await ask({ title: `Plan scene ${k + 1} again?`, message: 'Its shots, prompts and sketches are written again from the script. Filmed takes stay in Shots.', confirm: 'Plan it again' })) && act(() => P().breakDown(v.id, { sceneIds: [sc.id], sketch: true }), 'Planning the scene again.')}
        >
          Plan again
        </button>
      </div>
      {sc.stale && <p className="small pink">The script changed since these shots were planned — "Plan again" catches them up.</p>}
      <div className="storyrefine-shots">
        {sc.shots.map((sh, i) => {
          const [label, tone] = FILM_STATE[sh.state?.status] || FILM_STATE.draft
          return (
            <div key={sh.id} className="storyrefine-shot">
              <div className="storyrefine-shot-head">
                <span className="mono small dim">Shot {i + 1}</span>
                <span className={`wiz-panel-state ${tone}`}>{label}</span>
                <span className="storyrefine-shot-tools">
                  <button title="Move up" aria-label={`Move shot ${i + 1} up`} disabled={i === 0} onClick={() => editShot(sc.id, sh.id, { move: -1 })}>
                    ↑
                  </button>
                  <button title="Move down" aria-label={`Move shot ${i + 1} down`} disabled={i === sc.shots.length - 1} onClick={() => editShot(sc.id, sh.id, { move: 1 })}>
                    ↓
                  </button>
                  <button
                    title="Delete the shot"
                    aria-label={`Delete shot ${i + 1}`}
                    onClick={async () => (await ask({ title: `Delete shot ${i + 1}?`, message: 'Anything filmed for it stays in Shots and the Library.', confirm: 'Delete it' })) && editShot(sc.id, sh.id, { remove: true })}
                  >
                    ×
                  </button>
                </span>
              </div>
              <div className="storyrefine-grid">
                <label className="storyrefine-field wide">
                  <span className="mono small dim">What happens</span>
                  <Cell area value={sh.action} onCommit={(x) => editShot(sc.id, sh.id, { action: x })} />
                </label>
                <label className="storyrefine-field wide">
                  <span className="mono small dim">Who stands where</span>
                  <Cell area value={sh.staging || ''} placeholder="—" onCommit={(x) => editShot(sc.id, sh.id, { staging: x })} />
                </label>
                <label className="storyrefine-field">
                  <span className="mono small dim">Camera</span>
                  <Cell value={sh.camera || ''} onCommit={(x) => editShot(sc.id, sh.id, { camera: x })} />
                </label>
                <label className="storyrefine-field">
                  <span className="mono small dim">Ends with</span>
                  <Cell value={sh.ends || ''} placeholder="—" onCommit={(x) => editShot(sc.id, sh.id, { ends: x })} />
                </label>
                <label className="storyrefine-field slim">
                  <span className="mono small dim">Seconds</span>
                  <Cell type="number" value={sh.seconds} onCommit={(x) => editShot(sc.id, sh.id, { seconds: x })} />
                </label>
                <label className="storyrefine-field">
                  <span className="mono small dim">Who speaks</span>
                  <Cell value={sh.speaker || ''} placeholder="—" onCommit={(x) => editShot(sc.id, sh.id, { speaker: x })} />
                </label>
                <label className="storyrefine-field wide">
                  <span className="mono small dim">The line</span>
                  <Cell area value={sh.line || ''} placeholder="—" title="Changing the words drops the recorded voice line" onCommit={(x) => editShot(sc.id, sh.id, { line: x })} />
                </label>
                <label className="wiz-check small storyrefine-continues" title="Carries straight on from the shot before, as one unbroken take">
                  <input type="checkbox" checked={!!sh.continues} disabled={i === 0} onChange={(e) => editShot(sc.id, sh.id, { continues: e.target.checked })} /> one take with the shot before
                </label>
              </div>
              <details className="storyrefine-prompt">
                <summary className="mono small dim">The H3 prompt {sh.prompt ? '' : '· not written yet'}</summary>
                <Cell area value={sh.prompt || ''} placeholder="Write the prompt, or press Write it." onCommit={(x) => act(() => P().setPrompt(v.id, sc.id, sh.id, x), 'Prompt saved.')} />
                <div className="storyrefine-prompt-tools">
                  <button className="link-btn mono small" disabled={busy === sh.id} onClick={() => act(() => P().writePrompt(v.id, sc.id, sh.id), 'The writer wrote the prompt.')}>
                    {sh.prompt ? 'Write it again' : 'Write it'}
                  </button>
                  {(sh.history || []).length > 0 && (
                    <button className="link-btn mono small" onClick={() => act(() => P().restorePrompt(v.id, sc.id, sh.id), 'The earlier prompt is back.')}>
                      Undo the last change
                    </button>
                  )}
                </div>
              </details>
              {sh.prompt && (
                <div className="storyrefine-rework">
                  <input value={note[sh.id] || ''} placeholder='Rework with a note: "closer on her face", "at night"…' onChange={(e) => setNote((n) => ({ ...n, [sh.id]: e.target.value }))} onKeyDown={(e) => e.key === 'Enter' && rework(sh)} />
                  <button className="btn btn-small" disabled={busy === sh.id} onClick={() => rework(sh)}>
                    {busy === sh.id ? 'Reworking…' : '✦ Rework'}
                  </button>
                </div>
              )}
            </div>
          )
        })}
        <button className="btn btn-small storyrefine-add" onClick={() => act(() => P().editShot(v.id, sc.id, sc.shots.at(-1)?.id || null, { add: true, action: '', seconds: 5 }), 'Shot added.')}>
          + Add a shot
        </button>
      </div>
    </div>
  )
}
