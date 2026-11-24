import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import './IVWorkspace.css'
import { HivemindMark, HivemindLoading, handoffBeat } from './HivemindMark'

const NAMES = { outreach: 'Techlit Outreach', studio: 'Techlit Studio', signal: 'Techlit Signal' }
const EMPTY = { name: '', website: '', offer: '', audience: '', voice: '', visual: '', location: '', goal: '', accent: '#bb2349', logo: null }

// launcher: what to show instead of the red Techlit Link button (Techlit Studio passes its title-bar logo, which then
// glows softly and opens Techlit Link when clicked).
export default function IVWorkspace({ api, appId, nativeId, nativeName, onOpen, projectId, disabled = false, launcher = null }) {
  const [open, setOpen] = useState(false), [state, setState] = useState(null), [tab, setTab] = useState('work')
  const [selected, setSelected] = useState(null), [editing, setEditing] = useState(null)
  const [caption, setCaption] = useState(''), [channel, setChannel] = useState('linkedin'), [assets, setAssets] = useState([])
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('')
  const [transition, setTransition] = useState('')
  // The Hivemind button opens a short pop-up: what Techlit Link is, then Open Techlit Link (installed) or Get Techlit Link.
  const [intro, setIntro] = useState(null)
  const opened = useRef(null), active = useRef(false), onOpenRef = useRef(onOpen), stateRef = useRef(null), dialogRef = useRef(null)
  onOpenRef.current = onOpen
  const load = async () => { const next = await api('state'); setState(next); stateRef.current = next; return next }
  const act = async (fn, label = '') => {
    if (active.current) return
    active.current = true; setBusy(true); setError(''); setNotice(''); setTransition(label)
    try { await Promise.all([fn(), label ? handoffBeat() : Promise.resolve()]); await load() } catch (e) { setError(e.message); setOpen(true) } finally { active.current = false; setBusy(false); setTransition('') }
  }
  const openDraft = id => act(async () => { const receipt = await api('receive', { id }); await onOpenRef.current?.(receipt); setOpen(false) }, `Preparing your draft in ${NAMES[appId]}`)
  useEffect(() => {
    if (disabled) return
    let stopped = false
    const refresh = async () => {
      try {
        const next = await api('state'); if (stopped) return
        setState(next); stateRef.current = next
        if (next.pending && !active.current && next.pendingRequest !== opened.current) {
          opened.current = next.pendingRequest; setSelected(next.pending); setOpen(true)
          openDraft(next.pending)
        }
      } catch { /* The workspace is optional; the other app features stay available. */ }
    }
    refresh(); const timer = setInterval(refresh, 4000)
    return () => { stopped = true; clearInterval(timer) }
  }, [api, disabled])
  useEffect(() => {
    const show = e => { setSelected(e.detail?.id || null); setTab('work'); setOpen(true); load().catch(e => setError(e.message)) }
    window.addEventListener('iv:workspace', show)
    return () => window.removeEventListener('iv:workspace', show)
  }, [api])
  useEffect(() => {
    if (!open) return
    const previous = document.activeElement
    const timer = setTimeout(() => dialogRef.current?.querySelector('button')?.focus(), 0)
    const key = e => {
      if (e.key === 'Escape' && !busy) { e.preventDefault(); setOpen(false) }
      if (e.key === 'Tab') {
        const items = [...(dialogRef.current?.querySelectorAll('button:not(:disabled),input,textarea,select,[href]') || [])].filter(el => el.offsetParent !== null)
        const first = items[0], last = items.at(-1)
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus() }
        if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus() }
      }
    }
    document.addEventListener('keydown', key)
    return () => { clearTimeout(timer); document.removeEventListener('keydown', key); previous?.focus?.() }
  }, [open, busy])
  const h = state?.handoffs.find(x => x.id === selected)
  // The business active across the Techlit apps (chosen in Techlit Link), shown on the button.
  const activeName = state?.active?.brandId ? state.brands.find(b => b.id === state.active.brandId)?.name || '' : ''
  const choose = item => { setSelected(item.id); setCaption(item.brief.caption || ''); setAssets(item.assets); setChannel(['facebook','instagram','linkedin','x','threads','tiktok','youtube','pinterest','google'].includes(item.brief.channel.toLowerCase()) ? item.brief.channel.toLowerCase() : 'linkedin') }
  const showWorkspace = () => {
    setOpen(true); setError(''); load().then(s => {
      const current = projectId && s.handoffs.find(x => x.receipt?.id === projectId)
      if (current) choose(current)
    }).catch(e => setError(e.message))
  }
  const showIntro = () => { setIntro({ loading: true }); api('hivemind').then(info => setIntro(info)).catch(e => setIntro({ installed: false, problem: e.message })) }
  const introAct = async (method) => {
    setIntro(previous => ({ ...previous, busy: true, problem: '' }))
    try { await api(method); setIntro(null) } catch (e) { setIntro(previous => ({ ...previous, busy: false, problem: e.message })) }
  }
  useEffect(() => {
    if (!intro) return
    const key = e => { if (e.key === 'Escape') setIntro(null) }
    document.addEventListener('keydown', key)
    return () => document.removeEventListener('keydown', key)
  }, [intro])
  return <>
    {launcher
      ? <button type="button" className="ivw-launch-logo" onClick={showIntro} disabled={disabled} aria-label="Open Techlit Link" title={disabled ? 'Techlit Link is off in Incognito' : `Techlit Link: continue across your Techlit apps${activeName ? `. Working on ${activeName}` : ''}`}>{launcher}</button>
      : <button type="button" className="ivw-launch" onClick={showIntro} disabled={disabled} title={disabled ? 'Shared workspace is off in Incognito' : 'Continue across your Techlit apps'}><HivemindMark size="small"/><span>Techlit Link</span>{activeName && <em className="ivw-active" title={`Working on ${activeName}. Switch profiles in Techlit Link.`}>{activeName}</em>}</button>}
    <HivemindLoading label={transition}/>
    {intro && createPortal(<div className="ivw-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setIntro(null) }}>
      <section className="ivw-intro" role="dialog" aria-modal="true" aria-labelledby="ivw-intro-title">
        <button className="ivw-close" aria-label="Close" onClick={() => setIntro(null)}>×</button>
        <HivemindMark active/>
        <small>ONE PROFILE. YOUR TECHLIT APPS.</small>
        <h1 id="ivw-intro-title">Techlit Link</h1>
        <p>Techlit Link sits on your desktop and connects your Techlit apps.</p>
        <ul>
          <li><b>One profile everywhere.</b> Pick the profile you're working on once and every Techlit app follows it, with the same memory of you and that profile.</li>
          <li><b>Just ask.</b> Its chat runs on your own Claude or ChatGPT and does the work in the right app while you watch. Anything that needs your OK waits for you.</li>
          <li><b>Pick up where you left off.</b> Handoffs between the apps are one click away.</li>
        </ul>
        {activeName && <p className="ivw-intro-active">Working on <b>{activeName}</b></p>}
        {intro.problem && <p className="ivw-error" role="alert">{intro.problem}</p>}
        <div className="ivw-intro-actions">
          {intro.loading ? <button className="ivw-primary" disabled>Checking…</button>
            : intro.installed ? <button className="ivw-primary" disabled={intro.busy} onClick={() => introAct('openHivemind')}>{intro.busy ? 'Opening…' : 'Open Techlit Link'}</button>
            : <button className="ivw-primary" disabled={intro.busy} onClick={() => introAct('getHivemind')}>Get Techlit Link ↗</button>}
          <button className="ivw-quiet" onClick={() => { setIntro(null); showWorkspace() }}>Handoffs in this app</button>
        </div>
        {!intro.loading && !intro.installed && <p className="ivw-note">Free for Techlit users. Opens the DD'S Techlit AI Solutions downloads page.</p>}
      </section>
    </div>, document.body)}
    {open && createPortal(<div className="ivw-backdrop" onMouseDown={e => { if (e.target === e.currentTarget && !busy) setOpen(false) }}>
      <section className="ivw-panel" ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="ivw-title">
        <header className="ivw-header"><div className="ivw-brand-heading"><HivemindMark active/><div><small>ONE PROFILE. YOUR TECHLIT APPS.</small><h1 id="ivw-title">Techlit Link</h1><p>Carry the context. Keep creating.</p></div></div><button className="ivw-close" aria-label="Close Techlit Link" onClick={() => setOpen(false)} disabled={busy}>×</button></header>
        <div className="ivw-apps">{Object.keys(NAMES).map(id => <div key={id} className={id === appId ? 'current' : ''}><b>{NAMES[id]}</b><span>{id === appId ? 'You are here' : state?.apps.find(a => a.id === id)?.ready ? 'Connected on this PC' : 'Update and open to connect'}</span></div>)}</div>
        <nav className="ivw-tabs" aria-label="Workspace sections"><button aria-pressed={tab === 'work'} onClick={() => setTab('work')}>Connected work</button><button aria-pressed={tab === 'brands'} onClick={() => setTab('brands')}>Shared profiles</button></nav>
        <div className="ivw-body">
          {error && <p className="ivw-error" role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
          {!!state?.conflicts.length && <div className="ivw-conflicts"><b>A profile changed in two apps.</b>{state.conflicts.map(c => <div key={c.localId}><p>{c.name}: choose which version to keep.</p><button disabled={busy} onClick={() => act(() => api('useBrand', { brandId: c.brandId, localId: c.localId }))}>Use shared profile here</button><button disabled={busy} onClick={() => act(() => api('shareNative', { localId: c.localId, preferLocal: true }))}>Share this app’s profile</button></div>)}</div>}
          {tab === 'work' && <div className="ivw-work">
            <aside className="ivw-worklist"><h2>Continue where you left off</h2>{!state?.handoffs.length && <p>In Outreach, create a content brief and choose Create in Techlit Studio. It will appear here with the profile and research attached.</p>}{state?.handoffs.map(item => <button className={item.id === h?.id ? 'selected' : ''} key={item.id} onClick={() => choose(item)}><small>{NAMES[item.source]} → {NAMES[item.target]}</small><b>{item.brief.title}</b><span>{item.brandSnapshot.name} · {item.status === 'draft-ready' ? 'Draft prepared' : 'Ready to continue'}</span></button>)}</aside>
            <article className="ivw-detail">{h ? <><small>{h.brief.campaign || 'CREATIVE HANDOFF'}</small><h2>{h.brief.title}</h2><p className="ivw-brandline">{state.brands.find(b => b.id === h.brandId)?.name || h.brandSnapshot.name} · {h.brief.channel}</p><p>{h.brief.goal}</p><p>{h.brief.angle}</p><details><summary>Profile context and source evidence</summary><p><b>Offer:</b> {h.brief.offer || h.brandSnapshot.offer}</p><p><b>Audience:</b> {h.brief.audience || h.brandSnapshot.audience}</p><p><b>Voice:</b> {h.brandSnapshot.voice}</p>{h.brief.evidence.map((e, i) => <div key={i}><b>{e.title}</b><p>{e.excerpt}</p><span className="ivw-source">{e.url}</span></div>)}</details>
              {h.assets.length > 0 && <ul className="ivw-files">{h.assets.map(a => <li key={a.id}>{a.name} <small>{Math.ceil(a.bytes / 1024)} KB</small></li>)}</ul>}
              {h.target === appId ? <button className="ivw-primary" disabled={busy} onClick={() => openDraft(h.id)}>{h.receipt ? 'Open prepared draft' : 'Prepare and open draft'}</button> : <button className="ivw-primary" disabled={busy} onClick={() => act(() => api('open', { id: h.id }), `Opening ${NAMES[h.target]}`)}>Continue in {NAMES[h.target]} ↗</button>}
              {appId === 'studio' && h.target === 'studio' && h.receipt && <div className="ivw-forward"><small>NEXT / TECHLIT SIGNAL</small><h3>Prepare your social draft</h3><p>Attach the finished files you want to use and review the caption. Signal receives an unapproved draft.</p><label>Caption<textarea rows={4} value={caption} onChange={e => setCaption(e.target.value)} maxLength={12000}/></label><label>Network<select value={channel} onChange={e => setChannel(e.target.value)}>{['linkedin','instagram','facebook','x','threads','tiktok','youtube','pinterest','google'].map(c => <option key={c}>{c}</option>)}</select></label><button disabled={busy} onClick={() => act(async () => { const chosen = await api('pickAssets'); setAssets(previous => [...new Map([...previous, ...chosen].map(a => [a.id,a])).values()].slice(0,10)) })}>Choose finished pictures or videos</button>{assets.map(a => <div className="ivw-file" key={a.id}><span>{a.name}</span><button aria-label={`Remove ${a.name} from handoff`} onClick={() => setAssets(assets.filter(x => x.id !== a.id))}>×</button></div>)}<button className="ivw-primary" disabled={busy || (!caption.trim() && !assets.length)} onClick={() => act(async () => { await api('forward', { id: h.id, caption, channel, assets: assets.map(a => a.id) }); setNotice('Signal is opening your draft. Review it there before approving.') }, 'Opening your draft in Techlit Signal')}>Prepare in Techlit Signal ↗</button></div>}
              <p className="ivw-note">Importing creates a draft. It does not generate media, spend credits, approve, schedule or publish.</p></> : <div className="ivw-empty"><HivemindMark active/><h2>Your work travels with you.</h2><p>Choose a handoff to see its profile, creative direction, files and next step.</p></div>}</article>
          </div>}
          {tab === 'brands' && <>
            <div className="ivw-brand-actions"><p>Linked profile basics stay in sync on this PC. App-specific rules, accounts and credentials stay in their own app.</p>{nativeId && <button disabled={busy} onClick={() => act(async () => { const b = await api('shareNative', { localId: nativeId }); setEditing(b); setNotice('Profile connected to Techlit Link.') })}>Share {nativeName || 'current profile'}</button>}<button onClick={() => setEditing({ ...EMPTY })}>New shared profile</button></div>
            <div className="ivw-brands">{state?.brands.map(b => <button key={b.id} onClick={() => setEditing(b)}>{b.logoPreview ? <img src={b.logoPreview} alt=""/> : <span className="ivw-initial">{b.name.slice(0,2)}</span>}<b>{b.name}</b><small>Updated in {NAMES[b.updatedBy]}</small></button>)}</div>
            {editing && <form className="ivw-brand-form" onSubmit={e => { e.preventDefault(); act(async () => { const b = await api('saveBrand', { brand: editing, revision: editing.revision }); setEditing(b); setNotice('Shared profile saved across your Techlit apps.') }) }}><h2>{editing.id ? 'Edit shared profile' : 'Create shared profile'}</h2><div className="ivw-fields">{[['name','Profile name'],['website','Website'],['offer','What you offer'],['audience','Who you help'],['voice','Brand voice'],['visual','Visual direction'],['location','Location'],['goal','Goal']].map(([key,label]) => <label key={key}>{label}<textarea rows={key === 'name' || key === 'website' ? 1 : 2} required={key === 'name'} maxLength={key === 'name' ? 160 : 2000} value={editing[key] || ''} onChange={e => setEditing({ ...editing, [key]: e.target.value })}/></label>)}</div><label>Brand color<input type="color" value={editing.accent || '#bb2349'} onChange={e => setEditing({ ...editing, accent: e.target.value })}/></label><div className="ivw-brand-actions"><button type="button" disabled={busy} onClick={() => act(async () => { const logo = await api('pickLogo'); if (logo) setEditing({ ...editing, logo: logo.id, logoPreview: logo.preview }) })}>Choose logo</button>{editing.logoPreview && <img className="ivw-logo" src={editing.logoPreview} alt="Selected profile logo"/>}<button type="submit" className="ivw-primary" disabled={busy}>Save shared profile</button>{editing.id && appId !== 'studio' && <button type="button" disabled={busy} onClick={() => act(async () => { const result = await api('useBrand', { brandId: editing.id }); await onOpenRef.current?.({ kind:'brand', ...result }); setOpen(false) })}>Use in {NAMES[appId]}</button>}</div></form>}
          </>}
        </div><footer className="ivw-footer">LOCAL ON THIS PC <span>Profile context and selected files only · No new account required</span>{busy && <b role="status">Working…</b>}</footer>
      </section>
    </div>, document.body)}
  </>
}
