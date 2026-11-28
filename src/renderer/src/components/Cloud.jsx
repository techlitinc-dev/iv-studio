import { useEffect, useRef, useState } from 'react'
import SetupProgress, { useSetupProgress } from './SetupProgress'
import ModalAccount from './ModalAccount'
import Stage from './Stage'
import { ask } from './Confirm'
import { BetaJoin, useUsage } from './Privacy'

// "0:07", "1:02:30"
const clock = (s) => {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = String(Math.floor(s % 60)).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`
}
// The cloud-GPU meter: whether the person's own cloud GPU (RunPod, Modal) is up — its kind, rate, time running
// and cost so far — with the shut-off beside it. In cloud mode (where renders go) it's the compact inline title-bar
// chip; in This-PC mode it's a floating widget bottom-left with the full figures, because a leftover pod bills
// either way — there it is the alarm that money is burning for nothing. Nothing here can wake a GPU: cloud:usage
// only lists what runs (RunPod) or asks Modal, both free reads, and a cloud that was never set up hides the widget
// (looked for again every five minutes).
export function PodMeter({ onOpen, notify = () => {}, floating = false }) {
  const [u, setU] = useState(null)
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    let live = true
    let timer = null
    let gap = 1500
    const poll = () =>
      window.ivstudio.cloud
        .usage()
        .then((x) => {
          if (!live) return
          setU(x)
          gap = x?.setup ? 30000 : 300000
        })
        .catch(() => {})
        .finally(() => {
          if (live) timer = setTimeout(poll, gap)
        })
    timer = setTimeout(poll, 400)
    const tick = setInterval(() => live && setNow(Date.now()), 1000)
    return () => {
      live = false
      clearTimeout(timer)
      clearInterval(tick)
    }
  }, [])
  if (!u?.setup) return null
  const rate = u.rate || 1620
  const inr = (v) => `₹${(v * rate).toFixed(2)}`
  if (u.hosted)
    return (
      <button className="mono cloud-meter" onClick={onOpen} title="Comfy Cloud: each render is billed to your Comfy account, and nothing runs between renders. Click for the Cloud page.">
        <span className="cloud-meter-dot" />
        Comfy Cloud · per run
      </button>
    )
  const pod = u.running[0]
  const on = !!pod
  const seconds = on ? Math.max(0, (now - (pod.startedAt || now)) / 1000) : 0
  const cost = (seconds / 3600) * (u.perHour || 0)
  const local = u.target !== 'cloud'
  const idle = on && u.idleLeft != null ? ` · idles off in ${Math.max(1, Math.round(u.idleLeft / 60))} min` : ''
  const where = u.provider === 'runpod' ? 'RunPod' : 'Modal'
  const short = u.gpu.replace(/^NVIDIA /, '')
  // the inline chip shares the title bar with Start ComfyUI and the PC meter, so it carries less than the
  // floating widget: the tooltip always has the full story
  const today = floating && u.today != null ? ` · today ${inr(u.today)}${u.budget?.on ? ` of ${inr(u.budget.daily)}` : ''}` : ''
  const inner = (
    <>
      <button
        className={`mono cloud-meter ${on ? 'on' : ''}`}
        onClick={onOpen}
        title={
          on
            ? `Cloud GPU running on your ${where} account (${u.gpu}${u.dataCenter ? `, ${u.dataCenter}` : ''}) at ${inr(u.perHour)}/h, billed by the second${idle.replace(/^ · /, '; ')}${local ? '. Rendering is switched to This PC — this pod is not needed; shut it down to stop the billing' : ''}. Today: ${inr(u.today)}. Click for the Cloud page.`
            : `Cloud GPU off. ${u.gpu} on your ${where} account costs ${inr(u.perHour)}/h while it runs; today ${inr(u.today)}. Click for the Cloud page.`
        }
      >
        <span className="cloud-meter-dot" />
        {on ? `GPU on · ${floating ? `${short} · ` : ''}${inr(u.perHour)}/h · ${clock(seconds)} · ${inr(cost)}${today}` : `GPU off · ${short} · ${inr(u.perHour)}/h${today}`}
      </button>
      {on && <ShutDownGpu notify={notify} className="btn btn-small cloud-meter-stop" />}
    </>
  )
  return floating ? <div className="pod-float">{inner}</div> : <span className="cloud-meter-wrap">{inner}</span>
}

// The cloud dashboard: what's up (with the pod's own idle countdown), what today cost against the daily
// budget, and the model storage on the volume. Polls every 30 s; the budget editor writes cloud:setBudget.
function CloudDash({ notify }) {
  const [dash, setDash] = useState(null)
  const [dashAt, setDashAt] = useState(0)
  const [now, setNow] = useState(Date.now())
  const [daily, setDaily] = useState('')
  const [rate, setRate] = useState('')
  const [files, setFiles] = useState(null) // {up, files} once asked
  const [showFiles, setShowFiles] = useState(false)
  const [removing, setRemoving] = useState('')
  const load = () =>
    window.ivstudio.cloud
      .dash()
      .then((d) => {
        setDash(d)
        setDashAt(Date.now())
        setDaily((v) => (v === '' ? String(d.budget.daily) : v))
        setRate((v) => (v === '' ? String(d.rate) : v))
      })
      .catch(() => {})
  useEffect(() => {
    load()
    const poll = setInterval(load, 30000)
    const tick = setInterval(() => setNow(Date.now()), 1000)
    const off = window.ivstudio.cloud.onBudgetStop(({ daily: d }) => notify(`Today's cloud budget ($${Number(d).toFixed(2)}) is spent — the GPU was shut down.`))
    return () => {
      clearInterval(poll)
      clearInterval(tick)
      off?.()
    }
  }, [])
  async function saveBudget(on, d) {
    try {
      await window.ivstudio.cloud.setBudget({ on, daily: Number(d) })
      load()
    } catch (e) {
      notify(e.message)
    }
  }
  async function saveRate(r) {
    try {
      await window.ivstudio.cloud.setRate(Number(r))
      load()
    } catch (e) {
      notify(e.message)
    }
  }
  async function loadFiles() {
    try {
      setFiles(await window.ivstudio.cloud.runpodFiles())
    } catch (e) {
      notify(e.message)
    }
  }
  async function removeFile(rel) {
    if (!(await ask({ title: `Remove ${rel} from your cloud storage?`, message: 'The next render that needs it downloads it again.', confirm: 'Remove it' }))) return
    setRemoving(rel)
    try {
      await window.ivstudio.cloud.runpodDeleteFile(rel)
      await loadFiles()
    } catch (e) {
      notify(e.message)
    } finally {
      setRemoving('')
    }
  }
  if (!dash || dash.provider === 'comfycloud') return null
  const pod = dash.pod
  const idleLeft = pod?.idleLeft != null ? Math.max(0, pod.idleLeft - (now - dashAt) / 1000) : null
  const pct = dash.budget.on && dash.budget.daily > 0 ? Math.min(100, (dash.today / dash.budget.daily) * 100) : 0
  const inr = (v) => `₹${(v * (dash.rate || 1620)).toFixed(2)}`
  const list = files?.files ? Object.entries(files.files).sort((a, b) => b[1] - a[1]) : null
  const usedGb = list ? list.reduce((s, [, b]) => s + b, 0) / 1e9 : null
  return (
    <section className="cloud-dash">
      <div className="cloud-dash-row">
        <span className={`cloud-status mono small ${pod ? 'on' : ''}`}>
          <span className="cloud-status-dot" />
          {pod ? `GPU on · ${pod.gpu || ''}${pod.perHour != null ? ` · ${inr(Number(pod.perHour))}/h` : ''}` : 'GPU off'}
        </span>
        {pod && idleLeft != null && (
          <span className="small dim">
            shuts off in about {Math.floor(idleLeft / 60)}:{String(Math.floor(idleLeft % 60)).padStart(2, '0')}
          </span>
        )}
        {pod && idleLeft == null && pod.idleLimit != null && <span className="small dim">shuts off after {Math.round(pod.idleLimit / 60)} idle min</span>}
        {pod?.stage && pod.stage !== 'ready' && <span className="small dim">booting: {pod.stage}</span>}
      </div>
      <div className="cloud-dash-row">
        <span className="small">
          Today: {inr(dash.today)}
          {dash.budget.on ? ` of ${inr(dash.budget.daily)}` : ''}
        </span>
        {dash.budget.on && (
          <span className="cloud-dash-bar" title={`${pct.toFixed(0)}% of today's budget spent`}>
            <span style={{ width: `${pct}%` }} className={pct >= 100 ? 'over' : ''} />
          </span>
        )}
        <label className="small dim cloud-dash-budget">
          <input type="checkbox" checked={dash.budget.on} onChange={(e) => saveBudget(e.target.checked, daily || dash.budget.daily)} /> Daily budget $
        </label>
        <input className="cloud-dash-daily" type="number" min="0" step="0.5" value={daily} onChange={(e) => setDaily(e.target.value)} onBlur={() => saveBudget(dash.budget.on, daily)} aria-label="Daily cloud budget in dollars" />
        <label className="small dim cloud-dash-budget" title="Every cloud cost in Techlit Studio is also shown in rupees at this rate">
          ₹ per $1
        </label>
        <input className="cloud-dash-daily" type="number" min="0" step="0.1" value={rate} onChange={(e) => setRate(e.target.value)} onBlur={() => saveRate(rate)} aria-label="Rupees per dollar" />
        <span className="small dim">when the budget's spent, the GPU shuts down and stays off until tomorrow</span>
      </div>
      {dash.provider === 'runpod' && dash.volume && (
        <div className="cloud-dash-row">
          <span className="small">
            Storage: {dash.volume.gb} GB volume in {dash.volume.dataCenter} · about ${dash.volume.perMonth.toFixed(2)} a month
            {usedGb != null ? ` · ${usedGb.toFixed(1)} GB of models on it` : ''}
          </span>
          <button
            className="link-btn"
            onClick={() => {
              setShowFiles(!showFiles)
              if (!files) loadFiles()
            }}
          >
            {showFiles ? 'Hide files' : 'Manage files'}
          </button>
        </div>
      )}
      {showFiles && (
        <div className="cloud-files">
          {!files && <p className="small dim">Asking the pod…</p>}
          {files && !files.up && (
            <p className="small dim">
              No cloud GPU is up. Files can be listed and removed while a pod is running — wake it (or run a render) first.{' '}
              <button className="link-btn" onClick={loadFiles}>
                Check again
              </button>
            </p>
          )}
          {list && list.length === 0 && <p className="small dim">No model files on the volume yet.</p>}
          {list &&
            list.slice(0, 60).map(([rel, bytes]) => (
              <p key={rel} className="cloud-file mono small">
                <span className="cloud-file-name" title={rel}>
                  {rel}
                </span>
                <span className="dim">{(bytes / 1e9).toFixed(2)} GB</span>
                <button className="link-btn" disabled={removing === rel} onClick={() => removeFile(rel)}>
                  {removing === rel ? 'Removing…' : 'Remove'}
                </button>
              </p>
            ))}
          {list && list.length > 60 && <p className="small dim">…and {list.length - 60} more files.</p>}
        </div>
      )}
    </section>
  )
}

