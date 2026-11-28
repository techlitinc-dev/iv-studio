import { useEffect, useState } from 'react'
import { LiveFrame } from './Live'
import { ask } from './Confirm'
import LivePip from './LivePip'

// The render queue at the foot of the sidebar: what ComfyUI is rendering and what waits, from any page, so the
// person can explore the app while things render. Each of Techlit Studio's items opens its page and can be cancelled;
// anyone else's work on the same ComfyUI shows as "Other ComfyUI work".
const KIND = {
  previews: 'Previews',
  finish: 'Finishing',
  take: 'Sequence take',
  shots: 'Sequence shot',
  retake: 'Retake',
  renderout: 'Render out',
  music: 'Song',
  replace: 'Replace',
  still: 'Picture',
  write_prompt: 'Prompt writer',
  enhance: 'Enhance'
}
const kindLabel = (k) => (k?.startsWith('picture') ? 'Picture' : KIND[k] || 'Render')
const clock = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
const SHOWN = 4

export default function RenderQueue({ remote, notify, open }) {
  const [items, setItems] = useState([])
  const [now, setNow] = useState(Date.now())
  // the floating live preview (LivePip), on or off from the switch at the top of this box; remembered
  const [pip, setPip] = useState(() => {
    try {
      return localStorage.getItem('iv.livePreview') === 'on'
    } catch {
      return false
    }
  })
  // The switch also decides whether renders send step pictures at all (settings.livePreview, which the app and
  // the MCP server read at each render): they cost the GPU a little each step, so off means slightly faster renders.
  const setPipSaved = (on) => {
    setPip(on)
    try {
      localStorage.setItem('iv.livePreview', on ? 'on' : 'off')
    } catch {}
    window.ivstudio.settings.set({ livePreview: on }).catch(() => {})
  }
  // a switch left on before the setting existed turns the step pictures on too
  useEffect(() => {
    if (pip) window.ivstudio.settings.set({ livePreview: true }).catch(() => {})
  }, [])
  useEffect(() => {
    let live = true
    const poll = () =>
      window.ivstudio.queue
        .list()
        .then((q) => live && setItems(q.items))
        .catch(() => live && setItems([]))
    poll()
    const p = setInterval(poll, remote ? 10000 : 2000)
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => {
      live = false
      clearInterval(p)
      clearInterval(t)
    }
  }, [remote])

  async function cancel(item) {
    const ok = await ask({ title: 'Cancel this render?', message: `${item.name || kindLabel(item.kind)} stops ${item.state === 'running' ? 'now; what it rendered so far is lost' : 'and leaves the queue'}.`, confirm: 'Cancel render' })
    if (!ok) return
    try {
      await window.ivstudio.queue.cancel(item.promptId)
      setItems((all) => all.filter((i) => i.promptId !== item.promptId))
    } catch (err) {
      notify(err.message)
    }
  }

  const running = items.filter((i) => i.state === 'running').length
  const waiting = items.length - running
  return (
    <div className={`render-queue ${items.length ? 'busy' : ''}`}>
      <button
        className={`live-switch ${pip ? 'on' : ''}`}
        role="switch"
        aria-checked={pip}
        disabled={!!remote}
        onClick={() => setPipSaved(!pip)}
        title={remote ? 'Live preview is for renders on this PC: its step pictures stream over this PC’s ComfyUI connection, and the cloud has no way to send them yet. Switch rendering to My PC to watch a render live.' : pip ? 'Turn the live preview off: renders started from now on skip the step pictures. Takes you’ve already hunted still finish without rendering again.' : 'Show what’s rendering, step by step, in a corner of every page. Renders started from now on send step pictures; one already running finishes without them. Step pictures use a little GPU time each step, so renders can run slightly slower. Switching it on or off between hunting and finishing doesn’t lose your takes.'}
      >
        <span className="switch-track">
          <span className="switch-knob" />
        </span>
        Live preview
      </button>
      {pip && !remote && <LivePip items={items} now={now} kindLabel={kindLabel} open={open} onOff={() => setPipSaved(false)} />}
      <div className="render-queue-head">
        <span>Queue</span>
        <span className="dim">{items.length ? [running && `${running} rendering`, waiting && `${waiting} waiting`].filter(Boolean).join(' · ') : 'idle'}</span>
      </div>
      {items.slice(0, SHOWN).map((item) => {
        const pct = item.progress?.max ? Math.round((item.progress.value / item.progress.max) * 100) : null
        return (
          <div key={item.promptId} className={`render-queue-item ${item.state}`}>
            <button className="render-queue-open" disabled={!item.ours} onClick={() => open(item)} title={item.ours ? 'Open it' : 'Not started by Techlit Studio'}>
              <span className="render-queue-name">{item.ours ? item.name || kindLabel(item.kind) : 'Other ComfyUI work'}</span>
              <span className="render-queue-state dim">
                {item.ours && item.name ? `${kindLabel(item.kind)} · ` : ''}
                {item.state === 'running' ? (item.progress ? `step ${item.progress.value}/${item.progress.max}` : 'rendering') : `waiting · #${item.position}`}
                {item.state === 'running' && item.startedAt ? ` · ${clock(now - item.startedAt)}` : ''}
              </span>
              {item.state === 'running' && (
                <span className="render-queue-bar">
                  <span style={{ width: `${pct ?? 0}%` }} />
                </span>
              )}
              {/* the small picture here only while the floating live preview is off */}
              {item.state === 'running' && item.ours && !pip && <LiveFrame promptId={item.promptId} compact />}
            </button>
            {item.ours && (
              <button className="render-queue-x" title="Cancel this render" onClick={() => cancel(item)}>
                ×
              </button>
            )}
          </div>
        )
      })}
      {items.length > SHOWN && <div className="render-queue-more dim">+ {items.length - SHOWN} more waiting</div>}
    </div>
  )
}
