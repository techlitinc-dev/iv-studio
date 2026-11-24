import { useState } from 'react'

// The first-run setup wizard: every key the studio needs on one screen — Kimi (writes scripts and shots through
// Hermes, and powers the OpenAI-compatible fallback writer), RunPod (renders everything on a cloud GPU), and an
// optional OpenAI key (used if the prompt writer is switched to OpenAI in Settings). Keys are checked before
// they're kept, and stored sealed by the app; the Kimi key is also handed to Hermes's own config.
export default function SetupWizard({ go, notify, onClose }) {
  const [kimi, setKimi] = useState('')
  const [runpod, setRunpod] = useState('')
  const [openai, setOpenai] = useState('')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [done, setDone] = useState(null)

  async function apply() {
    setError('')
    if (!String(runpod).trim()) return setError('The RunPod key is the render engine on this PC — paste it (or press “Set up later” and add it on the Cloud page).')
    if (!String(kimi).trim()) return setError('The Kimi key drives all the writing (and Hermes) — paste it, or press “Set up later”.')
    setBusy('Checking your keys against Kimi and RunPod…')
    try {
      const rp = await window.ivstudio.cloud.runpodKey(String(runpod).trim())
      const r = await window.ivstudio.setup.wizardKeys({ kimiKey: String(kimi).trim(), openaiKey: String(openai).trim() })
      setDone({ runpod: !!rp?.hasKey, ...r })
      try {
        localStorage.setItem('iv.setupWizard', 'done')
      } catch {}
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy('')
    }
  }

  return (
    <div className="wizard-backdrop" role="dialog" aria-modal="true" aria-label="Set up your studio">
      <div className="wizard-card">
        <p className="mono label">Techlit Studio · first run</p>
        <h2>Set up your studio</h2>
        <p className="small dim">Three keys and everything is live: writing on this PC, rendering on your RunPod. Keys are checked now and kept sealed in the app; the Kimi key is also given to Hermes.</p>
        {done ? (
          <div className="wizard-done">
            <p className="wizard-ok">✓ All set.</p>
            <p className="small">
              RunPod {done.runpod ? '✓' : '—'} · Kimi writer {done.kimi ? '✓' : '—'} · Hermes {done.hermes ? '✓ (its model key is set)' : '— (not installed, skipped)'} · OpenAI {done.openai ? '✓ (saved for the OpenAI writer)' : '— (none given)'}
            </p>
            <p className="small dim">Next: the Cloud page’s guided setup installs ComfyUI and the models on your RunPod volume the first time you render (~60 GB, one time, billed by the second). Before your first render, accept the MiniMax H3 terms in Settings → About.</p>
            <div className="feat-actions">
              <button
                className="btn btn-primary"
                onClick={() => {
                  onClose()
                  go('cloud')
                }}
              >
                Open the Cloud page
              </button>
              <button className="btn" onClick={onClose}>
                Start creating
              </button>
            </div>
          </div>
        ) : (
          <>
            <label className="feat-field">
              <span className="mono small dim">Kimi API key — writes every script, shot and prompt (via Hermes), and powers the fallback writer · kimi.com/code console</span>
              <input type="password" value={kimi} onChange={(e) => setKimi(e.target.value)} placeholder="sk-…" autoComplete="off" />
            </label>
            <label className="feat-field">
              <span className="mono small dim">RunPod API key — renders all video, voices, songs and sounds on a cloud GPU · runpod.io → Settings → API Keys</span>
              <input type="password" value={runpod} onChange={(e) => setRunpod(e.target.value)} placeholder="rpa_…" autoComplete="off" />
            </label>
            <label className="feat-field">
              <span className="mono small dim">OpenAI key — optional, only if you switch the prompt writer to OpenAI in Settings</span>
              <input type="password" value={openai} onChange={(e) => setOpenai(e.target.value)} placeholder="sk-… (optional)" autoComplete="off" />
            </label>
            {error && <p className="wizard-error small">{error}</p>}
            {busy && <p className="mono small dim">{busy}</p>}
            <div className="feat-actions">
              <button className="btn btn-primary" disabled={!!busy} onClick={apply}>
                {busy ? 'Checking…' : 'Check and save'}
              </button>
              <button
                className="btn"
                disabled={!!busy}
                onClick={() => {
                  // "later" means later: don't open by itself again (Settings → "Run the setup wizard" reopens it)
                  try {
                    localStorage.setItem('iv.setupWizard', 'done')
                  } catch {}
                  onClose()
                }}
              >
                Set up later
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
