import { useEffect, useState } from 'react'
import { FlowHero, Step, WorkflowNeeds } from './FlowKit'
import { ask } from './Confirm'
import { fileUrl } from './edit/model'
import { src } from './filmkit'

// My workflows (Workflows): the person's own ComfyUI workflows, imported from an API-format JSON
// (src/service/customflows.js). The list of imported workflows, and one workflow as a generated form:
// the controls the JSON's inputs became, its needs (models, node packs), and Run. The pod it runs on is
// the person's own cloud, which still shuts itself off after its idle minutes (the Cloud page).
const F = () => window.ivstudio.flows
const base = (p) => String(p || '').split(/[\\/]/).pop()
const isLocalPath = (v) => /^([a-z]:[\\/]|\/)/i.test(String(v || ''))
const dice = () => Math.floor(Math.random() * 2 ** 31)

export default function Flows({ go, notify, jobs }) {
  const [items, setItems] = useState(null)
  const [openId, setOpenId] = useState(null)
  const load = () => F().list().then(setItems, (err) => notify(err.message))
  useEffect(() => {
    load()
  }, [])
  const importFlow = async () => {
    try {
      const w = await F().import()
      if (!w) return
      notify(`"${w.name}" is in: ${w.params.length} controls, ${w.needs.models.length} models.`, 'info')
      await load()
      setOpenId(w.id)
    } catch (err) {
      notify(err.message)
    }
  }
  if (openId) return <FlowForm id={openId} notify={notify} jobs={jobs} go={go} back={() => (setOpenId(null), load())} />
  return (
    <div className="flows">
      <FlowHero go={go} art="workflows" title="My workflows" kicker="Your own ComfyUI workflows, as simple pages">
        <WorkflowNeeds page="flows" />
      </FlowHero>
      <p className="lede">
        Bring a workflow saved in API format. Techlit Studio reads it and shows only the controls that matter.
        <span className="lede-small dim">It runs on this PC's ComfyUI or your own cloud: the pod starts when you run and shuts itself off after its idle minutes (set on the Cloud page). In ComfyUI: Settings → Dev mode Options on, then "Save (API format)".</span>
      </p>
      <div className="flows-bar">
        <button className="btn btn-primary" onClick={importFlow}>
          + Bring a workflow
        </button>
      </div>
      {items === null && <p className="dim">Loading…</p>}
      {items?.length === 0 && <p className="dim">None yet. Export a workflow from ComfyUI in API format and bring it here.</p>}
      <div className="flows-list">
        {(items || []).map((w) => (
          <div key={w.id} className="flows-tile" role="button" tabIndex={0} onClick={() => setOpenId(w.id)} onKeyDown={(e) => e.key === 'Enter' && setOpenId(w.id)}>
            <span className="flows-tile-name">{w.name}</span>
            <span className="mono small dim">
              {w.controls} controls · {w.models} models
            </span>
            <button
              className="link-btn mono small flows-tile-x"
              title="Remove this workflow (its JSON is forgotten; nothing on ComfyUI changes)"
              onClick={async (e) => {
                e.stopPropagation()
                if (!(await ask({ title: `Remove "${w.name}"?`, message: 'Techlit Studio forgets it. Nothing on ComfyUI or the cloud changes.', confirm: 'Remove it' }))) return
                await F().delete(w.id).catch((err) => notify(err.message))
                load()
              }}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

function FlowForm({ id, notify, jobs, go, back }) {
  const [w, setW] = useState(null)
  const [values, setValues] = useState({})
  const [customize, setCustomize] = useState(false)
  const [check, setCheck] = useState(null) // null | 'checking' | { missingClasses }
  const [busy, setBusy] = useState(false)
  const [jobId, setJobId] = useState(null)
  const job = jobId ? jobs[jobId] : null
  useEffect(() => {
    F()
      .get(id)
      .then((x) => {
        setW(x)
        setValues(Object.fromEntries(x.params.map((p) => [p.key, p.value])))
      })
      .catch((err) => notify(err.message))
  }, [id])
  if (!w) return null
  const hidden = new Set(w.hidden)
  const shown = w.params.filter((p) => !hidden.has(p.key))
  const setHidden = async (keys) => setW(await F().update(id, { hidden: keys }).catch((err) => (notify(err.message), w)))
  const set = (k, v) => setValues((cur) => ({ ...cur, [k]: v }))
  const run = async () => {
    setBusy(true)
    try {
      const j = await F().run(id, values)
      setJobId(j.id)
      notify('Running. The pod starts by itself if it was off.', 'info')
    } catch (err) {
      notify(err.message)
    }
    setBusy(false)
  }
  const outs = (job?.outputs || []).filter((o) => o.url || o.path)
  return (
    <div className="flows">
      <FlowHero go={go} back={{ label: 'My workflows', onClick: back }} art="workflows" title={w.name} kicker={`${shown.length} controls · ${w.needs.models.length} models · ${w.needs.saves.length} outputs`} />
      <Step n={1} title="What it needs" sub="Models are downloaded to your cloud pod the first time a run needs them; node packs must already be there." right={
        <button className="btn btn-small" disabled={check === 'checking'} onClick={async () => (setCheck('checking'), setCheck(await F().check(id).catch((err) => (notify(err.message), null))))}>
          {check === 'checking' ? 'Checking…' : 'Check this ComfyUI'}
        </button>
      }>
        {w.needs.models.length > 0 && (
          <div className="flows-models">
            {w.needs.models.map((m) => (
              <span key={m.file} className="mono small dim" title={m.loader}>
                {base(m.file)}
              </span>
            ))}
          </div>
        )}
        {check && check !== 'checking' && (check.missingClasses.length ? (
          <p className="small pink">This ComfyUI is missing: {check.missingClasses.join(', ')}. Add the node pack{check.missingClasses.length === 1 ? '' : 's'} there first.</p>
        ) : (
          <p className="small dim">Every node this workflow uses is here.</p>
        ))}
      </Step>
      <Step n={2} title="The controls" sub="What the workflow asks. Hide what you never touch." right={
        <button className="link-btn mono small" onClick={() => setCustomize(!customize)}>
          {customize ? 'Done' : 'Customize'}
        </button>
      }>
        {customize && <p className="small dim">Hide the controls you never change; they keep the values saved in the JSON.</p>}
        <div className="flows-form">
          {w.params.map((p) =>
            hidden.has(p.key) ? (
              customize && (
                <div key={p.key} className="flows-hidden-row">
                  <span className="mono small dim">
                    {p.title} · {p.input}
                  </span>
                  <button className="link-btn mono small" onClick={() => setHidden(w.hidden.filter((k) => k !== p.key))}>
                    Show
                  </button>
                </div>
              )
            ) : (
              <div key={p.key} className={`flows-field ${p.kind === 'prompt' ? 'wide' : ''}`}>
                <label className="mono small dim" title={`${p.class} · ${p.input}`}>
                  {p.title}
                  {customize && (
                    <button className="link-btn mono small" onClick={() => setHidden([...w.hidden, p.key])}>
                      hide
                    </button>
                  )}
                </label>
                <Control p={p} value={values[p.key]} onChange={(v) => set(p.key, v)} />
              </div>
            )
          )}
        </div>
      </Step>
      <div className="lipsync-go">
        <button className="btn btn-primary" disabled={busy} onClick={run}>
          {busy ? 'Sending…' : `Run ${w.name}`}
        </button>
        {job && <span className={`mono small ${job.status === 'error' ? 'pink' : 'dim'}`}>{job.status === 'success' ? 'Done.' : job.status === 'error' ? `Failed: ${job.error || 'see the log'}` : `${job.status}…`}</span>}
      </div>
      {outs.length > 0 && (
        <div className="flows-out">
          {outs.map((o, i) =>
            o.kind === 'image' ? (
              <img key={`${o.path || o.url}${i}`} src={src(o)} alt="" />
            ) : o.kind === 'audio' ? (
              <audio key={`${o.path || o.url}${i}`} src={src(o)} controls />
            ) : (
              <video key={`${o.path || o.url}${i}`} src={src(o)} controls autoPlay={i === 0} />
            )
          )}
        </div>
      )}
    </div>
  )
}

// One control, by what the input became: words, a number, a seed, a switch, a model file, or media.
function Control({ p, value, onChange }) {
  if (p.kind === 'prompt') return <textarea className="wiz-big" rows={3} value={value ?? ''} onChange={(e) => onChange(e.target.value)} />
  if (p.kind === 'toggle')
    return (
      <label className="wiz-check small">
        <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} /> on
      </label>
    )
  if (p.kind === 'number') return <input className="flows-num" type="number" value={value ?? 0} onChange={(e) => onChange(e.target.value)} />
  if (p.kind === 'seed')
    return (
      <span className="flows-seed">
        <input className="flows-num" type="number" min={0} value={value ?? 0} onChange={(e) => onChange(e.target.value)} />
        <button className="btn btn-small" title="A new seed" onClick={() => onChange(dice())}>
          ⚄
        </button>
      </span>
    )
  if (p.kind === 'model') return <input className="flows-model mono small" value={value ?? ''} onChange={(e) => onChange(e.target.value)} />
  if (['picture', 'video', 'audio'].includes(p.kind)) {
    const local = isLocalPath(value)
    return (
      <span className="flows-media">
        <button
          className="btn btn-small"
          onClick={async () => {
            const f = await window.ivstudio.files.pick(p.kind === 'picture' ? 'picture' : p.kind)
            if (f) onChange(Array.isArray(f) ? f[0] : f)
          }}
        >
          {value ? 'Change' : `Pick ${p.kind === 'picture' ? 'a picture' : p.kind === 'video' ? 'a video' : 'audio'}`}
        </button>
        {value && <span className="mono small dim">{base(value)}</span>}
        {local && p.kind === 'picture' && <img className="flows-thumb" src={fileUrl(value)} alt="" />}
        {local && p.kind === 'video' && <video className="flows-thumb" src={fileUrl(value)} muted />}
        {local && p.kind === 'audio' && <audio src={fileUrl(value)} controls />}
      </span>
    )
  }
  return <input value={value ?? ''} onChange={(e) => onChange(e.target.value)} />
}