// Shuts the cloud GPU down now, on top of the idle timer. On the Cloud page.
export function ShutDownGpu({ notify, className = 'btn btn-small' }) {
  const [stopping, setStopping] = useState(false)
  async function stop() {
    const ok = await ask({
      title: 'Shut down the cloud GPU?',
      message: 'The cloud stops it now, so billing stops now too. A render running in the cloud is lost. The next render wakes the GPU again (about 1–3 minutes on Modal, 2–5 on RunPod).',
      confirm: 'Shut down GPU'
    })
    if (!ok) return
    setStopping(true)
    try {
      const { stopped } = await window.ivstudio.cloud.stop()
      notify(stopped ? 'Cloud GPU shut down. Billing has stopped.' : 'The cloud GPU was already off.')
    } catch (err) {
      notify(err.message)
    } finally {
      setStopping(false)
    }
  }
  return (
    <button className={className} disabled={stopping} onClick={stop} title="Stop the cloud GPU now instead of waiting for it to idle off">
      {stopping ? 'Shutting down…' : 'Shut down GPU'}
    </button>
  )
}

// The cloud services, as cards on the Cloud page.
const PROVIDERS = [
  { id: 'runpod', label: 'RunPod', line: 'Your own account. Billed by the second while the GPU is up.' },
  { id: 'modal', label: 'Modal', line: 'Your own account. Billed by the second while the GPU is up.' },
  { id: 'comfycloud', label: 'Comfy Cloud', line: 'Comfy’s own ComfyUI. Billed per run; only Comfy’s nodes and models.' }
]

