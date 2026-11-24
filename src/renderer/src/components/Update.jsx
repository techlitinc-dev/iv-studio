import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { SetCard, SetField, Pill } from './SettingsKit'
import { NEWS } from '../news'

// Techlit Studio's own updates: the main process checks GitHub on launch and every six hours and downloads a
// new version in the background. These show where it's at, and install it with one click.
export function useUpdate() {
  const [state, setState] = useState(null)
  useEffect(() => {
    window.ivstudio.update.state().then(setState)
    return window.ivstudio.update.onChange(setState)
  }, [])
  return state
}

const install = (notify) => window.ivstudio.update.install().catch((err) => notify(err.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')))

// The update pop-up opens from anywhere (the sidebar's button, Settings → Updates) through this event.
export const openUpdate = () => window.dispatchEvent(new CustomEvent('iv:update-dialog'))

// In the sidebar's foot, in place of the version number. It also hosts the update pop-up, and says what a ComfyUI
// update done with Techlit Studio's own did, once Techlit Studio has restarted.
export function UpdateButton({ notify }) {
  const u = useUpdate()
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const show = () => setOpen(true)
    window.addEventListener('iv:update-dialog', show)
    window.ivstudio.update.notice?.().then((n) => n && notify(`Updated with Techlit Studio ${n.version}: ${n.text}`, n.ok ? 'info' : undefined), () => {})
    return () => window.removeEventListener('iv:update-dialog', show)
  }, [])
  // drawn on the page itself, not inside the sidebar (whose foot is all small capitals)
  const dialog = open && u?.status === 'ready' && createPortal(<UpdateDialog u={u} onClose={() => setOpen(false)} />, document.body)
  if (u?.status === 'ready')
    return (
      <>
        <button className="nav-update ready" onClick={() => setOpen(true)} title={`Techlit Studio ${u.available} is downloaded. Choose to update just Techlit Studio, or ComfyUI and its node packs too.`}>
          ↻ Update to {u.available}
        </button>
        {dialog}
      </>
    )
  if (u?.status === 'available')
    return (
      <button className="nav-update ready" onClick={() => install(notify)} title={u.portable ? `Techlit Studio ${u.available} is out, but this copy can't install it itself.${u.why ? ` ${u.why}` : ''} Opens its download page: unzip the new portable zip over this folder; the data folder stays.` : `Techlit Studio ${u.available} is out. Opens its download page: install it over this copy.${u.why ? ` ${u.why}` : ''}`}>
        ↓ Get {u.available}
      </button>
    )
  if (u?.status === 'downloading')
    return (
      <span className="nav-update" title="Downloading in the background">
        Updating to {u.available} · {Math.round(u.percent || 0)}%
      </span>
    )
  return <span className="nav-version">v{u?.version}</span>
}

const when = (iso) => (iso ? new Date(iso).toLocaleString() : null)

export function UpdateSettings({ notify, n }) {
  const u = useUpdate()
  const [checking, setChecking] = useState(false)
  if (!u) return null
  const line = {
    dev: 'This is a development copy; the installed app checks for updates.',
    idle: 'Checks GitHub for a new version on launch and every six hours.',
    checking: 'Checking for a new version…',
    current: `You have the newest version.${u.checkedAt ? ` Checked ${when(u.checkedAt)}.` : ''}`,
    available: u.portable
      ? `Techlit Studio ${u.available} is out, but this copy can't install it itself.${u.why ? ` ${u.why}` : ''} Download Techlit-Studio-Portable-win-x64.zip and unzip it over this folder; your data folder beside Techlit Studio.exe stays as it is.`
      : u.why
        ? `Techlit Studio ${u.available} is out, but this copy can't install it itself. ${u.why}`
        : `Techlit Studio ${u.available} is out. Download it and install it over this copy.`,
    downloading: `Downloading Techlit Studio ${u.available}… ${Math.round(u.percent || 0)}%`,
    ready: `Techlit Studio ${u.available} is downloaded. Restart to install it, or it installs when you next quit.`,
    error: `Couldn't check for updates: ${u.error}`
  }[u.status]
  async function check() {
    setChecking(true)
    try {
      await window.ivstudio.update.check()
    } finally {
      setChecking(false)
    }
  }
  const tone = { current: 'ok', ready: 'ok', available: 'warn', error: 'warn' }[u.status] || ''
  const pill = { current: 'Up to date', ready: 'Ready to install', available: `${u.available} is out`, downloading: `Downloading ${Math.round(u.percent || 0)}%`, checking: 'Checking', error: 'Check failed', dev: 'Development copy' }[u.status]
  const button =
    u.status === 'ready' ? (
      <button className="btn btn-small btn-primary" onClick={openUpdate}>
        Update to {u.available}
      </button>
    ) : u.status === 'available' ? (
      <button className="btn btn-small btn-primary" onClick={() => install(notify)}>
        Download {u.available}
      </button>
    ) : (
      <button className="btn btn-small" disabled={u.status === 'dev' || u.status === 'downloading' || checking || u.status === 'checking'} onClick={check}>
        {checking || u.status === 'checking' ? 'Checking…' : 'Check for updates'}
      </button>
    )
  return (
    <SetCard id="updates" n={n} title="Updates" sub={u.portable ? 'Portable copy: new versions download in the background and install with one click, keeping your data folder.' : u.manual ? 'Techlit Studio tells you when a new version is out.' : 'New versions download in the background and install with one click.'} aside={pill && <Pill tone={tone}>{pill}</Pill>}>
      <SetField label="This version" hint={line}>
        <div className="set-inline">
          <span className="set-big mono">v{u.version}</span>
          {button}
        </div>
      </SetField>
      {NEWS.slice(0, 4).map((v) => (
        <SetField key={v.version} label={v.version === u.version ? 'What’s new' : `In ${v.version}`} tag={v.version === u.version ? v.version : null}>
          <ul className="set-news">
            {v.items.map((n) => (
              <li key={n.text}>{n.text}</li>
            ))}
          </ul>
        </SetField>
      ))}
    </SetCard>
  )
}

