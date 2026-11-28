import { useEffect, useState } from 'react'
import { fileUrl } from './edit/model'
import { ask } from './Confirm'
import { Step, Choices, DropZone, Summary, SummaryDock, SummaryFrame, StageDrop, WorkflowNeeds } from './FlowKit'
import Stage from './Stage'

// Previz (its own sidebar page, claypreviz.js): a shot described in words becomes a cinematic greybox by
// MiniMax H3 — grey mannequin people in a fully rendered world, like a Blender previz; a take picked here is
// then repainted by H3's refine pass with real people, its motion kept. Separate from Create: nothing here
// touches the shot flow.
const ASPECTS = [
  ['16:9', '16:9', 'Widescreen'],
  ['9:16', '9:16', 'Vertical'],
  ['1:1', '1:1', 'Square'],
  ['4:3', '4:3', 'Classic'],
  ['3:4', '3:4', 'Portrait']
]
const SECONDS = [
  [3, '3 s'],
  [5, '5 s'],
  [8, '8 s'],
  [10, '10 s'],
  [12, '12 s'],
  [15, '15 s']
]
const TAKES = [
  [1, '1 take'],
  [2, '2 takes'],
  [3, '3 takes']
]
const LEVELS = [
  ['subtle', 'Subtle', 'Stays closest to the clay motion; lighter detail'],
  ['balanced', 'Balanced', 'Real surfaces and light; the motion holds'],
  ['full', 'Full', 'The most H3 detail; small moves can drift']
]
const IMAGE = /\.(png|jpe?g|webp|bmp)$/i
const base = (p) => String(p).split(/[\\/]/).pop()
// a full film prompt (staging, look, wardrobe) rather than plain words: it wants distilling first
const looksFull = (t) => t.length > 500 || /Staging:|Look:|says exactly these words|\[Shot 1\]|It ends with:|previous shot/i.test(t)