const IDLE = [
  [180, '3 min'],
  [300, '5 min'],
  [600, '10 min'],
  [1200, '20 min']
]

// Models beyond H3 come into the person's cloud storage the first time a feature needs them (the app asks first).
// Some are behind a licence on Hugging Face (Flux.2 Klein 9B, Flux 3 Klein, the LTX effects): those need the
// person's own Hugging Face token, after they accept the licence there.
function CloudModelsStep({ st, busy, run, notify, refresh }) {
  const [token, setToken] = useState('')
  async function save(k) {
    await run(k ? 'Checking the token' : 'Removing the token', async () => {
      const r = await window.ivstudio.cloud.hfToken(k)
      setToken('')
      if (k) notify(`Hugging Face token saved (encrypted on this PC)${r?.name ? ` for ${r.name}` : ''}.`)
    })
    refresh()
  }
  return (
    <section className="group cloud-models">
      <div className="group-head">
        <h2>Models for everything else</h2>
        <p className={`mono small ${st.hasHfToken ? 'cloud-ok' : 'dim'}`}>{st.hasHfToken ? '● Hugging Face token saved' : 'Optional'}</p>
      </div>
      <div className="group-body">
        <p className="small dim">
          Setup puts H3’s models in your cloud storage. Pictures, music, sounds, Replace, Effects and SeedVR2 bring their own models the first time you use them there: Techlit Studio says how big they are and asks before downloading. A few are behind a licence on Hugging Face (Flux.2 Klein 9B, Flux 3 Klein and the LTX effects). To use those in the cloud, accept each licence on its Hugging Face page, then add a Read token from huggingface.co → Settings → Access Tokens.
        </p>
        {st.hasHfToken ? (
          <p className="small">
            A Hugging Face token is saved (encrypted on this PC). It’s used only to download those files into your own cloud storage.{' '}
            <button className="link-btn" disabled={!!busy} onClick={() => save('')}>
              Remove it
            </button>
          </p>
        ) : (
          <div className="key-form">
            <input type="password" placeholder="hf_…" value={token} onChange={(e) => setToken(e.target.value)} autoComplete="off" spellCheck={false} aria-label="Hugging Face token" />
            <button className="btn btn-small" disabled={!!busy || !token.trim()} onClick={() => save(token.trim())}>
              Save token
            </button>
          </div>
        )}
      </div>
    </section>
  )
}

function Step({ n, title, done, children }) {
  return (
    <section className={`group cloud-step ${done ? 'done' : ''}`}>
      <div className="group-head">
        <h2>
          <span className="mono dim cloud-n">{String(n).padStart(2, '0')}</span> {title}
        </h2>
        <p className={`mono small ${done ? 'cloud-ok' : 'dim'}`}>{done ? '● Done' : 'To do'}</p>
      </div>
      <div className="group-body">{children}</div>
    </section>
  )
}