// The update pop-up: update just Techlit Studio, or ComfyUI and every node pack as well (appupdate.js). ComfyUI is
// checked when Techlit Studio's update finishes downloading; the pop-up shows that check, or runs it if it hasn't.
const PHASES = {
  starting: 'Getting ComfyUI ready…',
  snapshot: 'Saving a snapshot of ComfyUI, so Undo can put it back…',
  updating: 'Updating ComfyUI and your node packs…',
  restarting: 'Restarting ComfyUI…',
  done: 'ComfyUI is updated.',
  installing: 'Restarting Techlit Studio into its new version…'
}
export function UpdateDialog({ u, onClose }) {
  const [comfy, setComfy] = useState(null)
  const [progress, setProgress] = useState(null)
  const [running, setRunning] = useState(null) // 'iv' | 'all'
  const [error, setError] = useState(null)
  const [showPacks, setShowPacks] = useState(false)
  useEffect(() => {
    window.ivstudio.update.comfyState().then(setComfy, () => {})
    window.ivstudio.update.comfyCheck().then(setComfy, () => {})
    const offA = window.ivstudio.update.onComfy(setComfy)
    const offB = window.ivstudio.update.onProgress(setProgress)
    return () => (offA?.(), offB?.())
  }, [])
  useEffect(() => {
    const esc = (e) => e.key === 'Escape' && !running && onClose()
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [running])
  async function go(withComfy) {
    setRunning(withComfy ? 'all' : 'iv')
    setError(null)
    setProgress(null)
    try {
      await window.ivstudio.update.run({ withComfy })
    } catch (err) {
      setError(err.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, ''))
      setRunning(null)
    }
  }
  const sum = comfy?.summary
  const checking = !comfy || comfy.status === 'checking' || comfy.status === 'idle'
  const hasComfy = comfy?.status === 'done' && sum?.kind === 'updates'
  const step = progress?.phase === 'updating' && progress.total ? ` ${progress.done || 0} of ${progress.total}` : ''
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && !running && onClose()}>
      <div className="modal update-dialog" role="dialog" aria-label="Update Techlit Studio">
        <div className="update-head">
          <span className="mono label">Update ready</span>
          <h2>Techlit Studio {u.available}</h2>
          <span className="small dim">You have {u.version}. Anything open is saved; renders keep going in ComfyUI.</span>
        </div>
        {u.notes && (
          <ul className="update-notes small">
            {u.notes.split(String.fromCharCode(10)).map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
        )}
        <section className={`update-comfy ${hasComfy ? 'has' : ''}`}>
          <span className="mono label">ComfyUI and node packs</span>
          {checking && <p className="small dim">Checking ComfyUI and your node packs for updates… This can take a minute.</p>}
          {!checking && comfy.status === 'error' && (
            <p className="small">
              Couldn’t check ComfyUI: {comfy.error}{' '}
              <button className="link-btn mono" onClick={() => window.ivstudio.update.comfyCheck({ force: true }).then(setComfy, () => {})}>
                Check again
              </button>
            </p>
          )}
          {!checking && sum && <p className="small">{sum.text}</p>}
          {hasComfy && sum.packs.length > 0 && (
            <>
              <button className="link-btn mono small" aria-expanded={showPacks} onClick={() => setShowPacks((v) => !v)}>
                {showPacks ? 'Hide' : 'Show'} the {sum.packs.length} node pack{sum.packs.length > 1 ? 's' : ''}
              </button>
              {showPacks && (
                <ul className="update-packs mono small">
                  {sum.packs.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              )}
            </>
          )}
          {hasComfy && sum.desktop && <p className="small dim">The ComfyUI desktop app updates ComfyUI itself; Techlit Studio updates its node packs.</p>}
          {hasComfy && <p className="small dim">Techlit Studio saves a snapshot first; Undo in Settings → Setup → ComfyUI updates puts it all back. Nothing can render while it updates.</p>}
        </section>
        {running && (
          <p className="update-progress mono small" role="status">
            {PHASES[progress?.phase] ? `${PHASES[progress.phase]}${step}` : running === 'all' ? PHASES.starting : PHASES.installing}
          </p>
        )}
        {error && (
          <p className="update-error small" role="alert">
            {error}
          </p>
        )}
        <div className="update-actions">
          <button className="btn btn-small" disabled={!!running} onClick={onClose}>
            Later
          </button>
          <span className="update-spacer" />
          <button className={`btn btn-small ${hasComfy ? '' : 'btn-primary'}`} disabled={!!running} onClick={() => go(false)}>
            {hasComfy || checking ? 'Update just Techlit Studio' : 'Update Techlit Studio'}
          </button>
          {(hasComfy || checking) && (
            <button className="btn btn-primary update-all" disabled={!!running || checking} onClick={() => go(true)} title={checking ? 'Checking ComfyUI first…' : ''}>
              {checking ? 'Checking ComfyUI…' : 'Update Techlit Studio, ComfyUI and nodes'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