export default function Previz({ notify, openEdit, characters = [], incomingShot = null, clearIncomingShot, remote = false, go }) {
  const [status, setStatus] = useState(null)
  const [runs, setRuns] = useState([])
  const [prompt, setPrompt] = useState('')
  const [aspect, setAspect] = useState('16:9')
  const [seconds, setSeconds] = useState(5)
  const [takes, setTakes] = useState(2)
  const [first, setFirst] = useState(null)
  const [last, setLast] = useState(null)
  const [level, setLevel] = useState('balanced')
  const [characterId, setCharacterId] = useState('')
  const [working, setWorking] = useState(0)
  const [distilling, setDistilling] = useState(false)
  const reload = () => window.ivstudio.claypreviz.runs().then(setRuns, () => {})
  // checked again when the connection changes (This PC ↔ cloud): a stale "not running" clears itself
  useEffect(() => {
    setStatus(null)
    window.ivstudio.claypreviz.status().then(setStatus, (err) => setStatus({ ready: false, blocked: err.message }))
    reload()
  }, [remote])
  // a film shot sent here (Previz this video): its plain words, length, shape and first frame prefill the page
  useEffect(() => {
    if (!incomingShot) return
    const q = incomingShot.request || {}
    const text = incomingShot.idea || q.prompt || ''
    const secs = q.seconds ? Math.min(15, Math.max(2, Math.round(q.seconds))) : seconds
    if (text) setPrompt(text)
    if (q.aspect && ASPECTS.some(([a]) => a === q.aspect)) setAspect(q.aspect)
    if (q.seconds) setSeconds(secs)
    const pic = (q.media || []).find((m) => m.kind === 'picture' && (m.file || m.path))
    if (pic) setFirst(pic.file || pic.path)
    const f = incomingShot.film
    notify(`Prefilled from ${f ? `“${f.name}”, scene ${f.scene} shot ${f.shot}` : 'the shot'}.`, 'info')
    clearIncomingShot?.()
    // a film's full prompt is writer input, not model input: distill it to one paragraph right away
    if (text && looksFull(text)) distill(text, secs, pic ? pic.file || pic.path : null)
  }, [incomingShot])
  // the person's prompt writer turns a full film prompt into one clean paragraph (claypreviz.write)
  async function distill(text = prompt, secs = seconds, frame = first) {
    if (!String(text).trim() || distilling) return
    setDistilling(true)
    notify('Distilling it for the previz — one paragraph, mannequins kept…', 'info')
    try {
      const out = await window.ivstudio.claypreviz.write({ prompt: text, seconds: secs, first: frame })
      if (out) setPrompt(out)
    } catch (err) {
      notify(`${err.message} You can render it as it is, or shorten it yourself.`, 'info')
    } finally {
      setDistilling(false)
    }
  }
  const blocked = !status ? 'Checking ComfyUI…' : status.blocked || (status.ready ? null : status.h3?.error || 'Not set up.')
  const withLora = characters.filter((c) => c.lora)
  const ready = !blocked && prompt.trim()
  function dropped(files) {
    const pics = files.filter((f) => IMAGE.test(f))
    if (!pics.length) return
    if (first && !last) setLast(pics[0])
    else {
      setFirst(pics[0])
      if (pics[1]) setLast(pics[1])
    }
  }
  async function pick(setter) {
    const [f] = (await window.ivstudio.files.pick('picture')) || []
    if (f) setter(f)
  }
  async function run() {
    setWorking((n) => n + 1)
    notify('The clay previz is rendering. It lands below when it’s done.', 'info')
    try {
      await window.ivstudio.claypreviz.take({ prompt, aspect, seconds, takes, first, last })
      notify('The clay takes are in.', 'info')
    } catch (err) {
      notify(err.message)
    } finally {
      setWorking((n) => n - 1)
      reload()
    }
  }
  async function makeReal(run, candidate) {
    setWorking((n) => n + 1)
    notify(`Take ${candidate} is being made real. It lands below when it’s done.`, 'info')
    try {
      await window.ivstudio.claypreviz.realism({ runId: run.id, candidate, level, characterId: characterId || null })
      notify('The real version is in.', 'info')
    } catch (err) {
      notify(err.message)
    } finally {
      setWorking((n) => n - 1)
      reload()
    }
  }
  async function toEdit(r) {
    try {
      const f = r.files.find((x) => x.kind === 'video') || r.files[0]
      const e = await window.ivstudio.library.toEdit({ file: { path: f.file }, label: r.title, type: 'video' })
      openEdit?.(e.id)
    } catch (err) {
      notify(err.message)
    }
  }
  async function remove(r) {
    if (!(await ask({ title: `Delete “${r.title}”?`, message: 'Its video in Techlit Studio’s data folder goes too.', confirm: 'Delete', danger: true }))) return
    await window.ivstudio.claypreviz.deleteRun(r.id).catch((err) => notify(err.message))
    reload()
  }
  const takeRuns = runs.filter((r) => r.kind === 'take')
  const realRuns = runs.filter((r) => r.kind === 'realism')
  const facts = [
    ['Shot', prompt.trim() ? `${prompt.trim().slice(0, 60)}${prompt.trim().length > 60 ? '…' : ''}` : 'not written yet'],
    ['Shape', aspect],
    ['Length', `${seconds} s`],
    ['Takes', String(takes)],
    ['Frames', first ? `${base(first)}${last ? ` → ${base(last)}` : ''}` : 'none (from words)']
  ]
  const action = { label: distilling ? 'Writing it for you…' : working ? `Working (${working})…` : 'Make the greybox previz', onClick: run, disabled: !ready || !!working || distilling }
  return (
    <div className="previz-page create-v2 flow-page">
      <Stage effect="burst" art="previz" title="Previz" kicker="A cinematic greybox, then made real">
        <StageDrop onFiles={dropped}>
          <span className="stage-drop-text">{first ? base(first) : 'Drop a first frame here (optional)'}</span>
          <button className="btn btn-small" onClick={() => pick(setFirst)}>
            + A first frame
          </button>
        </StageDrop>
        <p className="stage-note small">MiniMax H3 films the shot as a full greybox: everything plain grey blocks and mannequins, like a Blender viewport. Pick the take you like and H3’s refine pass paints the real scene over the blocks — the motion stays. Free on this PC or your own cloud.</p>
        <WorkflowNeeds page="previz" />
      </Stage>

      <div className="create-layout">
        <div className="create-steps">
          <Step n={1} title="The shot" sub="What happens, who is in it, how the camera moves. The greybox look is added for you.">
            <textarea className="wiz-big" rows={4} placeholder="A woman in a long coat walks across a empty platform, the camera arcs around her as a train passes behind…" value={prompt} onChange={(e) => setPrompt(e.target.value)} />
            <div className="media-actions">
              <button className="btn btn-small" disabled={!prompt.trim() || distilling || !!working} onClick={() => distill()}>
                {distilling ? 'Writing…' : 'Write it for me'}
              </button>
              {looksFull(prompt) && !distilling && <span className="small dim">This looks like a film’s full prompt — distilling it to one paragraph reads better.</span>}
            </div>
            {blocked && status && (
              <p className="small pink">
                {blocked}
                {remote && /127\.0\.0\.1|localhost/.test(blocked) ? (
                  <> You’re set to render on your cloud, but the check reached this PC — the app is holding an old connection. Restart Techlit Studio and it clears.</>
                ) : (
                  !remote && /not running|econnrefused|fetch failed/i.test(blocked) && (
                    <>
                      {' '}
                      Start ComfyUI, or render on your cloud instead.{' '}
                      <button className="link-btn small" onClick={() => go?.('cloud')}>
                        Open the Cloud page
                      </button>
                    </>
                  )
                )}
              </p>
            )}
          </Step>

          <Step n={2} title="Shape, length and takes" sub="Takes are cheap: each is H3’s small preview pass. More takes, more to choose from.">
            <Choices label="Shape" options={ASPECTS} value={aspect} onChange={setAspect} />
            <Choices label="Length" options={SECONDS} value={seconds} onChange={setSeconds} />
            <Choices label="Takes" options={TAKES} value={takes} onChange={setTakes} />
          </Step>

          <Step n={3} title="Frames (optional)" sub="Start the shot exactly on a picture — and end on another, if you like.">
            <div className="effects-photos">
              <DropZone onFiles={dropped} filled={!!first} empty="Drop the first frame here">
                {first && <img className="effects-photo" src={fileUrl(first)} alt="" />}
                <div className="media-actions">
                  <button className="btn btn-small" onClick={() => pick(setFirst)}>
                    {first ? 'Another picture' : '+ First frame'}
                  </button>
                  {first && (
                    <button className="link-btn small" onClick={() => (setFirst(null), setLast(null))}>
                      Clear
                    </button>
                  )}
                </div>
              </DropZone>
              <DropZone onFiles={(fs) => fs.filter((f) => IMAGE.test(f))[0] && setLast(fs.filter((f) => IMAGE.test(f))[0])} filled={!!last} empty="Drop the last frame here">
                {last && <img className="effects-photo" src={fileUrl(last)} alt="" />}
                <div className="media-actions">
                  <button className="btn btn-small" onClick={() => pick(setLast)}>
                    {last ? 'Another picture' : '+ Last frame'}
                  </button>
                </div>
              </DropZone>
            </div>
          </Step>

          <Step n={4} title="Made real" sub="How hard H3 repaints a take, and whose face it wears. Pick a take below when the clay is in.">
            <Choices label="Realism" options={LEVELS} value={level} onChange={setLevel} className="flow-three" />
            {withLora.length > 0 && (
              <label className="previz-character small">
                Character{' '}
                <select value={characterId} onChange={(e) => setCharacterId(e.target.value)}>
                  <option value="">No character LoRA</option>
                  {withLora.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </Step>
        </div>

        <Summary label="Your previz" kind="MiniMax H3" frame={<SummaryFrame aspect={aspect} src={first && fileUrl(first)} tag="greybox" />} facts={facts} action={action} note={blocked} />
      </div>
      <SummaryDock facts={facts} action={action} />

      {takeRuns.length > 0 && (
        <section className="audio-section previz-takes">
          <div className="audio-section-head">
            <h2>
              Clay takes <span className="count">{takeRuns.length}</span>
            </h2>
          </div>
          {takeRuns.map((r) => (
            <div key={r.id} className="previz-run">
              <div className="previz-run-head">
                <span className="small">{r.title}</span>
                <span className="effects-run-actions">
                  <button className="link-btn small" onClick={() => remove(r)}>
                    Delete
                  </button>
                </span>
              </div>
              {r.status !== 'success' ? (
                <div className="effects-run-wait mono small dim">{r.status === 'error' ? `Failed: ${r.error}` : 'Working…'}</div>
              ) : (
                <div className="effects-grid">
                  {(r.files || []).map((f) => (
                    <div key={f.candidate} className="effects-run">
                      <video src={fileUrl(f.file)} controls loop preload="metadata" />
                      <div className="effects-run-foot">
                        <span className="small">{f.label}</span>
                        <span className="effects-run-actions">
                          <button className="btn btn-small" disabled={!!working || !!blocked} onClick={() => makeReal(r, f.candidate)}>
                            Make it real
                          </button>
                          <button className="link-btn small" onClick={() => window.ivstudio.files.reveal({ path: f.file })}>
                            Show file
                          </button>
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </section>
      )}

      {realRuns.length > 0 && (
        <section className="audio-section previz-real">
          <div className="audio-section-head">
            <h2>
              Made real <span className="count">{realRuns.length}</span>
            </h2>
          </div>
          <div className="effects-grid">
            {realRuns.map((r) => {
              const v = r.files?.find((f) => f.kind === 'video')
              return (
                <div key={r.id} className="effects-run">
                  {v ? <video src={fileUrl(v.file)} controls loop preload="metadata" /> : <div className="effects-run-wait mono small dim">{r.status === 'error' ? `Failed: ${r.error}` : 'Working…'}</div>}
                  <div className="effects-run-foot">
                    <span className="small">{r.title}</span>
                    <span className="effects-run-actions">
                      {v && (
                        <button className="btn btn-small" onClick={() => toEdit(r)}>
                          Add to edit
                        </button>
                      )}
                      {v && (
                        <button className="link-btn small" onClick={() => window.ivstudio.files.reveal({ path: v.file })}>
                          Show file
                        </button>
                      )}
                      <button className="link-btn small" onClick={() => remove(r)}>
                        Delete
                      </button>
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}
    </div>
  )
}