// RunPod: the person's API key, a GPU and shut-off time, then Set up (volume, install, models, characters).
function RunPodSteps({ st, busy, run, notify, refresh, links }) {
  const rp = st.runpod || {}
  const [key, setKey] = useState('')
  const [gpus, setGpus] = useState(st.runpodGpus.map((g) => ({ ...g, inStock: null })))
  const [gpu, setGpu] = useState(rp.gpu || st.runpodGpus[0].id)
  const [idle, setIdle] = useState(rp.idleSeconds || 300)
  const [freeOnly, setFreeOnly] = useState(true) // only cards free right now, unless the person asks for the whole catalog
  const [sort, setSort] = useState('price') // 'price' | 'vram'
  const [pods, setPods] = useState(null)
  const [volumeGone, setVolumeGone] = useState(false)
  const [fetching, setFetching] = useState(false)
  const loadPods = () =>
    window.ivstudio.cloud.runpodPods().then((r) => {
      setPods(r.pods)
      setVolumeGone(!!r.volumeGone)
      // the dead volume's data center no longer pins the stock list (main cleared it): show the fresh state
      if (r.volumeGone) refresh()
    }).catch(() => {})
  const loadGpus = () => window.ivstudio.cloud.runpodAllGpus().then((list) => list.length && setGpus(list)).catch(() => {})
  useEffect(() => {
    if (!rp.hasKey) return
    loadGpus()
    loadPods()
    // stock churns by the minute: keep the dropdown's "free now" fresh while the page is open
    const t = setInterval(loadGpus, 60000)
    return () => clearInterval(t)
  }, [rp.hasKey])
  // stock changes by the minute: the button asks RunPod again
  const fetchStock = async () => {
    setFetching(true)
    await Promise.all([loadGpus(), loadPods()])
    setFetching(false)
  }
  // the saved card stays selectable while the catalog loads, or if RunPod stops listing it
  const options = gpus.some((g) => g.id === gpu) ? gpus : [{ id: gpu, label: gpu, perHour: rp.gpu === gpu ? rp.gpuPerHour : null, inStock: null }, ...gpus]
  const chosen = options.find((g) => g.id === gpu)
  // once the volume exists it pins the data center: a card free somewhere else can't help, so stock is judged there.
  // a card whose data centers RunPod didn't list still falls back to plain stock; a free card names where it's free
  const usable = (g) => (rp.dataCenter && g.dataCenters?.length ? g.dataCenters.includes(rp.dataCenter) : g.inStock !== false)
  const stockText = (g) => {
    if (rp.dataCenter && g.dataCenters?.length) return g.dataCenters.includes(rp.dataCenter) ? ` · free now in ${rp.dataCenter}` : ` · none free in ${rp.dataCenter} now`
    if (g.inStock && g.dataCenters?.length) return ` · free now in ${g.dataCenters.slice(0, 2).join(', ')}${g.dataCenters.length > 2 ? ` +${g.dataCenters.length - 2} more` : ''}`
    return g.inStock === false ? ' · busy right now' : g.inStock ? ' · free now' : ''
  }
  // for this project (H3): the cheapest card free now, and the best suited (the curated cards are in recommendation order)
  const cheapest = options.filter((g) => usable(g) && g.perHour != null).sort((a, b) => a.perHour - b.perHour)[0] || null
  const best = st.runpodGpus.map((c) => options.find((o) => o.id === c.id)).find((g) => g && usable(g)) || null
  // no card chosen yet (fresh setup): default to the cheapest free one as stock reports in; a stored or clicked
  // pick is the person's own and is never overridden
  const pickedByHand = useRef(!!rp.gpu)
  useEffect(() => {
    if (pickedByHand.current || !cheapest) return
    setGpu((cur) => (cur === cheapest.id ? cur : cheapest.id))
  }, [cheapest?.id])
  const sorted = [...options].sort(sort === 'vram' ? (a, b) => (b.vram ?? 0) - (a.vram ?? 0) || (a.perHour ?? Infinity) - (b.perHour ?? Infinity) : (a, b) => (a.perHour ?? Infinity) - (b.perHour ?? Infinity))
  const visible = freeOnly ? sorted.filter(usable) : sorted
  // the chosen card stays in the dropdown even when the filter would hide it
  const listed = visible.some((g) => g.id === gpu) ? visible : [...visible, chosen].filter(Boolean)
  const compatiblePods = (pods || []).filter((p) => options.some((o) => o.id === p.gpu))
  const optionText = (g) =>
    `${g.label}${g.perHour != null ? ` — $${g.perHour.toFixed(2)} an hour` : ''}${stockText(g)}${g.id === cheapest?.id ? ' · cheapest' : ''}${g.note?.startsWith('Recommended') ? ' · recommended' : ''}`
  async function saveKey(k) {
    await run(k ? 'Checking the key' : 'Removing the key', async () => {
      await window.ivstudio.cloud.runpodKey(k)
      setKey('')
      if (k) notify('RunPod key saved (encrypted on this PC).')
    })
    refresh()
  }
  return (
    <>
      <Step n={1} title="RunPod account" done={!!rp.hasKey}>
        {rp.hasKey ? (
          <p className="small">
            A RunPod API key is saved (encrypted on this PC).{' '}
            <button className="link-btn" disabled={!!busy} onClick={() => saveKey('')}>
              Remove it
            </button>
          </p>
        ) : (
          <>
            <div className="key-form">
              <input type="password" value={key} placeholder="RunPod API key (rpa_…)" onChange={(e) => setKey(e.target.value)} autoComplete="off" />
              <button className="btn btn-small" disabled={!!busy || !key.trim()} onClick={() => saveKey(key.trim())}>
                Save
              </button>
            </div>
            <p className="small dim">
              New to RunPod?{' '}
              <button className="link-btn" onClick={() => window.ivstudio.links.open(links?.runpodSignup || 'https://www.runpod.io')}>
                Create an account
              </button>{' '}
              and add some credit, then make a key on{' '}
              <button className="link-btn" onClick={() => window.ivstudio.links.open('https://console.runpod.io/user/settings')}>
                Settings → API Keys
              </button>{' '}
              (read/write). Techlit Studio uses it only to make your storage volume and to start and stop your own pods.
              {links?.runpodSignup && <span className="cloud-support"> New accounts made through this link get a one-time RunPod credit of $5 to $500 after adding their first $10, and it supports Techlit Studio at no extra cost to you.</span>}
            </p>
          </>
        )}
      </Step>

      <Step n={2} title="GPU and shut-off" done={!!rp.ready}>
        <div className="row">
          <span className="row-label">Filter</span>
          <div className="cloud-gpu-filter">
            <label className="small">
              <input type="checkbox" checked={freeOnly} onChange={(e) => setFreeOnly(e.target.checked)} /> Free now only
            </label>
            <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort the graphics cards">
              <option value="price">Cheapest first</option>
              <option value="vram">Most memory first</option>
            </select>
            <button className="btn btn-small" disabled={fetching || !!busy} onClick={fetchStock} title="Ask RunPod again which cards are free">
              {fetching ? 'Checking…' : 'Check stock'}
            </button>
          </div>
        </div>
        {freeOnly && !visible.length && (
          <p className="small dim">
            No cards free{rp.dataCenter ? ` in ${rp.dataCenter} (where your storage is)` : ''} right now — Check stock again in a few minutes, or untick "Free now only" to see the whole catalog.
          </p>
        )}
        <div className="row">
          <span className="row-label">Graphics card</span>
          <select className="cloud-gpu-select" value={gpu} onChange={(e) => { pickedByHand.current = true; setGpu(e.target.value) }} aria-label="Graphics card">
            {listed.map((g) => (
              <option key={g.id} value={g.id}>
                {optionText(g)}
              </option>
            ))}
          </select>
        </div>
        {(cheapest || best) && (
          <div className="row">
            <span className="row-label">For this project</span>
            <div className="segmented">
              {cheapest && (
                <button className={gpu === cheapest.id ? 'on' : ''} onClick={() => setGpu(cheapest.id)}>
                  Cheapest: {cheapest.label} · ${cheapest.perHour.toFixed(2)}/h
                </button>
              )}
              {best && (
                <button className={gpu === best.id ? 'on' : ''} onClick={() => setGpu(best.id)}>
                  Best suited: {best.label} · ${best.perHour.toFixed(2)}/h
                </button>
              )}
            </div>
          </div>
        )}
        {chosen?.note && <p className="small dim cloud-gpu-note">{chosen.note}</p>}
        {rp.hasKey && pods && (
          <div className="row">
            <span className="row-label">Compatible pods</span>
            <div className="small dim">
              {compatiblePods.length === 0 && <p className="cloud-pod">None on your account right now — Set up starts one.</p>}
              {compatiblePods.map((p) => (
                <p key={p.id} className="cloud-pod">
                  {p.name} · {options.find((o) => o.id === p.gpu)?.label || p.gpu} · {String(p.status || '').toLowerCase()}
                  {p.perHour != null ? ` · $${Number(p.perHour).toFixed(2)}/h` : ''}
                  {p.ours ? ' · Techlit Studio’s, reused on the next render' : ''}
                </p>
              ))}
              <button className="link-btn" onClick={loadPods}>
                Refresh
              </button>
            </div>
          </div>
        )}
        <div className="row">
          <span className="row-label">Shut down after</span>
          <div className="segmented">
            {IDLE.map(([s, label]) => (
              <button key={s} className={idle === s ? 'on' : ''} onClick={() => setIdle(s)}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <p className="small dim">
          With nothing to do for {IDLE.find(([s]) => s === idle)?.[1]}, the pod deletes itself and GPU billing stops; your volume keeps ComfyUI, the models and every render. If your GPU is taken when a render needs one, Techlit Studio starts the next H3-ready GPU free in your volume's data center. The next render wakes it again (about 2–5 minutes).
          {chosen && ` A 10-second 2 MP shot takes roughly 3–5 minutes of GPU, about $${((chosen.perHour * 4) / 60).toFixed(2)}.`}
        </p>
      </Step>

      <Step n={3} title="Set up" done={!!rp.ready}>
        {volumeGone && (
          <p className="small pink">
            Your RunPod storage volume no longer exists on your account (deleted on RunPod's site, or the account changed). Set up makes a new one — the first boot reinstalls ComfyUI and the models (20–40 minutes).
          </p>
        )}
        <p className="small dim">
          Makes a 100 GB network volume in a RunPod data center that has your GPU, starts a pod that installs ComfyUI and every node pack (matched to this version) and downloads the H3 models onto the volume (about 60 GB, once), then uploads your characters. The first time takes 20–40 minutes of GPU time, under about $1 on an L40S. RunPod bills the volume while it exists (about $7 a month for 100 GB); delete it on RunPod's Storage page when you're done with the cloud.
        </p>
        <button className="btn btn-primary" disabled={!!busy || !rp.hasKey || st.target === 'cloud'} onClick={() => run('Setting up RunPod', () => window.ivstudio.cloud.runpodSetUp({ gpu, idleSeconds: idle, perHour: chosen?.perHour ?? null }))}>
          {rp.ready ? 'Set up again' : 'Set up RunPod'}
        </button>
        {rp.volumeId && (
          <p className="mono small dim">
            {options.find((g) => g.id === rp.gpu)?.label || rp.gpu} · shuts down after {Math.round((rp.idleSeconds || 300) / 60)} min · volume {rp.volumeId} in {rp.dataCenter}
            {' · '}
            <button
              className="link-btn mono small"
              disabled={!!busy || st.target !== 'cloud'}
              title={st.target !== 'cloud' ? 'Switch rendering to your cloud first (the button above)' : 'Every LoRA and RefMod on this PC to the volume, new and changed ones only. Starts the pod if it’s off. New LoRAs also go up by themselves: when one downloads while the pod is on, and after every wake.'}
              onClick={() => run('Syncing LoRAs', () => window.ivstudio.cloud.syncLoras())}
            >
              Sync LoRAs
            </button>
            {' · '}
            <button
              className="link-btn mono small"
              disabled={!!busy || !rp.ready}
              title="The pod’s own ComfyUI canvas in your browser: try nodes and workflows against the cloud GPU. Starts nothing — the pod must already be up. Anything installed there lasts until the next Techlit Studio update; the models and workflows you save stay on the volume."
              onClick={() => run('Opening ComfyUI', () => window.ivstudio.cloud.openComfy())}
            >
              Open ComfyUI
            </button>
          </p>
        )}
      </Step>
    </>
  )
}

// Comfy Cloud: Comfy's hosted ComfyUI. A key, then a check of what Techlit Studio can do there (it can't take node packs).
function ComfyCloudSteps({ st, busy, run, notify, refresh }) {
  const cc = st.comfycloud || {}
  const [key, setKey] = useState('')
  const survey = cc.survey
  async function saveKey(k) {
    await run(k ? 'Checking the key' : 'Removing the key', async () => {
      await window.ivstudio.cloud.comfyCloudKey(k)
      setKey('')
      if (k) {
        notify('Comfy API key saved (encrypted on this PC). Checking what works there…')
        await window.ivstudio.cloud.comfyCloudCheck()
      }
    })
    refresh()
  }
  const mark = (ok) => <span className={`cc-mark ${ok ? 'ok' : 'no'}`}>{ok ? '✓' : '–'}</span>
  return (
    <>
      <Step n={1} title="Comfy account" done={!!cc.hasKey}>
        {cc.hasKey ? (
          <p className="small">
            {cc.ownKey ? 'A Comfy API key is saved (encrypted on this PC).' : 'Using the Comfy.org key you saved for the prompt writer.'}{' '}
            {cc.ownKey && (
              <button className="link-btn" disabled={!!busy} onClick={() => saveKey('')}>
                Remove it
              </button>
            )}
          </p>
        ) : null}
        {(!cc.hasKey || !cc.ownKey) && (
          <>
            <div className="key-form">
              <input type="password" value={key} placeholder="Comfy API key (comfyui-…)" onChange={(e) => setKey(e.target.value)} autoComplete="off" />
              <button className="btn btn-small" disabled={!!busy || !key.trim()} onClick={() => saveKey(key.trim())}>
                Save
              </button>
            </div>
            <p className="small dim">
              Comfy Cloud's API needs a paid Comfy Cloud plan.{' '}
              <button className="link-btn" onClick={() => window.ivstudio.links.open('https://platform.comfy.org/profile/api-keys')}>
                Make an API key
              </button>{' '}
              ·{' '}
              <button className="link-btn" onClick={() => window.ivstudio.links.open('https://www.comfy.org/cloud/pricing')}>
                Plans and pricing
              </button>
            </p>
          </>
        )}
      </Step>
      <Step n={2} title="What works there" done={!!survey}>
        <p className="small dim">Comfy Cloud runs ComfyUI's own nodes and the node packs Comfy chooses, with its own model library. You can't add node packs there, so Techlit Studio asks it what it has. Asking is free.</p>
        <button className="btn btn-small" disabled={!!busy || !cc.hasKey} onClick={() => run('Asking Comfy Cloud', () => window.ivstudio.cloud.comfyCloudCheck())}>
          {survey ? 'Check again' : 'Check what works'}
        </button>
        {survey && (
          <div className="cc-survey">
            <div className="cc-row">
              {mark(survey.shots.ready)}
              <span>
                <b>Shots</b> <span className="small dim">{survey.shots.note}</span>
              </span>
            </div>
            <div className="cc-row">
              {mark(survey.pictures.some((p) => p.ready))}
              <span>
                <b>Pictures</b>{' '}
                <span className="small dim">
                  {survey.pictures.map((p) => `${p.label}: ${p.note}`).join(' · ')}
                </span>
              </span>
            </div>
            <div className="cc-row">
              {mark(survey.music.some((m) => m.ready))}
              <span>
                <b>Music</b> <span className="small dim">{survey.music.map((m) => `${m.label}: ${m.note}`).join(' · ')}</span>
              </span>
            </div>
            <p className="mono small dim">Checked {new Date(cc.checkedAt).toLocaleString()}</p>
          </div>
        )}
      </Step>
    </>
  )
}

// Cloud mode on the user's own Modal or RunPod account, or on Comfy Cloud: pick one, set it up, then switch.
export default function Cloud({ notify, recheck, setup, info }) {
  const [beta, setBeta] = useUsage()
  const [st, setSt] = useState(null)
  const [gpu, setGpu] = useState('L40S')
  const [idle, setIdle] = useState(300)
  const [busy, setBusy] = useState(null)
  const [log, setLog] = useState([])
  const [wake, setWake] = useState(null)
  const [failed, setFailed] = useState(null)
  const logEl = useRef(null)

  const progress = useSetupProgress(st?.setup)
  // a failed status read shows its message and Try again (it used to leave the page blank)
  const refresh = () =>
    window.ivstudio.cloud
      .status()
      .then((s) => {
        setSt(s)
        setFailed(null)
        if (s.cloud?.gpu) setGpu(s.cloud.gpu)
        if (s.cloud?.idleSeconds) setIdle(s.cloud.idleSeconds)
      })
      .catch((err) => setFailed(err?.message || String(err)))

  // the cloud wizard changed things
  useEffect(() => {
    const again = () => refresh()
    window.addEventListener('iv:cloud-changed', again)
    return () => window.removeEventListener('iv:cloud-changed', again)
  }, [])
  useEffect(() => {
    refresh()
    return window.ivstudio.cloud.onLog((line) => setLog((l) => [...l.slice(-400), line]))
  }, [])
  useEffect(() => {
    logEl.current?.scrollTo(0, logEl.current.scrollHeight)
  }, [log])

  async function run(label, fn) {
    setBusy(label)
    try {
      await fn()
    } catch (err) {
      notify(err.message)
    } finally {
      setBusy(null)
      refresh()
    }
  }

  async function setUp() {
    setLog([])
    await run('Setting up', () => window.ivstudio.cloud.setUp({ gpu, idleSeconds: idle }))
  }

  async function use(target) {
    await run(target === 'cloud' ? 'Waking the cloud GPU' : 'Switching', async () => {
      await window.ivstudio.cloud.use(target)
      if (target === 'cloud') {
        setWake('waking')
        const w = await window.ivstudio.cloud.wake()
        setWake(`${st.provider === 'comfycloud' ? 'Comfy Cloud' : 'Cloud GPU'} ready${w.gpu ? ` (${w.gpu.replace(/^cuda:\d+ /, '').replace(/ : \w+$/, '')})` : ''} in ${w.seconds} s.`)
      } else setWake(null)
      await recheck()
    })
  }

  if (!st)
    return (
      <div className="cloud">
        <Stage effect="dream" art="cloud" title="Cloud" kicker="Your own GPU · by the second" />
        {failed ? (
          <section className="group">
            <div className="group-body">
              <p className="small">The Cloud page couldn’t load: {failed}</p>
              <button className="btn btn-small" onClick={() => (setFailed(null), refresh())}>
                Try again
              </button>
            </div>
          </section>
        ) : (
          <p className="small dim">Loading…</p>
        )}
      </div>
    )
  const chosen = st.gpus.find((g) => g.id === gpu)
  const runpod = st.provider === 'runpod'
  const comfyCloud = st.provider === 'comfycloud'
  const setUpDone = comfyCloud ? !!st.comfycloud?.hasKey : runpod ? !!st.runpod?.ready : !!(st.cloud?.url && st.cloud?.modelsAt)
  const onCloud = st.target === 'cloud'

  return (
    <div className="cloud">
      <Stage effect="dream" art="cloud" title="Cloud" kicker="Your own GPU · by the second">
        {/* where renders go, switched here as in Render on below, and the guided setup */}
        <div className="stage-panel stage-quick stage-cloud">
          <div className="segmented" role="radiogroup" aria-label="Render on">
            <button role="radio" aria-checked={!onCloud} className={!onCloud ? 'on' : ''} disabled={!!busy} onClick={() => !onCloud || use('local')}>
              This PC
            </button>
            <button role="radio" aria-checked={onCloud} className={onCloud ? 'on' : ''} disabled={!!busy || !setUpDone} title={setUpDone ? '' : 'Set up a cloud first'} onClick={() => onCloud || use('cloud')}>
              Cloud
            </button>
          </div>
          <span className="stage-cloud-status mono small">{busy ? `${busy}…` : onCloud ? wake || `Rendering on ${PROVIDERS.find((p) => p.id === st.provider)?.label}` : 'Rendering on this PC'}</span>
          <button className="btn btn-primary" onClick={() => window.dispatchEvent(new CustomEvent('iv:cloud-wizard'))}>
            Guided setup
          </button>
        </div>
      </Stage>
      <p className="lede">
        No strong graphics card? Render on a cloud GPU instead.
        <span className="lede-small dim">Pick a cloud service below and set it up once; then switch between this PC and the cloud whenever you like.</span>
      </p>
      {/* the hosted cloud beta's waitlist (Privacy.jsx); only there while a signup address exists */}
      {beta?.betaOpen && (
        <section className="block cloud-beta">
          <strong className="cloud-beta-title">Rather not set anything up?</strong>
          <BetaJoin status={beta} setStatus={setBeta} notify={notify} />
        </section>
      )}
      <div className="cloud-guided">
        <button className="btn btn-primary" onClick={() => window.dispatchEvent(new CustomEvent('iv:cloud-wizard'))}>
          Guided setup →
        </button>
        <span className="small dim">A few steps: pick a service, connect it, choose a GPU, set it up, switch it on.</span>
      </div>

      <CloudDash notify={notify} />
      <section className="cloud-control">
        <div className="cloud-control-head">
          <span className="mono label">Render on</span>
          <span className={`cloud-status mono small ${onCloud ? 'on' : ''}`}>
            <span className="cloud-status-dot" />
            {busy ? `${busy}…` : onCloud ? wake || `Rendering on ${PROVIDERS.find((p) => p.id === st.provider)?.label}` : 'Rendering on this PC'}
          </span>
          {setUpDone && !comfyCloud && <ShutDownGpu notify={notify} className="btn btn-small cloud-stop" />}
        </div>
        <div className="cloud-choices two">
          <button className={`cloud-choice ${!onCloud ? 'on' : ''}`} disabled={!!busy} aria-pressed={!onCloud} onClick={() => !onCloud || use('local')}>
            <span className="cloud-choice-name">This PC</span>
            <span className="small dim">Your own graphics card. Free.</span>
          </button>
          <button className={`cloud-choice ${onCloud ? 'on' : ''}`} disabled={!!busy || !setUpDone} aria-pressed={onCloud} title={setUpDone ? undefined : 'Set the cloud service up below first'} onClick={() => onCloud || use('cloud')}>
            <span className="cloud-choice-name">The cloud</span>
            <span className="small dim">{setUpDone ? `${PROVIDERS.find((p) => p.id === st.provider)?.label}, ready` : `Set up ${PROVIDERS.find((p) => p.id === st.provider)?.label} below first`}</span>
          </button>
        </div>

        <div className="cloud-control-head">
          <span className="mono label">Cloud service</span>
          {onCloud && <span className="small dim">Switch to This PC to change it.</span>}
        </div>
        <div className="cloud-choices three">
          {PROVIDERS.map((p) => {
            const ready = p.id === 'comfycloud' ? !!st.comfycloud?.hasKey : p.id === 'runpod' ? !!st.runpod?.ready : !!(st.cloud?.url && st.cloud?.modelsAt)
            return (
              <button key={p.id} className={`cloud-choice small-choice ${st.provider === p.id ? 'on' : ''}`} disabled={!!busy || onCloud} aria-pressed={st.provider === p.id} onClick={() => st.provider === p.id || run('Switching', () => window.ivstudio.cloud.provider(p.id))}>
                <span className="cloud-choice-top">
                  <span className="cloud-choice-name">{p.label}</span>
                  {ready && <span className="mono cloud-ok cloud-ready">Ready</span>}
                </span>
                <span className="small dim">{p.line}</span>
              </button>
            )
          })}
        </div>
      </section>

      {comfyCloud && <ComfyCloudSteps st={st} busy={busy} run={run} notify={notify} refresh={refresh} />}
      {runpod && <RunPodSteps st={st} busy={busy} run={run} notify={notify} refresh={refresh} links={info?.links} />}
      {!runpod && !comfyCloud && (
        <>
          <Step n={1} title="Cloud tools" done={st.toolkit}>
            <p className="small dim">A private copy of Modal's client in Techlit Studio's own folder (about 100 MB). Nothing else on your PC changes.</p>
            {!st.toolkit && (
              <button className="btn btn-small" disabled={!!busy} onClick={() => run('Installing', () => window.ivstudio.cloud.install())}>
                Install the cloud tools
              </button>
            )}
            {st.toolkitUpdate && (
              <p className="small">
                Modal’s client {st.toolkitVersion || ''} updates to {st.toolkitUpdate} by itself before the next setup or render (about a minute).{' '}
                <button className="link-btn" disabled={!!busy} onClick={() => run('Updating the cloud tools', () => window.ivstudio.cloud.install())}>
                  Update now
                </button>
              </p>
            )}
          </Step>

          <Step n={2} title="Modal account" done={!!st.workspace}>
            <ModalAccount st={st} busy={busy} run={run} info={info} notify={notify} onChanged={refresh} />
          </Step>

          <Step n={3} title="GPU and shut-off" done={!!st.cloud?.url}>
            <div className="cloud-gpus">
              {st.gpus.map((g) => (
                <button key={g.id} className={`mode-card ${gpu === g.id ? 'on' : ''}`} onClick={() => setGpu(g.id)}>
                  <span className="mode-name">{g.label}</span>
                  <span className="mono">${g.perHour.toFixed(2)} an hour, by the second</span>
                  <span className="dim small">{g.note}</span>
                </button>
              ))}
            </div>
            <div className="row">
              <span className="row-label">Shut down after</span>
              <div className="segmented">
                {IDLE.map(([s, label]) => (
                  <button key={s} className={idle === s ? 'on' : ''} onClick={() => setIdle(s)}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <p className="small dim">
              With nothing to do for {IDLE.find(([s]) => s === idle)?.[1]}, the GPU switches off and billing stops. Shut down GPU (above) switches it off at once; the top bar's meter shows its time and cost. The next render wakes it again (about 1–3 minutes). Storage for the models is free on Modal (first 1 TiB).
              {chosen && ` A 10-second 2 MP shot takes roughly 3–5 minutes of GPU, about $${((chosen.perHour * 4) / 60).toFixed(2)}.`}
            </p>
          </Step>

          <Step n={4} title="Set up" done={setUpDone}>
            <p className="small dim">
              Builds Techlit Studio's cloud image (ComfyUI and every node pack, matched to this version), downloads the H3 models into your Modal storage (about 60 GB, once), and uploads your characters. The first time takes 20–40 minutes and costs a few cents of CPU time. Run it again after changing GPU or adding characters.
            </p>
            <button className="btn btn-primary" disabled={!!busy || !st.workspace} onClick={setUp}>
              {setUpDone ? 'Set up again' : 'Set up the cloud'}
            </button>
            {st.cloud?.url && (
              <p className="mono small dim">
                {st.cloud.gpu} · shuts down after {Math.round(st.cloud.idleSeconds / 60)} min · {st.cloud.workspace}
              </p>
            )}
          </Step>
        </>
      )}

      {progress && progress.provider === (st.provider || 'modal') && (!progress.finishedAt || Date.now() - progress.finishedAt < 30 * 60 * 1000) ? (
        <SetupProgress progress={progress} log={log} />
      ) : (
        (log.length > 0 || busy) && (
          <pre className="code cloud-log" ref={logEl}>
            {log.join('\n') || 'Starting…'}
          </pre>
        )
      )}

      {!comfyCloud && <CloudModelsStep st={st} busy={busy} run={run} notify={notify} refresh={refresh} />}

      <section className="group cloud-different">
        <div className="group-head">
          <h2>What's different in the cloud</h2>
        </div>
        <div className="group-body">
          <p className="small dim">
            On Comfy Cloud, what works depends on the nodes and models Comfy offers there (the check above lists it); pictures and music use ComfyUI’s own nodes. On Modal and RunPod, nearly everything works as on a PC: shots, sequences, pictures and picture tools, Projects sketches, character design, music, sounds, Cut out, Reframe, Replace, Effects, SeedVR2 and voices (set them up once on the Voices page). Each feature’s models are downloaded into your cloud storage the first time you use it, after Techlit Studio asks. The final DLSS clean-up only runs on Windows, so cloud finals use a 2× AI upscale (Real-ESRGAN) and frame interpolation (RIFE, 48/72/120 fps), or SeedVR2. Live step pictures, Replace’s old engine and New angle stay on PCs. Finished videos download to Videos\Techlit Studio when you open them.
          </p>
        </div>
      </section>
    </div>
  )
}
